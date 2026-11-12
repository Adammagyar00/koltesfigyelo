import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Havi emlékeztető (helyi értesítés, szerver nélkül): minden hónap 3-án 10 órakor szól, hogy töltsd le
 * az előző havi kivonatot. Koppintásra az Import fül nyílik meg (lásd a gyökér-elrendezést).
 */
const CHANNEL = 'havi-emlekezteto';
export const REMINDER_DAY = 3;
export const REMINDER_HOUR = 10;

export const remindersSupported = Platform.OS !== 'web';

/** Bekapcsolja az emlékeztetőt. Hamis, ha a felhasználó nem engedélyezte az értesítéseket. */
export async function enableMonthlyReminder(): Promise<boolean> {
  if (!remindersSupported) return false;
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Havi emlékeztető',
      importance: AndroidImportance.DEFAULT,
    });
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Itt a havi kivonat ideje 📄',
      body: 'Töltsd le az előző havi bankszámlakivonatot, és importáld a Költésfigyelőbe.',
      data: { screen: 'import' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: REMINDER_DAY,
      hour: REMINDER_HOUR,
      minute: 0,
      channelId: CHANNEL,
    },
  });
  return true;
}

export async function disableMonthlyReminder(): Promise<void> {
  if (!remindersSupported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Ha az emlékeztetőre koppintottak, ezt hívja meg (az appot az Import fülre visszük). */
export function onReminderTapped(handler: () => void): () => void {
  if (!remindersSupported) return () => {};
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const isReminder = (r: Notifications.NotificationResponse | null) =>
    r?.notification.request.content.data?.screen === 'import';
  Notifications.getLastNotificationResponseAsync().then((r) => {
    if (isReminder(r)) handler();
  });
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    if (isReminder(r)) handler();
  });
  return () => sub.remove();
}
