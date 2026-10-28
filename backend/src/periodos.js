// Meses como 'YYYY-MM'. Sin DB: lógica pura.
const toIdx = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + mo - 1; };
const fromIdx = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

export const addMonths = (m, n) => fromIdx(toIdx(m) + n);

export function dayIn(month, day) {
  const [y, mo] = month.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function periodsDue(payment, fromMonth, toMonth) {
  const start = toIdx(payment.start_month);
  const out = [];
  for (let i = Math.max(toIdx(fromMonth), start); i <= toIdx(toMonth); i++) {
    if ((i - start) % payment.every_months === 0) out.push(fromIdx(i));
  }
  return out;
}
