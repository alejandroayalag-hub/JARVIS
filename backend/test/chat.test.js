import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addUser } from '../src/auth.js';
import { handleChat } from '../src/chat.js';
import { listPayments, createPayment, setAmount, addPayment } from '../src/pagos.js';

let db; const alex = { id: 1, name: 'Alex' }, tere = { id: 2, name: 'Tere' };
beforeEach(() => { db = openDb(':memory:'); addUser(db, 'Alex'); addUser(db, 'Tere'); });
const replies = (...outs) => { const q = [...outs]; return async () => { const o = q.shift(); if (o instanceof Error) throw o; return typeof o === 'string' ? o : JSON.stringify(o); }; };
const alta = { accion: 'alta_pago', nombre: 'Walmart', conjunto: true, cada_meses: 1, dia_pago: 30, dia_corte: 10, monto: null };

test('alta conjunta crea pago compartido y lo dice', async () => {
  const { reply } = await handleChat(db, alex, 'la walmart corta el 10 y se paga el 30, es conjunta', { chat: replies(alta) });
  const [p] = listPayments(db, tere.id);
  assert.equal(p.name, 'Walmart');
  assert.equal(p.owner_id, null);
  assert.equal(p.cut_day, 10);
  assert.match(reply, /^Entendido, Alex\. Registré Walmart, cada mes, con pago el día 30 y corte el día 10\. Será compartido con Tere\.$/);
});

test('alta sin conjunto es personal; bimestral con monto fijo', async () => {
  const { reply } = await handleChat(db, tere, 'gym 450 cada dos meses el 15', { chat: replies({ ...alta, nombre: 'Gym', conjunto: false, cada_meses: 2, dia_pago: 15, dia_corte: null, monto: 450 }) });
  assert.equal(listPayments(db, alex.id).length, 0);
  assert.equal(listPayments(db, tere.id)[0].fixed_cents, 45000);
  assert.match(reply, /cada 2 meses, con pago el día 15\. Será personal\./);
});

test('alta sin día de pago pregunta y no crea', async () => {
  const { reply } = await handleChat(db, alex, 'apunta la luz', { chat: replies({ ...alta, nombre: 'Luz', dia_pago: null }) });
  assert.equal(listPayments(db, alex.id).length, 0);
  assert.match(reply, /¿Qué día/);
});

test('monto: captura el monto del periodo actual del pago por nombre', async () => {
  const w = createPayment(db, alex.id, { name: 'Walmart', shared: true, pay_day: 28 });
  const { reply } = await handleChat(db, tere, 'la walmart son 4500', { chat: replies({ accion: 'monto', nombre: 'walmart', monto: 4500 }) });
  assert.equal(listPayments(db, alex.id)[0].current.amount_cents, 450000);
  assert.match(reply, /Walmart/); assert.match(reply, /\$4,500\.00/);
  assert.ok(w);
});

test('monto de un pago que no existe o es ajeno no se inventa', async () => {
  createPayment(db, tere.id, { name: 'Gym', shared: false, pay_day: 28 });
  const { reply } = await handleChat(db, alex, 'el gym son 400', { chat: replies({ accion: 'monto', nombre: 'gym', monto: 400 }) });
  assert.match(reply, /No encuentro/);
});

test('resumen usa los números del código', async () => {
  const w = createPayment(db, alex.id, { name: 'Walmart', shared: true, pay_day: 28 });
  const mes = new Date().toISOString().slice(0, 7);
  setAmount(db, alex.id, w.id, mes, 450000);
  addPayment(db, alex.id, w.id, mes, { cents: 100000, file: 'a.jpg' });
  const { reply } = await handleChat(db, alex, '¿cuánto pagamos este mes?', { chat: replies({ accion: 'resumen' }) });
  assert.match(reply, /\$1,000\.00/);
  assert.match(reply, /Walmart: faltan \$3,500\.00/);
});

test('charla pasa por la persona de JARVIS con el nombre', async () => {
  let sys;
  const chat = async (req) => { if (req.format) return JSON.stringify({ accion: 'charla' }); sys = req.messages[0].content; return 'Buenas tardes, Tere.'; };
  const { reply } = await handleChat(db, tere, 'hola', { chat });
  assert.equal(reply, 'Buenas tardes, Tere.');
  assert.match(sys, /JARVIS/); assert.match(sys, /\(Tere\)/);
});

test('Ollama caído: disculpa formal con el nombre, sin lanzar', async () => {
  const { reply } = await handleChat(db, alex, 'hola', { chat: replies(new Error('ECONNREFUSED')) });
  assert.equal(reply, 'Disculpe, Alex, en este momento no puedo pensar con claridad. Intente de nuevo en unos minutos.');
});
