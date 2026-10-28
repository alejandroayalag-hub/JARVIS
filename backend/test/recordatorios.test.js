import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReminders } from '../src/recordatorios.js';

const walmart = { id: 1, name: 'Walmart', every_months: 1, start_month: '2026-01', pay_day: 30, cut_day: 10, fixed_cents: null };
const at = (s) => new Date(s); // TZ=America/Mexico_City en npm test
const run = (now, periods = [], payments = [walmart]) => buildReminders({ payments, periods, now: at(now), days: 14 });
const hhmm = (r) => r.at.slice(11, 16);

test('día de corte sin monto: 4 avisos de corte', () => {
  const rs = run('2026-11-10T08:00').filter((r) => r.kind === 'corte');
  assert.deepEqual(rs.map((r) => r.at.slice(0, 16)),
    ['2026-11-10T09:00', '2026-11-10T13:00', '2026-11-10T17:00', '2026-11-10T20:30']);
  assert.match(rs[0].text, /^\{nombre\}, hoy cortó la Walmart\. ¿Cuál es el monto a pagar\?$/);
  assert.equal(rs[0].period, '2026-11');
});

test('con monto: sin corte, 4 avisos de pago con lo que falta', () => {
  const rs = run('2026-11-10T08:00', [{ payment_id: 1, period: '2026-11', amount_cents: 450000, paid_cents: 0 }]);
  assert.equal(rs.filter((r) => r.kind === 'corte').length, 0);
  rs.push(...run('2026-11-29T08:00', [{ payment_id: 1, period: '2026-11', amount_cents: 450000, paid_cents: 0 }]));
  const pago = rs.filter((r) => r.kind === 'pago');
  assert.equal(pago.length, 4);
  assert.ok(pago.every((r) => r.at.startsWith('2026-11-30')));
  assert.match(pago[0].text, /faltan \$4,500\.00/);
});

test('abono parcial recuerda lo que falta; total cubierto no recuerda', () => {
  const parcial = run('2026-11-29T08:00', [{ payment_id: 1, period: '2026-11', amount_cents: 450000, paid_cents: 200000 }]);
  assert.match(parcial.find((r) => r.kind === 'pago').text, /faltan \$2,500\.00/);
  const total = run('2026-11-29T08:00', [{ payment_id: 1, period: '2026-11', amount_cents: 450000, paid_cents: 450000 }]);
  assert.equal(total.filter((r) => r.period === '2026-11').length, 0);
});

test('día de pago sin monto ni fijo pide el monto, sin "null"', () => {
  const sinCorte = { ...walmart, cut_day: null };
  const rs = run('2026-11-29T08:00', [], [sinCorte]);
  const m = rs.filter((r) => r.kind === 'monto' && r.period === '2026-11' && r.at.startsWith('2026-11-30'));
  assert.equal(m.length, 4);
  assert.ok(rs.every((r) => !/null|undefined|NaN/.test(r.text)));
});

test('pago vencido: atrasado el resto del día y 4 diarios dentro de la ventana', () => {
  const rs = run('2026-12-02T10:00', [{ payment_id: 1, period: '2026-11', amount_cents: 450000, paid_cents: 0 }])
    .filter((r) => r.kind === 'atrasado' && r.period === '2026-11');
  assert.deepEqual(rs.slice(0, 3).map(hhmm), ['13:00', '17:00', '20:30']);
  assert.match(rs[0].text, /venció el 30/);
  // ventana de 14 días: hoy (02) a 15 inclusive
  assert.equal(rs.at(-1).at.slice(0, 16), '2026-12-15T20:30');
  assert.equal(rs.length, 3 + 4 * 13);
});

test('a media tarde solo quedan los avisos que faltan', () => {
  const rs = run('2026-11-10T14:00').filter((r) => r.kind === 'corte');
  assert.deepEqual(rs.map(hhmm), ['17:00', '20:30']);
});

test('fijo sin corte: avisa pago con el monto fijo', () => {
  const renta = { id: 2, name: 'Renta', every_months: 1, start_month: '2026-01', pay_day: 5, cut_day: null, fixed_cents: 800000 };
  const rs = run('2026-11-04T08:00', [], [renta]);
  assert.match(rs.find((r) => r.kind === 'pago').text, /faltan \$8,000\.00/);
});

test('corte después del día de pago cae en el mes anterior', () => {
  const tc = { ...walmart, cut_day: 25, pay_day: 15 };
  const rs = run('2026-11-24T08:00', [], [tc]).filter((r) => r.kind === 'corte');
  assert.equal(rs[0].at.slice(0, 10), '2026-11-25');
  assert.equal(rs[0].period, '2026-12');
});
