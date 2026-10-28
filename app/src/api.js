import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const API_URL = Constants.expoConfig?.extra?.apiUrl;
const CLAVE = 'jarvis_sesion';

let sesion = null; // { token, user: { id, name } }

export async function cargarSesion() {
  const s = await SecureStore.getItemAsync(CLAVE);
  sesion = s ? JSON.parse(s) : null;
  return sesion;
}
export const usuario = () => sesion?.user ?? null;
export async function salir() { sesion = null; await SecureStore.deleteItemAsync(CLAVE); }

export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function req(method, path, body, headers = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { ...(sesion ? { authorization: `Bearer ${sesion.token}` } : {}), ...headers },
      body,
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con JARVIS. Revise que Tailscale esté encendido.');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Error del servidor');
  return data;
}

const json = (method) => (path, body) => req(method, path, body ? JSON.stringify(body) : undefined, body ? { 'content-type': 'application/json' } : {});
export const get = json('GET');
export const post = json('POST');
export const patch = json('PATCH');
export const del = json('DELETE');

export async function login(name, password) {
  const r = await post('/api/login', { name, password });
  sesion = r;
  await SecureStore.setItemAsync(CLAVE, JSON.stringify(r));
  return r.user;
}

export async function subirComprobante(paymentId, period, uri) {
  const blob = await (await fetch(uri)).blob();
  return req('POST', `/api/payments/${paymentId}/periods/${period}/receipt`, blob, { 'content-type': 'image/jpeg' });
}

export const fotoUrl = (receiptId) => ({ uri: `${API_URL}/api/receipts/${receiptId}/photo`, headers: { authorization: `Bearer ${sesion?.token}` } });

export const pesos = (cents) => (cents == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100));
