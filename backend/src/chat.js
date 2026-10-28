import { ollamaChat } from './ollama.js';
import { createPayment, listPayments, setAmount, summary } from './pagos.js';
import { money } from './recordatorios.js';

const otro = (nombre) => (nombre === 'Alex' ? 'Tere' : 'Alex');
const n = (v) => (v == null || v === '' ? null : Number(v));

const SCHEMA = {
  type: 'object',
  properties: {
    accion: { enum: ['alta_pago', 'monto', 'resumen', 'listar', 'charla'] },
    nombre: { type: ['string', 'null'] },
    conjunto: { type: ['boolean', 'null'] },
    cada_meses: { type: ['integer', 'null'] },
    dia_pago: { type: ['integer', 'null'] },
    dia_corte: { type: ['integer', 'null'] },
    monto: { type: ['number', 'null'] },
  },
  required: ['accion'],
};

const intentPrompt = (user, today) => `Hoy es ${today}. Clasifica el mensaje de ${user.name} para el asistente de pagos de la casa.
Acciones:
- alta_pago: registrar un pago fijo. nombre del pago, cada_meses (1 mensual, 2 bimestral, 12 anual), dia_pago, dia_corte (solo tarjetas, si lo dice), monto (solo si es fijo).
  conjunto=true SOLO si dice que es conjunto/compartido o "con ${otro(user.name)}"; si no, false.
- monto: informa cuánto toca pagar de un pago existente. nombre y monto.
- resumen: pregunta cuánto se ha pagado o qué falta este mes.
- listar: pide ver sus pagos.
- charla: cualquier otra cosa.
No inventes datos: lo que no diga va en null.`;

const personaPrompt = (user) => `Eres JARVIS, el asistente de la casa de Alex y Tere. Hablas en español de México, formal y elegante, breve. Te diriges al usuario por su nombre (${user.name}). No inventes datos de pagos: solo usa los que te doy.`;

function findPayment(db, user, nombre) {
  const q = String(nombre ?? '').toLowerCase().trim();
  if (!q) return null;
  return listPayments(db, user.id).find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ?? null;
}

const altaReply = (user, p) => `Entendido, ${user.name}. Registré ${p.name}, ${p.every_months === 1 ? 'cada mes' : `cada ${p.every_months} meses`}, con pago el día ${p.pay_day}${p.cut_day ? ` y corte el día ${p.cut_day}` : ''}. Será ${p.owner_id == null ? `compartido con ${otro(user.name)}` : 'personal'}.`;

export async function handleChat(db, user, text, { chat = ollamaChat, model = process.env.JARVIS_MODEL ?? 'qwen3:14b', today = new Date().toLocaleDateString('sv-SE') } = {}) {
  try {
    const a = JSON.parse(await chat({ model, format: SCHEMA, messages: [
      { role: 'system', content: intentPrompt(user, today) }, { role: 'user', content: text }] }));

    if (a.accion === 'alta_pago') {
      if (!a.nombre) return { reply: `${user.name}, ¿cómo se llama el pago que desea registrar?` };
      if (!n(a.dia_pago)) return { reply: `¿Qué día se paga ${a.nombre}, ${user.name}?` };
      const p = createPayment(db, user.id, {
        name: a.nombre, shared: a.conjunto === true, every_months: n(a.cada_meses) ?? 1,
        pay_day: n(a.dia_pago), cut_day: n(a.dia_corte), fixed_cents: n(a.monto) ? Math.round(n(a.monto) * 100) : null,
      });
      return { reply: altaReply(user, p) };
    }
    if (a.accion === 'monto') {
      const p = findPayment(db, user, a.nombre);
      if (!p || !p.current) return { reply: `No encuentro un pago llamado "${a.nombre ?? ''}", ${user.name}. ¿Me lo repite?` };
      if (!(n(a.monto) > 0)) return { reply: `¿Cuál es el monto de ${p.name}, ${user.name}?` };
      setAmount(db, user.id, p.id, p.current.period, Math.round(n(a.monto) * 100));
      return { reply: `Anotado, ${user.name}: ${p.name} es de ${money(Math.round(n(a.monto) * 100))}. Le recordaré el día ${p.pay_day} hasta recibir el comprobante.` };
    }
    if (a.accion === 'resumen') {
      const s = summary(db, user.id, today.slice(0, 7));
      const falta = s.pending.map((x) => `${x.name}: ${x.remaining_cents == null ? 'sin monto' : `faltan ${money(x.remaining_cents)}`}`);
      return { reply: `${user.name}, este mes van pagados ${money(s.paid_cents)}.${falta.length ? ` Pendiente: ${falta.join('; ')}.` : ' No queda nada pendiente.'}` };
    }
    if (a.accion === 'listar') {
      const ps = listPayments(db, user.id);
      if (!ps.length) return { reply: `Aún no tiene pagos registrados, ${user.name}.` };
      return { reply: `${user.name}, estos son sus pagos: ${ps.map((p) => `${p.name} (día ${p.pay_day}, ${p.status.replace('_', ' ')})`).join('; ')}.` };
    }
    return { reply: await chat({ model, messages: [{ role: 'system', content: personaPrompt(user) }, { role: 'user', content: text }] }) };
  } catch (e) {
    if (/inválid|requerido/.test(e.message)) return { reply: `${user.name}, algo no cuadra en esos datos (${e.message}). ¿Me lo repite?` };
    return { reply: `Disculpe, ${user.name}, en este momento no puedo pensar con claridad. Intente de nuevo en unos minutos.` };
  }
}
