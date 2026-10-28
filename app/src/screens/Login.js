import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { login } from '../api';
import { s, c } from '../ui';

export default function Login({ onEntrar }) {
  const [nombre, setNombre] = useState('Alex');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    setError(''); setCargando(true);
    try { onEntrar(await login(nombre, pw)); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }

  return (
    <View style={[s.pantalla, s.pad, { justifyContent: 'center' }]}>
      <Text style={[s.titulo, { fontSize: 34, color: c.oro, marginBottom: 4 }]}>JARVIS</Text>
      <Text style={[s.tenue, { marginBottom: 28 }]}>A sus órdenes.</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        {['Alex', 'Tere'].map((n) => (
          <TouchableOpacity key={n} onPress={() => setNombre(n)} style={[nombre === n ? s.boton : s.botonSec, { flex: 1 }]}>
            <Text style={nombre === n ? s.botonTexto : s.botonSecTexto}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={s.input} placeholder="Contraseña" placeholderTextColor={c.tenue} secureTextEntry value={pw} onChangeText={setPw} onSubmitEditing={entrar} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.boton} onPress={entrar} disabled={cargando || !pw}>
        {cargando ? <ActivityIndicator color="#0E1522" /> : <Text style={s.botonTexto}>Entrar</Text>}
      </TouchableOpacity>
    </View>
  );
}
