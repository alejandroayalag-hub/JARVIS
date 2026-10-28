import { ollamaChat } from './ollama.js';

export const PROMPT_COMPROBANTE = 'Es un comprobante de pago o transferencia bancaria en México. Devuelve solo el monto pagado en pesos (el importe de la operación, no saldos ni comisiones). Si no se lee con claridad, devuelve null.';

const SCHEMA = { type: 'object', properties: { monto: { type: ['number', 'string', 'null'] } }, required: ['monto'] };

export async function readReceipt(buffer, { chat = ollamaChat, model = process.env.JARVIS_VISION_MODEL ?? 'qwen2.5vl:7b' } = {}) {
  try {
    const out = JSON.parse(await chat({
      model, format: SCHEMA,
      messages: [{ role: 'user', content: PROMPT_COMPROBANTE, images: [buffer.toString('base64')] }],
    }));
    const n = typeof out.monto === 'string' ? Number(out.monto.replace(/[$,\s]/g, '')) : out.monto;
    return { cents: Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null };
  } catch {
    return { cents: null }; // Ollama caído o respuesta ilegible: se pide el monto a mano.
  }
}
