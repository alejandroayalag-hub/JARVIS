// Lógica pura (sin Expo) para convertir recordatorios del servidor en notificaciones locales.
// ponytail: Android limita ~500 alarmas por app; 400 deja margen. Se conservan las más próximas.
export const MAX_AVISOS = 400;

export function toNotifications(reminders, nombre) {
  return [...reminders]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, MAX_AVISOS)
    .map((r) => ({
      date: new Date(r.at),
      content: { title: 'JARVIS', body: r.text.replaceAll('{nombre}', nombre), data: { paymentId: r.paymentId, period: r.period } },
    }));
}
