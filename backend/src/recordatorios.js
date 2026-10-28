import { addMonths, dayIn, periodsDue } from './periodos.js';

export const HORAS_AVISO = ['09:00', '13:00', '17:00', '20:30'];
// ponytail: cuánto tiempo atrás se buscan pagos sin cubrir; más viejo que esto deja de insistir.
const MESES_ATRAS = 12;

const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const money = (cents) => fmt.format(cents / 100);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// ISO con offset de la zona local del proceso (TZ=America/Mexico_City).
function localIso(dateStr, hhmm) {
  const d = new Date(`${dateStr}T${hhmm}:00`);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${dateStr}T${hhmm}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

// Fecha de corte del periodo (mes de pago). Si el corte cae después del día de pago, es del mes anterior.
function cutDate(p, period) {
  if (!p.cut_day) return null;
  return dayIn(p.cut_day > p.pay_day ? addMonths(period, -1) : period, p.cut_day);
}

export function buildReminders({ payments, periods, now, days = 14 }) {
  const state = new Map(periods.map((s) => [`${s.payment_id}|${s.period}`, s]));
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  const fromMonth = addMonths(dates[0].slice(0, 7), -MESES_ATRAS);
  const toMonth = addMonths(dates.at(-1).slice(0, 7), 1); // corte del mes anterior al pago

  const out = [];
  for (const p of payments) {
    for (const period of periodsDue(p, fromMonth, toMonth)) {
      const s = state.get(`${p.id}|${period}`) ?? {};
      const amount = s.amount_cents ?? p.fixed_cents ?? null;
      const paid = s.paid_cents ?? 0;
      if (amount != null && paid >= amount) continue;
      const due = dayIn(period, p.pay_day);
      const cut = cutDate(p, period);
      const dueDay = Number(due.slice(8));
      for (const date of dates) {
        let kind, text;
        if (amount == null && date === cut) {
          kind = 'corte'; text = `{nombre}, hoy cortó la ${p.name}. ¿Cuál es el monto a pagar?`;
        } else if (date === due || date > due) {
          const cuando = date === due ? `hoy vence ${p.name}` : `${p.name} venció el ${dueDay}`;
          if (amount == null) { kind = 'monto'; text = `{nombre}, ${cuando}. ¿Cuál es el monto a pagar?`; }
          else {
            kind = date === due ? 'pago' : 'atrasado';
            text = `{nombre}, ${cuando}: faltan ${money(amount - paid)}. Aún no recibo el comprobante.`;
          }
        } else continue;
        for (const h of HORAS_AVISO) {
          const at = localIso(date, h);
          if (new Date(at) > now) out.push({ at, kind, paymentId: p.id, period, text });
        }
      }
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
