import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import {
  ALARM_REPEAT_EVERY_MS,
  MAX_SCHEDULED_PER_BOUNDARY,
  partAlarmMs,
  partDurationMs,
  totalMinutes,
  type Part,
} from './settings';

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

// Android kanal ayarları (ses dahil) oluşturulduktan sonra değiştirilemez;
// hatalı sesle oluşmuş eski 'faz-alarm' kanalı yerine yeni kimlik kullanılıyor.
const CHANNEL_ID = 'faz-alarm-v2';
const LEGACY_CHANNEL_IDS = ['faz-alarm'];

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
  // Not: `sound` alanı verilmezse sistem varsayılan bildirim sesi kullanılır;
  // string verilirse ('default' dahil) özel ses DOSYASI olarak aranır ve
  // bulunamayınca hata basar (SDK 57 davranışı).
  if (Platform.OS === 'android') {
    await Promise.all(
      LEGACY_CHANNEL_IDS.map((id) =>
        Notifications!.deleteNotificationChannelAsync(id).catch(() => {}),
      ),
    );
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Part alarmları',
      importance: Notifications.AndroidImportance.MAX,
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

function boundaryContent(parts: Part[], boundaryIndex: number, autoAdvance: boolean) {
  const finished = parts[boundaryIndex];
  const next = parts[boundaryIndex + 1];
  if (next) {
    return {
      title: `${finished.label} bitti`,
      body: autoAdvance
        ? `Sıradaki: ${next.label} · ${next.minutes} dk`
        : `Sıradaki: ${next.label} · ${next.minutes} dk — başlatmak için Devam'a bas`,
      sound: 'default' as const,
    };
  }
  return {
    title: 'Çalışma tamamlandı 🎉',
    body: `${totalMinutes(parts)} dakikalık seans bitti.`,
    sound: 'default' as const,
  };
}

/** Part sonu (sınır) index'i → o sınır için zamanlanmış bildirim id'leri. */
export type ScheduledAlarms = Map<number, string[]>;

/**
 * Part sonu bildirimlerini zamanlar; uygulama arka plandayken/ekran
 * kilitliyken alarm bu sayede çalar.
 *
 * Otomatik geçiş modunda mevcut parttan seans sonuna kadar TÜM sınırlar
 * deterministik olduğu için hepsi zamanlanır (part araları alarm süresi kadar
 * boşluk bırakır). Manuel modda sonraki partların başlangıcı bilinemeyeceği
 * için yalnızca mevcut partın sonu zamanlanır; "Devam" denince sonraki için
 * tekrar çağrılır. Tek tek zamanlamalar başarısız olabilir; başaranlar yine de
 * takip edilir.
 */
export async function scheduleSessionAlarms(
  parts: Part[],
  autoAdvance: boolean,
  startPhaseIndex: number,
  currentPhaseEndsAt: number,
): Promise<ScheduledAlarms> {
  const scheduled: ScheduledAlarms = new Map();
  if (!Notifications) return scheduled;
  const api = Notifications;

  const lastBoundary = autoAdvance ? parts.length - 1 : startPhaseIndex;
  let boundary = currentPhaseEndsAt;
  for (let i = startPhaseIndex; i <= lastBoundary; i++) {
    if (i > startPhaseIndex) {
      // Önceki sınır + önceki partın alarm boşluğu + bu partın süresi.
      boundary += partAlarmMs(parts[i - 1]) + partDurationMs(parts[i]);
    }
    const content = boundaryContent(parts, i, autoAdvance);
    const count = Math.min(
      MAX_SCHEDULED_PER_BOUNDARY,
      Math.max(1, Math.floor(partAlarmMs(parts[i]) / ALARM_REPEAT_EVERY_MS)),
    );
    const at = boundary;
    const ids = await Promise.all(
      Array.from({ length: count }, (_, k) =>
        api
          .scheduleNotificationAsync({
            content,
            trigger: {
              type: api.SchedulableTriggerInputTypes.DATE,
              date: at + k * ALARM_REPEAT_EVERY_MS,
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
