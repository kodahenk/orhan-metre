import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import {
  ALARM_REPEAT_EVERY_MS,
  MAX_SCHEDULED_PER_BOUNDARY,
  partAlarmMs,
  partDurationMs,
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

// Android kanal ayarları (ses/titreşim dahil) oluşturulduktan sonra
// değiştirilemez; davranış her değiştiğinde yeni kanal kimliği gerekir.
// v3 davranışı: part bittiği anda TEK bildirim ≈5 sn titreşir; 15 sn'de bir
// gelen tekrar bildirimleri titreşimsizdir (yalnızca ses + banner).
const BOUNDARY_CHANNEL_ID = 'faz-alarm-v3';
const REPEAT_CHANNEL_ID = 'faz-tekrar-v1';
const LEGACY_CHANNEL_IDS = ['faz-alarm', 'faz-alarm-v2'];

if (Notifications) {
  // Uygulama öndeyken de bildirim banner'ı görünsün ve ses çalsın. Sınır
  // (k=0) bildirimi ön planda BASTIRILMAZ: alarmSeconds < 30 olduğunda o
  // sınırın tek bildirimi k=0'dır; bastırmak ön planda hiç bildirim
  // görünmemesine yol açıyordu. Çifte titreşim ise öbür uçtan önlenir:
  // bildirimler aktifken uygulama içi titreşim atlanır (use-work-timer).
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
    await Notifications.setNotificationChannelAsync(BOUNDARY_CHANNEL_ID, {
      name: 'Part bitişi',
      importance: Notifications.AndroidImportance.MAX,
      // Sonlu ≈5 sn desen: [bekle, titre, ...] toplamı 5000 ms; tekrar etmez,
      // dolayısıyla titreşim takılı kalamaz.
      vibrationPattern: [0, 1200, 300, 1200, 300, 1200, 300, 500],
    });
    await Notifications.setNotificationChannelAsync(REPEAT_CHANNEL_ID, {
      name: 'Alarm hatırlatmaları',
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: false,
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

// Mola atlama kalan süreyi sonraki parta taşıdığı için dakika ondalıklı
// olabilir; gösterimde en fazla 1 basamağa yuvarlanır.
const fmtMinutes = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1));

function boundaryContent(parts: Part[], boundaryIndex: number, autoAdvance: boolean) {
  const finished = parts[boundaryIndex];
  const next = parts[boundaryIndex + 1];
  if (next) {
    return {
      title: `${finished.label} bitti`,
      body: autoAdvance
        ? `Sıradaki: ${next.label} · ${fmtMinutes(next.minutes)} dk`
        : `Sıradaki: ${next.label} · ${fmtMinutes(next.minutes)} dk — başlatmak için Devam'a bas`,
      sound: 'default' as const,
    };
  }
  const total = Math.round(parts.reduce((sum, p) => sum + p.minutes, 0));
  return {
    title: 'Çalışma tamamlandı 🎉',
    body: `${total} dakikalık seans bitti.`,
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
              // 0. sn'deki ilk bildirim titreşimli kanaldan (≈5 sn), 15 sn'lik
              // tekrarlar titreşimsiz kanaldan gider.
              channelId: k === 0 ? BOUNDARY_CHANNEL_ID : REPEAT_CHANNEL_ID,
            },
          })
          .catch(() => null),
      ),
    );
    scheduled.set(i, ids.filter((id): id is string => id != null));
  }
  return scheduled;
}

/**
 * Bir sınırın henüz atılmamış bildirimlerini iptal eder, atılmışları panelden
 * kaldırır. Yalnızca O SINIRIN kimlikleriyle çalışır (dismissAll değil):
 * başka bir sınırın hâlâ aktif bildirimi yanlışlıkla silinmez ve gecikmeli
 * ikinci temizlik bayat kalsa bile zararsızdır.
 */
export async function silenceBoundaryAlarms(scheduled: ScheduledAlarms, phaseIndex: number) {
  if (!Notifications) return;
  const api = Notifications;
  const ids = scheduled.get(phaseIndex);
  scheduled.delete(phaseIndex);
  if (!ids || ids.length === 0) return;
  const clear = () =>
    Promise.all(
      ids.map((id) =>
        Promise.all([
          api.cancelScheduledNotificationAsync(id).catch(() => {}),
          api.dismissNotificationAsync(id).catch(() => {}),
        ]),
      ),
    );
  await clear();
  // Susturma anında native tarafa çoktan teslim edilmiş bir tekrar, ilk
  // temizlikten SONRA görünebilir; kısa bir gecikmeyle bir kez daha temizle.
  setTimeout(() => void clear(), 1_600);
}

export async function cancelAllSessionAlarms() {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}
