import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { ALARM_WINDOW_MS, WORK_PHASES, phaseDurationMs } from './phases';

// SDK 53'ten beri expo-notifications, Android Expo Go'da import anında hata
// fırlatıyor. Bu yüzden modül statik değil koşullu yükleniyor: Expo Go'da
// alarmlar yalnızca uygulama içi titreşimle çalışır; bildirimlerin tamamı için
// development build gerekir (npx expo run:android).
type NotificationsModule = typeof import('expo-notifications');

const supported = Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());

const Notifications: NotificationsModule | null = supported
  ? (require('expo-notifications') as NotificationsModule)
  : null;

export const notificationsSupported = supported;

const CHANNEL_ID = 'faz-alarm';

// 5 sn'lik alarm penceresi boyunca ~1.5 sn arayla bildirim.
const ALARM_REPEAT_OFFSETS_MS = [0, 1_500, 3_000, ALARM_WINDOW_MS - 500];

if (Notifications) {
  // Uygulama öndeyken de bildirim banner'ı görünsün ve ses çalsın.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function prepareNotifications(): Promise<boolean> {
  if (!Notifications) return false;
  // Android 13+: izin istemi kanal oluşturulmadan görünmez → önce kanal.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Faz alarmları',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 600, 250, 600],
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Bildirime dokunulduğunda çağrılır (alarmın "durduruldu" sayılması için). */
export function addNotificationTapListener(onTap: () => void): () => void {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(() => onTap());
  return () => sub.remove();
}

function boundaryContent(phaseIndex: number) {
  const finished = WORK_PHASES[phaseIndex];
  const next = WORK_PHASES[phaseIndex + 1];
  if (next) {
    return {
      title: `${finished.label} bitti`,
      body: `Sıradaki: ${next.label} · ${next.minutes} dk`,
      sound: 'default' as const,
    };
  }
  return {
    title: 'Çalışma tamamlandı 🎉',
    body: 'Bir saatlik seans bitti.',
    sound: 'default' as const,
  };
}

/** Faz sonu (sınır) index'i → o sınır için zamanlanmış bildirim id'leri. */
export type ScheduledAlarms = Map<number, string[]>;

/**
 * Mevcut fazdan seans sonuna kadar tüm faz sınırları için bildirimleri zamanlar.
 * Uygulama arka plandayken/ekran kilitliyken de alarm bu sayede çalar.
 * Tek tek zamanlamalar başarısız olabilir; başaranlar yine de takip edilir.
 */
export async function scheduleSessionAlarms(
  startPhaseIndex: number,
  currentPhaseEndsAt: number,
): Promise<ScheduledAlarms> {
  const scheduled: ScheduledAlarms = new Map();
  if (!Notifications) return scheduled;
  const api = Notifications;

  let boundary = currentPhaseEndsAt;
  for (let i = startPhaseIndex; i < WORK_PHASES.length; i++) {
    if (i > startPhaseIndex) boundary += phaseDurationMs(WORK_PHASES[i]);
    const content = boundaryContent(i);
    const at = boundary;
    const ids = await Promise.all(
      ALARM_REPEAT_OFFSETS_MS.map((offset) =>
        api
          .scheduleNotificationAsync({
            content,
            trigger: {
              type: api.SchedulableTriggerInputTypes.DATE,
              date: at + offset,
              channelId: CHANNEL_ID,
            },
          })
          .catch(() => null),
      ),
    );
    scheduled.set(i, ids.filter((id): id is string => id != null));
  }
  return scheduled;
}

/** Bir sınırın henüz atılmamış bildirimlerini iptal eder, atılmışları panelden kaldırır. */
export async function silenceBoundaryAlarms(scheduled: ScheduledAlarms, phaseIndex: number) {
  if (!Notifications) return;
  const api = Notifications;
  const ids = scheduled.get(phaseIndex);
  scheduled.delete(phaseIndex);
  if (ids) {
    await Promise.all(ids.map((id) => api.cancelScheduledNotificationAsync(id).catch(() => {})));
  }
  await api.dismissAllNotificationsAsync().catch(() => {});
  // Tam susturma anında native tarafa çoktan teslim edilmiş bir tekrar,
  // dismiss'ten SONRA görünebilir; kısa bir gecikmeyle bir kez daha temizle.
  setTimeout(() => void api.dismissAllNotificationsAsync().catch(() => {}), 1_600);
}

export async function cancelAllSessionAlarms() {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}
