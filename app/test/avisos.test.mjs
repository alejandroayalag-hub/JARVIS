import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toNotifications, MAX_AVISOS } from '../src/avisos.js';

const r = (at, text = '{nombre}, hoy vence Luz.') => ({ at, kind: 'pago', paymentId: 3, period: '2026-11', text });

test('pone el nombre, la fecha y los datos para abrir el pago', () => {
  const [n] = toNotifications([r('2026-11-30T09:00:00-06:00')], 'Tere');
  assert.equal(n.content.title, 'JARVIS');
  assert.equal(n.content.body, 'Tere, hoy vence Luz.');
  assert.deepEqual(n.content.data, { paymentId: 3, period: '2026-11' });
  assert.equal(n.date.toISOString(), '2026-11-30T15:00:00.000Z');
});

test('no pasa del tope de alarmas de Android y conserva los más próximos', () => {
  const many = Array.from({ length: MAX_AVISOS + 50 }, (_, i) => r(new Date(Date.UTC(2027, 0, 1, 0, i)).toISOString()));
  const out = toNotifications(many.reverse(), 'Alex');
  assert.equal(out.length, MAX_AVISOS);
  assert.equal(out[0].date.toISOString(), '2027-01-01T00:00:00.000Z');
});
