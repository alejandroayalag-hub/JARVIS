import { visibleWhere } from './db.js';
import { addMonths, dayIn, periodsDue } from './periodos.js';
import { buildReminders } from './recordatorios.js';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDay = (d) => Number.isInteger(d) && d >= 1 && d <= 31;

function getVisible(db, uid, id) {
  return db.prepare(`SELECT * FROM payments p WHERE p.id = :id AND p.active = 1 AND ${visibleWhere('p')}`).get({ id, uid }) ?? null;
}

function getPeriod(db, paymentId, period) {
  db.prepare('INSERT INTO periods(payment_id, period) VALUES (?, ?) ON CONFLICT DO NOTHING').run(paymentId, period);
  return db.prepare('SELECT * FROM periods WHERE payment_id = ? AND period = ?').get(paymentId, period);
}

function validate(d) {
  if (!String(d.name ?? '').trim()) throw new Error('nombre requerido');
  if (!isDay(d.pay_day)) throw new Error('día de pago inválido');
  if (d.cut_day != null && !isDay(d.cut_day)) throw new Error('día de corte inválido');
  if (!Number.isInteger(d.every_months) || d.every_months < 1) throw new Error('periodicidad inválida');
  if (d.fixed_cents != null && !(Number.isInteger(d.fixed_cents) && d.fixed_cents > 0)) throw new Error('monto inválido');
}

export function createPayment(db, uid, data, now = new Date()) {
  const d = { every_months: 1, cut_day: null, fixed_cents: null, ...data };
  validate(d);
  // Primer periodo cuyo día de pago no ha pasado: un pago nuevo nunca nace atrasado.
  let start = d.start_month ?? ymd(now).slice(0, 7);
  if (!data.start_month && dayIn(start, d.pay_day) < ymd(now)) start = addMonths(start, 1);
  const { lastInsertRowid } = db.prepare(`INSERT INTO payments(owner_id, name, every_months, start_month, pay_day, cut_day, fixed_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(d.shared ? null : uid, d.name.trim(), d.every_months, start, d.pay_day, d.cut_day, d.fixed_cents);
  return getVisible(db, uid, Number(lastInsertRowid));
}

const EDITABLE = ['name', 'every_months', 'start_month', 'pay_day', 'cut_day', 'fixed_cents'];

export function updatePayment(db, uid, id, patch) {
  const p = getVisible(db, uid, id);
  if (!p) return null;
  const next = { ...p };
  for (const k of EDITABLE) if (k in patch) next[k] = patch[k];
  if ('shared' in patch) next.owner_id = patch.shared ? null : uid;
  validate(next);
  db.prepare(`UPDATE payments SET owner_id=?, name=?, every_months=?, start_month=?, pay_day=?, cut_day=?, fixed_cents=? WHERE id=?`)
    .run(next.owner_id, next.name, next.every_months, next.start_month, next.pay_day, next.cut_day, next.fixed_cents, id);
  return getVisible(db, uid, id);
}

export function deletePayment(db, uid, id) {
  if (!getVisible(db, uid, id)) return false;
  db.prepare('UPDATE payments SET active = 0 WHERE id = ?').run(id);
  return true;
}

export function setAmount(db, uid, paymentId, period, cents) {
  if (!getVisible(db, uid, paymentId)) return null;
  if (!(Number.isInteger(cents) && cents > 0)) throw new Error('monto inválido');
  getPeriod(db, paymentId, period);
  db.prepare('UPDATE periods SET amount_cents = ? WHERE payment_id = ? AND period = ?').run(cents, paymentId, period);
  return getPeriod(db, paymentId, period);
}

const remaining = (p, s) => {
  const amount = s.amount_cents ?? p.fixed_cents;
  return amount == null ? null : Math.max(0, amount - s.paid_cents);
};

// Registra comprobante; cents puede ser null (no se leyó) y se completa con completeReceipt.
export function addPayment(db, uid, paymentId, period, { cents = null, file, read_cents = null }) {
  const p = getVisible(db, uid, paymentId);
  if (!p) return null;
  const s = getPeriod(db, paymentId, period);
  const { lastInsertRowid } = db.prepare(`INSERT INTO receipts(period_id, user_id, file, read_cents, cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(s.id, uid, file, read_cents, cents, new Date().toISOString());
  if (cents) db.prepare('UPDATE periods SET paid_cents = paid_cents + ? WHERE id = ?').run(cents, s.id);
  const period2 = getPeriod(db, paymentId, period);
  return { period: period2, remaining_cents: remaining(p, period2), receipt_id: Number(lastInsertRowid) };
}

function visiblePayments(db, uid) {
  return db.prepare(`SELECT * FROM payments p WHERE p.active = 1 AND ${visibleWhere('p')} ORDER BY p.name`).all({ uid });
}

function periodsOf(db, ids) {
  if (!ids.length) return [];
  return db.prepare(`SELECT * FROM periods WHERE payment_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
}

export function listPayments(db, uid, now = new Date()) {
  const today = ymd(now);
  const pays = visiblePayments(db, uid);
  const states = periodsOf(db, pays.map((p) => p.id));
  return pays.map((p) => {
    const st = (period) => states.find((s) => s.payment_id === p.id && s.period === period) ?? { period, amount_cents: null, paid_cents: 0 };
    const due = periodsDue(p, p.start_month, addMonths(today.slice(0, 7), 12));
    const late = due.find((m) => dayIn(m, p.pay_day) < today && remaining(p, st(m)) !== 0);
    const m = late ?? due.find((x) => dayIn(x, p.pay_day) >= today);
    const current = m ? st(m) : null;
    const rest = current ? remaining(p, current) : null;
    const status = late ? 'atrasado' : rest === 0 ? 'pagado' : rest == null ? 'sin_monto' : 'pendiente';
    return { ...p, current, status, remaining_cents: rest, due_date: m ? dayIn(m, p.pay_day) : null };
  });
}

export function remindersFor(db, uid, now = new Date()) {
  const pays = visiblePayments(db, uid);
  return buildReminders({ payments: pays, periods: periodsOf(db, pays.map((p) => p.id)), now });
}

export function summary(db, uid, month) {
  const pays = visiblePayments(db, uid).filter((p) => periodsDue(p, month, month).length);
  const states = periodsOf(db, pays.map((p) => p.id)).filter((s) => s.period === month);
  let paid = 0; const pending = [];
  for (const p of pays) {
    const s = states.find((x) => x.payment_id === p.id) ?? { amount_cents: null, paid_cents: 0 };
    paid += s.paid_cents;
    const r = remaining(p, s);
    if (r) pending.push({ name: p.name, remaining_cents: r });
    else if (r == null) pending.push({ name: p.name, remaining_cents: null });
  }
  return { month, paid_cents: paid, pending };
}
