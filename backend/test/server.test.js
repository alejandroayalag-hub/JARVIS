import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { addUser } from '../src/auth.js';
import { createServer } from '../src/server.js';

let srv, base, dir, alex, tere, leido = { cents: 450000 };

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jarvis-'));
  const db = openDb(':memory:');
  const pa = addUser(db, 'Alex'), pt = addUser(db, 'Tere');
  srv = createServer({ db, dataDir: dir, readReceipt: async () => leido, handleChat: async (_db, u, t) => ({ reply: `${u.name}:${t}` }) });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  alex = (await call('POST', '/api/login', { name: 'Alex', password: pa })).body.token;
  tere = (await call('POST', '/api/login', { name: 'Tere', password: pt })).body.token;
});
after(() => { srv.close(); rmSync(dir, { recursive: true }); });

async function call(method, path, body, token, raw) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = 'image/jpeg';
  const res = await fetch(base + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

const mes = () => new Date().toISOString().slice(0, 7);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test('sin token 401; login malo 401', async () => {
  assert.equal((await call('GET', '/api/payments')).status, 401);
  assert.equal((await call('POST', '/api/login', { name: 'Alex', password: 'x' })).status, 401);
});

test('foto y pago personal de Alex son 404 para Tere', async () => {
  const p = (await call('POST', '/api/payments', { name: 'Doctor', shared: false, pay_day: 28 }, alex)).body;
  const up = await call('POST', `/api/payments/${p.id}/periods/${mes()}/receipt`, null, alex, jpg);
  assert.equal(up.status, 200);
  assert.equal((await call('GET', `/api/receipts/${up.body.receipt_id}/photo`, null, tere)).status, 404);
  assert.equal((await call('GET', `/api/receipts/${up.body.receipt_id}/photo`, null, alex)).body.length, jpg.length);
  assert.equal((await call('PATCH', `/api/payments/${p.id}`, { name: 'x' }, tere)).status, 404);
  assert.equal((await call('POST', `/api/payments/${p.id}/periods/${mes()}/amount`, { cents: 5 }, tere)).status, 404);
});

test('comprobante leído paga; sin leer pide monto y luego suma', async () => {
  const p = (await call('POST', '/api/payments', { name: 'Walmart', shared: true, pay_day: 28 }, alex)).body;
  await call('POST', `/api/payments/${p.id}/periods/${mes()}/amount`, { cents: 450000 }, tere);
  const ok = await call('POST', `/api/payments/${p.id}/periods/${mes()}/receipt`, null, tere, jpg);
  assert.equal(ok.body.remaining_cents, 0);
  const list = (await call('GET', '/api/payments', null, alex)).body;
  assert.equal(list.find((x) => x.id === p.id).status, 'pagado');

  const q = (await call('POST', '/api/payments', { name: 'Luz', shared: true, pay_day: 28, fixed_cents: 90000 }, alex)).body;
  leido = { cents: null };
  const r = await call('POST', `/api/payments/${q.id}/periods/${mes()}/receipt`, null, alex, jpg);
  assert.equal(r.body.needs_amount, true);
  const fin = await call('POST', `/api/receipts/${r.body.receipt_id}/amount`, { cents: 90000 }, alex);
  assert.equal(fin.body.remaining_cents, 0);
  assert.equal((await call('POST', `/api/receipts/${r.body.receipt_id}/amount`, { cents: 90000 }, alex)).status, 409);
  leido = { cents: 450000 };
});

test('imagen de más de 5 MB es 413', async () => {
  const p = (await call('POST', '/api/payments', { name: 'Grande', pay_day: 28 }, alex)).body;
  const r = await call('POST', `/api/payments/${p.id}/periods/${mes()}/receipt`, null, alex, Buffer.alloc(6 * 1024 * 1024));
  assert.equal(r.status, 413);
});

test('datos inválidos 400, ruta desconocida 404, periodo mal formado 400', async () => {
  assert.equal((await call('POST', '/api/payments', { name: '', pay_day: 5 }, alex)).status, 400);
  assert.equal((await call('GET', '/api/nada', null, alex)).status, 404);
  assert.equal((await call('POST', '/api/payments/1/periods/../amount', { cents: 1 }, alex)).status, 404);
  assert.equal((await call('POST', '/api/payments/1/periods/2026-13x/amount', { cents: 1 }, alex)).status, 404);
});

test('reminders y chat responden', async () => {
  assert.ok(Array.isArray((await call('GET', '/api/reminders', null, tere)).body));
  assert.equal((await call('POST', '/api/chat', { text: 'hola' }, tere)).body.reply, 'Tere:hola');
});

test('historial de comprobantes del pago, solo visible al dueño', async () => {
  const p = (await call('POST', '/api/payments', { name: 'Hist', shared: false, pay_day: 28 }, alex)).body;
  await call('POST', `/api/payments/${p.id}/periods/${mes()}/receipt`, null, alex, jpg);
  const h = await call('GET', `/api/payments/${p.id}/receipts`, null, alex);
  assert.equal(h.body.length, 1);
  assert.equal(h.body[0].period, mes());
  assert.equal(h.body[0].cents, 450000);
  assert.equal(h.body[0].user, 'Alex');
  assert.equal((await call('GET', `/api/payments/${p.id}/receipts`, null, tere)).status, 404);
});
