import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { formatDayMonth, formatMoney } from '@/lib/format';
import { alertText, alertTime, type Subscription } from '@/lib/subscriptions';

/**
 * Helyi értesítések (szerver nélkül):
 *  - havi emlékeztető minden hónap 3-án 10 órakor a kivonat importálására (koppintásra: Import fül);
 *  - előfizetés-értesítők a következő megújulás előtt (koppintásra: Előfizetések képernyő).
 * Minden értesítés saját azonosítót kap, így egymást nem törlik.
 */
const REMINDER_CHANNEL = 'havi-emlekezteto';
const SUBS_CHANNEL = 'elofizetesek';
const MONTHLY_ID = 'monthly-reminder';
const SUB_PREFIX = 'sub:';
export const REMINDER_DAY = 3;
export const REMINDER_HOUR = 10;
export const ALERT_HOUR = 9;

export const remindersSupported = Platform.OS !== 'web';

/** Engedélyt kér (ha még nincs). Hamis, ha a felhasználó nem engedélyezte. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!remindersSupported) return false;
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) perm = await Notifications.requestPermissionsAsync();
  return perm.granted;
}

async function hasPermission(): Promise<boolean> {
  return remindersSupported && (await Notifications.getPermissionsAsync()).granted;
}

async function cancelWhere(pred: (r: Notifications.NotificationRequest) => boolean): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter(pred).map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier)));
}

async function ensureChannel(id: string, name: string) {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(id, { name, importance: AndroidImportance.DEFAULT });
}

/** Bekapcsolja a havi emlékeztetőt. Hamis, ha a felhasználó nem engedélyezte az értesítéseket. */
export async function enableMonthlyReminder(): Promise<boolean> {
  if (!(await requestNotificationPermission())) return false;
  await ensureChannel(REMINDER_CHANNEL, 'Havi emlékeztető');
  // A korábbi verziók azonosító nélkül ütemezték: azokat is töröljük, hogy ne szóljon kétszer.
  await cancelWhere((r) => r.identifier === MONTHLY_ID || r.content.data?.screen === 'import');
  await Notifications.scheduleNotificationAsync({
    identifier: MONTHLY_ID,
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
      channelId: REMINDER_CHANNEL,
    },
  });
  return true;
}

export async function disableMonthlyReminder(): Promise<void> {
  if (!remindersSupported) return;
  await cancelWhere((r) => r.identifier === MONTHLY_ID || r.content.data?.screen === 'import');
}

/**
 * Az előfizetés-értesítők újraütemezése: minden aktív előfizetésre a következő megújulás előtt egy.
 * Engedélyt nem kér (azt a bekapcsoláskor kérjük); ha nincs engedély, nem csinál semmit.
 * Visszaadja, hány értesítést ütemezett.
 */
export async function syncSubscriptionAlerts(subs: Subscription[], enabled: boolean, daysBefore: number): Promise<number> {
  if (!remindersSupported) return 0;
  await cancelWhere((r) => r.identifier.startsWith(SUB_PREFIX));
  if (!enabled || !(await hasPermission())) return 0;
  await ensureChannel(SUBS_CHANNEL, 'Előfizetések megújulása');
  const now = new Date();
  let count = 0;
  for (const s of subs) {
    if (s.stale || s.daysUntil > 45) continue;
    const at = alertTime(s.nextDate, daysBefore, now, ALERT_HOUR);
    if (!at) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${SUB_PREFIX}${s.key}`,
      content: {
        title: `🔔 ${alertText(s, at)}`,
        body: `${formatMoney(s.amount, s.currency)} · ${formatDayMonth(s.nextDate)}${s.confirmed ? '' : ' (becsült)'}. Ha már nem használod, most még lemondhatod.`,
        data: { screen: 'subscriptions' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: SUBS_CHANNEL },
    });
    count++;
  }
  return count;
}

/** Értesítésre koppintáskor a megfelelő képernyőt nyitja meg. */
export function onNotificationTapped(handler: (screen: 'import' | 'subscriptions') => void): () => void {
  if (!remindersSupported) return () => {};
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const screenOf = (r: Notifications.NotificationResponse | null) => {
    const s = r?.notification.request.content.data?.screen;
    return s === 'import' || s === 'subscriptions' ? s : null;
  };
  Notifications.getLastNotificationResponseAsync().then((r) => {
    const s = screenOf(r);
    if (s) handler(s);
  });
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const s = screenOf(r);
    if (s) handler(s);
  });
  return () => sub.remove();
}
