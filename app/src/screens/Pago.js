import { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { get, post, del, pesos, subirComprobante, fotoUrl } from '../api';
import { syncReminders } from '../notificaciones';
import { s, c, ESTADO } from '../ui';

const aCentavos = (t) => { const n = Number(String(t).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

async function comprimir(uri) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1600 }).renderAsync();
  return (await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG })).uri;
}

export default function Pago({ route, navigation }) {
  const { paymentId } = route.params;
  const [p, setP] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [monto, setMonto] = useState('');
  const [pendiente, setPendiente] = useState(null); // receipt_id sin leer
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const todos = await get('/api/payments');
      setP(todos.find((x) => x.id === paymentId) ?? null);
      setFotos(await get(`/api/payments/${paymentId}/receipts`));
    } catch (e) { setMsg(e.message); }
  }, [paymentId]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function hacer(fn) {
    setOcupado(true); setMsg('');
    try { await fn(); await cargar(); await syncReminders(); }
    catch (e) { setMsg(e.message); }
    finally { setOcupado(false); }
  }

  const guardarMonto = () => hacer(async () => {
    const cents = aCentavos(monto);
    if (!cents) throw new Error('Escriba un monto válido.');
    if (pendiente) { await post(`/api/receipts/${pendiente}/amount`, { cents }); setPendiente(null); }
    else await post(`/api/payments/${paymentId}/periods/${p.current.period}/amount`, { cents });
    setMonto('');
  });

  const subir = (camara) => hacer(async () => {
    const opts = { mediaTypes: ['images'], quality: 1 };
    const perm = camara ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
    if (!perm.granted) throw new Error('Sin permiso de cámara.');
    const r = camara ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled) return;
    const res = await subirComprobante(paymentId, p.current.period, await comprimir(r.assets[0].uri));
    if (res.needs_amount) { setPendiente(res.receipt_id); setMsg('No pude leer el monto del comprobante. ¿Cuánto se pagó?'); }
    else setMsg(res.remaining_cents ? `Leí ${pesos(res.read_cents)}. Faltan ${pesos(res.remaining_cents)}.` : `Leí ${pesos(res.read_cents)}. Pago cubierto, gracias.`);
  });

  const borrar = () => Alert.alert('Borrar pago', `¿Dejar de llevar ${p.name}?`, [
    { text: 'Cancelar' },
    { text: 'Borrar', style: 'destructive', onPress: () => hacer(async () => { await del(`/api/payments/${paymentId}`); navigation.goBack(); }) },
  ]);

  if (!p) return <View style={[s.pantalla, s.pad]}><Text style={msg ? s.error : s.tenue}>{msg || 'Cargando…'}</Text></View>;
  const cur = p.current;
  const sinMonto = cur && cur.amount_cents == null && p.fixed_cents == null;

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.pad}>
      <Text style={s.titulo}>{p.name}</Text>
      <Text style={[s.tenue, { marginBottom: 14 }]}>
        {p.owner_id == null ? 'Compartido' : 'Personal'} · {p.every_months === 1 ? 'mensual' : `cada ${p.every_months} meses`} · pago día {p.pay_day}{p.cut_day ? ` · corte día ${p.cut_day}` : ''}
      </Text>
      {cur && (
        <View style={s.tarjeta}>
          <Text style={s.tenue}>Periodo {cur.period} · vence {p.due_date}</Text>
          <Text style={[s.texto, { color: c[p.status], fontWeight: '700', marginVertical: 4 }]}>{ESTADO[p.status]}</Text>
          <Text style={s.texto}>Monto: {pesos(cur.amount_cents ?? p.fixed_cents)} · Pagado: {pesos(cur.paid_cents)}</Text>
          {p.remaining_cents > 0 && <Text style={s.texto}>Faltan: {pesos(p.remaining_cents)}</Text>}
        </View>
      )}
      {!!msg && <Text style={[s.texto, { color: c.oro, marginBottom: 10 }]}>{msg}</Text>}
      {(sinMonto || pendiente) && (
        <>
          <TextInput style={s.input} placeholder={pendiente ? 'Monto pagado' : 'Monto a pagar'} placeholderTextColor={c.tenue} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
          <TouchableOpacity style={s.boton} onPress={guardarMonto} disabled={ocupado}><Text style={s.botonTexto}>Guardar monto</Text></TouchableOpacity>
        </>
      )}
      {cur && !pendiente && p.status !== 'pagado' && (
        <>
          <TouchableOpacity style={s.boton} onPress={() => subir(true)} disabled={ocupado}><Text style={s.botonTexto}>Tomar foto del comprobante</Text></TouchableOpacity>
          <TouchableOpacity style={s.botonSec} onPress={() => subir(false)} disabled={ocupado}><Text style={s.botonSecTexto}>Elegir de la galería</Text></TouchableOpacity>
        </>
      )}
      {ocupado && <ActivityIndicator color={c.oro} style={{ marginVertical: 10 }} />}
      <Text style={[s.texto, { marginTop: 16, marginBottom: 8, fontWeight: '600' }]}>Comprobantes</Text>
      {!fotos.length && <Text style={s.tenue}>Aún no hay.</Text>}
      {fotos.map((f) => (
        <View key={f.id} style={[s.tarjeta, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
          <Image source={fotoUrl(f.id)} style={{ width: 64, height: 64, borderRadius: 6 }} />
          <View>
            <Text style={s.texto}>{f.period} · {pesos(f.cents)}</Text>
            <Text style={s.tenue}>subió {f.user} · {new Date(f.created_at).toLocaleDateString('es-MX')}</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity onPress={borrar} style={{ marginTop: 20, alignItems: 'center' }}><Text style={{ color: c.atrasado }}>Dejar de llevar este pago</Text></TouchableOpacity>
    </ScrollView>
  );
}
