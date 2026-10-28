import { StyleSheet } from 'react-native';

// Paleta sobria: azul noche con acento dorado, estilo mayordomo.
export const c = {
  fondo: '#0E1522', tarjeta: '#172235', borde: '#25324A', texto: '#E8ECF3', tenue: '#8A97AD', oro: '#C9A45C',
  pendiente: '#E0A93B', pagado: '#4CAF7A', atrasado: '#E05A4F', sin_monto: '#8A97AD',
};

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: c.fondo },
  pad: { padding: 16 },
  titulo: { color: c.texto, fontSize: 22, fontWeight: '600' },
  texto: { color: c.texto, fontSize: 16 },
  tenue: { color: c.tenue, fontSize: 14 },
  tarjeta: { backgroundColor: c.tarjeta, borderColor: c.borde, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  input: { backgroundColor: c.tarjeta, borderColor: c.borde, borderWidth: 1, borderRadius: 10, color: c.texto, fontSize: 16, padding: 12, marginBottom: 12 },
  boton: { backgroundColor: c.oro, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  botonTexto: { color: '#0E1522', fontSize: 16, fontWeight: '700' },
  botonSec: { borderColor: c.oro, borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  botonSecTexto: { color: c.oro, fontSize: 16, fontWeight: '600' },
  error: { color: c.atrasado, fontSize: 14, marginBottom: 10 },
});

export const ESTADO = { pendiente: 'Pendiente', pagado: 'Pagado', atrasado: 'Atrasado', sin_monto: 'Sin monto' };
