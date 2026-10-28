import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { login, userFromToken } from './auth.js';
import * as pagos from './pagos.js';

const MAX_FOTO = 5 * 1024 * 1024;
const PERIOD = '(\\d{4}-(?:0[1-9]|1[0-2]))';

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'archivo muy grande')); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function json(req) {
  const b = await readBody(req, 64 * 1024);
  try { return b.length ? JSON.parse(b) : {}; } catch { throw new HttpError(400, 'JSON inválido'); }
}

const or404 = (v) => { if (v == null || v === false) throw new HttpError(404, 'no encontrado'); return v; };

export function createServer({ db, dataDir, readReceipt, handleChat }) {
  const fotos = join(dataDir, 'fotos');
  mkdirSync(fotos, { recursive: true });

  const routes = [
    ['GET', /^\/api\/payments$/, (u) => pagos.listPayments(db, u.id)],
    ['POST', /^\/api\/payments$/, async (u, req) => pagos.createPayment(db, u.id, await json(req))],
    ['PATCH', /^\/api\/payments\/(\d+)$/, async (u, req, [id]) => or404(pagos.updatePayment(db, u.id, +id, await json(req)))],
    ['DELETE', /^\/api\/payments\/(\d+)$/, (u, req, [id]) => ({ ok: or404(pagos.deletePayment(db, u.id, +id)) })],
    ['POST', new RegExp(`^/api/payments/(\\d+)/periods/${PERIOD}/amount$`), async (u, req, [id, period]) =>
      or404(pagos.setAmount(db, u.id, +id, period, (await json(req)).cents))],
    ['POST', new RegExp(`^/api/payments/(\\d+)/periods/${PERIOD}/receipt$`), async (u, req, [id, period]) => {
      or404(pagos.listPayments(db, u.id).find((p) => p.id === +id));
      const img = await readBody(req, MAX_FOTO);
      if (!img.length) throw new HttpError(400, 'falta la imagen');
      const file = `${randomUUID()}.jpg`;
      writeFileSync(join(fotos, file), img);
      const { cents } = await readReceipt(img);
      const r = or404(pagos.addPayment(db, u.id, +id, period, { cents, file, read_cents: cents }));
      return cents == null ? { needs_amount: true, receipt_id: r.receipt_id } : { ...r, read_cents: cents };
    }],
    ['POST', /^\/api\/receipts\/(\d+)\/amount$/, async (u, req, [rid]) => {
      const r = or404(pagos.completeReceipt(db, u.id, +rid, (await json(req)).cents));
      if (r === 'ya') throw new HttpError(409, 'ese comprobante ya tiene monto');
      return r;
    }],
    ['GET', /^\/api\/receipts\/(\d+)\/photo$/, (u, req, [rid]) =>
      ({ __file: join(fotos, or404(pagos.receiptFile(db, u.id, +rid))) })],
    ['GET', /^\/api\/reminders$/, (u) => pagos.remindersFor(db, u.id)],
    ['POST', /^\/api\/chat$/, async (u, req) => handleChat(db, u, String((await json(req)).text ?? ''))],
  ];

  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (req.method === 'POST' && path === '/api/login') {
        const { name, password } = await json(req);
        const r = login(db, name, password);
        return r ? send(200, r) : send(401, { error: 'usuario o contraseña incorrectos' });
      }
      const user = userFromToken(db, req.headers.authorization?.replace(/^Bearer /, ''));
      if (!user) return send(401, { error: 'no autorizado' });
      for (const [method, re, fn] of routes) {
        const m = req.method === method && path.match(re);
        if (!m) continue;
        const out = await fn(user, req, m.slice(1));
        if (out?.__file) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(readFileSync(out.__file)); }
        return send(200, out);
      }
      send(404, { error: 'no encontrado' });
    } catch (e) {
      if (e.status) return send(e.status, { error: e.message });
      if (/inválid|requerido/.test(e.message)) return send(400, { error: e.message });
      console.error(e);
      send(500, { error: 'error interno' });
    }
  });
}

// Arranque real: `node src/server.js` (en tests solo se importa createServer).
if (process.argv[1]?.endsWith('server.js')) {
  const { openDb } = await import('./db.js');
  const { readReceipt } = await import('./comprobante.js');
  const { handleChat } = await import('./chat.js');
  const dataDir = process.env.JARVIS_DATA ?? './data';
  mkdirSync(dataDir, { recursive: true });
  const port = Number(process.env.PORT ?? 3019);
  createServer({ db: openDb(join(dataDir, 'jarvis.db')), dataDir, readReceipt, handleChat })
    .listen(port, '0.0.0.0', () => console.log(`jarvis-api en :${port}`));
}
