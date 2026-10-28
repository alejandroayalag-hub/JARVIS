import { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { post, usuario } from '../api';
import { syncReminders } from '../notificaciones';
import { s, c } from '../ui';

export default function Chat() {
  const [msgs, setMsgs] = useState([{ de: 'jarvis', t: `Buen día, ${usuario()?.name}. ¿En qué le ayudo?` }]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const lista = useRef(null);

  async function enviar() {
    const t = texto.trim();
    if (!t || pensando) return;
    setTexto(''); setMsgs((m) => [...m, { de: 'yo', t }]); setPensando(true);
    try {
      const { reply } = await post('/api/chat', { text: t });
      setMsgs((m) => [...m, { de: 'jarvis', t: reply }]);
      await syncReminders();
    } catch (e) { setMsgs((m) => [...m, { de: 'jarvis', t: e.message }]); }
    finally { setPensando(false); }
  }

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={lista}
        contentContainerStyle={s.pad}
        data={pensando ? [...msgs, { de: 'jarvis', t: '…' }] : msgs}
        keyExtractor={(_, i) => String(i)}
        onContentSizeChange={() => lista.current?.scrollToEnd()}
        renderItem={({ item }) => (
          <View style={{ alignSelf: item.de === 'yo' ? 'flex-end' : 'flex-start', maxWidth: '85%', marginBottom: 8,
            backgroundColor: item.de === 'yo' ? c.oro : c.tarjeta, borderRadius: 12, padding: 10 }}>
            <Text style={{ color: item.de === 'yo' ? '#0E1522' : c.texto, fontSize: 16 }}>{item.t}</Text>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', padding: 10, gap: 8 }}>
        <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Escriba a JARVIS…" placeholderTextColor={c.tenue}
          value={texto} onChangeText={setTexto} onSubmitEditing={enviar} />
        <TouchableOpacity style={[s.boton, { marginBottom: 0, justifyContent: 'center' }]} onPress={enviar}><Text style={s.botonTexto}>Enviar</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
