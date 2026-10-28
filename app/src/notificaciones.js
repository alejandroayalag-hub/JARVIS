import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { cargarSesion, get, usuario } from './api';
import { toNotifications } from './avisos';

const TAREA = 'jarvis-sync';
const CANAL = 'pagos';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Descarga los recordatorios y los reprograma todos en el celular. Suenan aunque no haya red.
export async function syncReminders() {
  if (!usuario()) return 0;
  const avisos = toNotifications(await get('/api/reminders'), usuario().name);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const a of avisos) {
    await Notifications.scheduleNotificationAsync({
      content: { ...a.content, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.date, channelId: CANAL },
    });
  }
  return avisos.length;
}

TaskManager.defineTask(TAREA, async () => {
  try {
    await cargarSesion();
    await syncReminders();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function prepararAvisos() {
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Pagos', importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 300, 200, 300],
  });
  const { status } = await Notifications.requestPermissionsAsync();
  // ponytail: Android decide el intervalo real (mín. 15 min); abrir la app también sincroniza.
  await BackgroundTask.registerTaskAsync(TAREA, { minimumInterval: 15 }).catch(() => {});
  return status === 'granted';
}
