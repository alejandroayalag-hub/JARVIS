import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addUser } from '../src/auth.js';
import { createPayment, listPayments, updatePayment, deletePayment, setAmount, addPayment, remindersFor, summary } from '../src/pagos.js';

let db; const ALEX = 1, TERE = 2;
const NOW = new Date('2026-11-05T10:00');
beforeEach(() => { db = openDb(':memory:'); addUser(db, 'Alex'); addUser(db, 'Tere'); });

const walmart = { name: 'Walmart', shared: true, every_months: 1, pay_day: 30, cut_day: 10 };

test('lo personal de Tere no existe para Alex', () => {
  const gym = createPayment(db, TERE, { name: 'Gym', shared: false, pay_day: 15 }, NOW);
  assert.equal(listPayments(db, ALEX, NOW).length, 0);
  assert.equal(setAmount(db, ALEX, gym.id, '2026-11', 50000), null);
  assert.equal(updatePayment(db, ALEX, gym.id, { name: 'x' }), null);
  assert.equal(deletePayment(db, ALEX, gym.id), false);
  assert.equal(addPayment(db, ALEX, gym.id, '2026-11', { cents: 1, file: 'f.jpg' }), null);
  assert.equal(remindersFor(db, ALEX, NOW).length, 0);
  assert.equal(listPayments(db, TERE, NOW).length, 1);
});

test('conjunto: Tere captura monto y Alex lo ve', () => {
  const w = createPayment(db, ALEX, walmart, NOW);
  assert.equal(w.owner_id, null);
  setAmount(db, TERE, w.id, '2026-11', 450000);
  const [p] = listPayments(db, ALEX, NOW);
  assert.equal(p.current.amount_cents, 450000);
  assert.equal(p.status, 'pendiente');
});

test('dos abonos se suman y cubren el total', () => {
  const w = createPayment(db, ALEX, walmart, NOW);
  setAmount(db, ALEX, w.id, '2026-11', 450000);
  assert.equal(addPayment(db, ALEX, w.id, '2026-11', { cents: 200000, file: 'a.jpg', read_cents: 200000 }).remaining_cents, 250000);
  const r = addPayment(db, TERE, w.id, '2026-11', { cents: 250000, file: 'b.jpg', read_cents: null });
  assert.equal(r.period.paid_cents, 450000);
  assert.equal(r.remaining_cents, 0);
  assert.equal(listPayments(db, ALEX, NOW)[0].status, 'pagado');
  assert.equal(remindersFor(db, TERE, NOW).filter((x) => x.period === '2026-11').length, 0);
});

test('pago nuevo cuyo día ya pasó este mes empieza el mes siguiente (no nace atrasado)', () => {
  const luz = createPayment(db, ALEX, { name: 'Luz', shared: true, every_months: 2, pay_day: 3 }, NOW);
  assert.equal(luz.start_month, '2026-12');
  assert.equal(remindersFor(db, ALEX, NOW).filter((r) => r.kind === 'atrasado' || r.kind === 'monto').length, 0);
});

test('sin monto el periodo actual queda sin_monto; vencido sin pagar queda atrasado', () => {
  const w = createPayment(db, ALEX, walmart, NOW);
  assert.equal(listPayments(db, ALEX, NOW)[0].status, 'sin_monto');
  setAmount(db, ALEX, w.id, '2026-11', 100000);
  assert.equal(listPayments(db, ALEX, new Date('2026-12-02T10:00'))[0].status, 'atrasado');
});

test('borrar es lógico y deja de recordar', () => {
  const w = createPayment(db, ALEX, walmart, NOW);
  assert.equal(deletePayment(db, ALEX, w.id), true);
  assert.equal(listPayments(db, ALEX, NOW).length, 0);
  assert.equal(remindersFor(db, ALEX, NOW).length, 0);
});

test('summary no incluye lo personal del otro', () => {
  createPayment(db, TERE, { name: 'Gym', shared: false, pay_day: 15, fixed_cents: 50000 }, NOW);
  const w = createPayment(db, ALEX, walmart, NOW);
  setAmount(db, ALEX, w.id, '2026-11', 450000);
  addPayment(db, ALEX, w.id, '2026-11', { cents: 100000, file: 'a.jpg' });
  const s = summary(db, ALEX, '2026-11');
  assert.equal(s.paid_cents, 100000);
  assert.deepEqual(s.pending, [{ name: 'Walmart', remaining_cents: 350000 }]);
  assert.ok(!JSON.stringify(s).includes('Gym'));
});

test('validación: día fuera de 1..31 o nombre vacío lanza', () => {
  assert.throws(() => createPayment(db, ALEX, { name: '', pay_day: 5 }, NOW));
  assert.throws(() => createPayment(db, ALEX, { name: 'X', pay_day: 0 }, NOW));
  assert.throws(() => createPayment(db, ALEX, { name: 'X', pay_day: 5, cut_day: 40 }, NOW));
});
