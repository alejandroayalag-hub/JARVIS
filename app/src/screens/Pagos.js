import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { get, pesos } from '../api';
import { syncReminders } from '../notificaciones';
import { s, c, ESTADO } from '../ui';

export default function Pagos({ navigation }) {
  const [pagos, setPagos] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setPagos(await get('/api/payments')); await syncReminders(); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <View style={s.pantalla}>
      <FlatList
        contentContainerStyle={s.pad}
        data={pagos}
        keyExtractor={(p) => String(p.id)}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={c.oro} />}
        ListHeaderComponent={!!error && <Text style={s.error}>{error}</Text>}
        ListEmptyComponent={!cargando && <Text style={s.tenue}>Sin pagos aún. Dígale a JARVIS cuáles son, por ejemplo: "la Walmart corta el 10 y se paga el 30, es conjunta".</Text>}
        renderItem={({ item: p }) => (
          <TouchableOpacity style={s.tarjeta} onPress={() => navigation.navigate('Pago', { paymentId: p.id })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[s.texto, { fontWeight: '600' }]}>{p.name}</Text>
              <Text style={{ color: c[p.status], fontWeight: '700' }}>{ESTADO[p.status]}</Text>
            </View>
            <Text style={s.tenue}>
              {p.owner_id == null ? 'Compartido' : 'Personal'} · vence {p.due_date?.slice(8)}/{p.due_date?.slice(5, 7)}
              {p.remaining_cents ? ` · faltan ${pesos(p.remaining_cents)}` : ''}
            </Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={[s.boton, { margin: 16 }]} onPress={() => navigation.navigate('Chat')}>
        <Text style={s.botonTexto}>Hablar con JARVIS</Text>
      </TouchableOpacity>
    </View>
  );
}
