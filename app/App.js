import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import { cargarSesion, salir } from './src/api';
import { prepararAvisos, syncReminders } from './src/notificaciones';
import Login from './src/screens/Login';
import Pagos from './src/screens/Pagos';
import Pago from './src/screens/Pago';
import Chat from './src/screens/Chat';
import { s, c } from './src/ui';

const Stack = createNativeStackNavigator();
const nav = createNavigationContainerRef();
const tema = { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.fondo, card: c.fondo, primary: c.oro, text: c.texto } };

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = cargando
  const [bloqueado, setBloqueado] = useState(true);
  const estado = useRef(AppState.currentState);

  async function desbloquear() {
    const hay = await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
    if (!hay) return setBloqueado(false);
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'JARVIS' });
    setBloqueado(!r.success);
  }

  useEffect(() => {
    cargarSesion().then((ses) => { setUser(ses?.user ?? null); if (ses) desbloquear(); });
    const sub = AppState.addEventListener('change', (st) => {
      if (estado.current.match(/background/) && st === 'active') { setBloqueado(true); desbloquear(); syncReminders().catch(() => {}); }
      estado.current = st;
    });
    const toque = Notifications.addNotificationResponseReceivedListener((r) => {
      const { paymentId } = r.notification.request.content.data ?? {};
      if (paymentId && nav.isReady()) nav.navigate('Pago', { paymentId });
    });
    return () => { sub.remove(); toque.remove(); };
  }, []);

  useEffect(() => { if (user) prepararAvisos().then(() => syncReminders()).catch(() => {}); }, [user]);

  if (user === undefined) return <View style={s.pantalla} />;
  if (!user) return <Login onEntrar={(u) => { setUser(u); setBloqueado(false); }} />;
  if (bloqueado) return (
    <View style={[s.pantalla, s.pad, { justifyContent: 'center' }]}>
      <TouchableOpacity style={s.boton} onPress={desbloquear}><Text style={s.botonTexto}>Desbloquear</Text></TouchableOpacity>
    </View>
  );

  return (
    <NavigationContainer ref={nav} theme={tema}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerTintColor: c.oro }}>
        <Stack.Screen name="Pagos" component={Pagos} options={{
          title: `JARVIS · ${user.name}`,
          headerRight: () => <TouchableOpacity onPress={async () => { await salir(); setUser(null); }}><Text style={{ color: c.tenue }}>Salir</Text></TouchableOpacity>,
        }} />
        <Stack.Screen name="Pago" component={Pago} options={{ title: 'Pago' }} />
        <Stack.Screen name="Chat" component={Chat} options={{ title: 'JARVIS' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
