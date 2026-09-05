import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { MAX_SCHEDULED_NOTIFICATIONS, PHASE_LABELS, type TimerPhase } from './settings';

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
// Faz geçişinde TEK bildirim ≈5 sn titreşir; Nefes Al boyunca gelen tekrar
// bildirimleri titreşimsizdir (yalnızca ses + banner).
const BOUNDARY_CHANNEL_ID = 'faz-alarm-v3';
const REPEAT_CHANNEL_ID = 'faz-tekrar-v1';
const LEGACY_CHANNEL_IDS = ['faz-alarm', 'faz-alarm-v2'];

if (Notifications) {
  // Uygulama öndeyken de bildirim banner'ı görünsün ve ses çalsın. Geçiş
  // bildirimi ön planda BASTIRILMAZ: kısa Nefes Al sürelerinde o sınırın tek
  // bildirimi odur; bastırmak ön planda hiç bildirim görünmemesine yol
  // açıyordu. Çifte titreşim öbür uçtan önlenir: bildirimler aktifken
  // uygulama içi titreşim atlanır (use-work-timer).
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
  // bulunamayınca kanal sessiz oluşur (SDK 57 davranışı).
  if (Platform.OS === 'android') {
    await Promise.all(
      LEGACY_CHANNEL_IDS.map((id) =>
        Notifications!.deleteNotificationChannelAsync(id).catch(() => {}),
      ),
    );
    await Notifications.setNotificationChannelAsync(BOUNDARY_CHANNEL_ID, {
      name: 'Faz geçişi',
      importance: Notifications.AndroidImportance.MAX,
      // Sonlu ≈5 sn desen: [bekle, titre, ...] toplamı 5000 ms; tekrar etmez,
      // dolayısıyla titreşim takılı kalamaz.
      vibrationPattern: [0, 1200, 300, 1200, 300, 1200, 300, 500],
    });
    await Notifications.setNotificationChannelAsync(REPEAT_CHANNEL_ID, {
      name: 'Nefes Al hatırlatmaları',
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

// Nefes Al süresi borçla kısalabildiği için dakika ondalıklı olabilir;
// gösterimde en fazla 1 basamağa yuvarlanır.
const fmtMinutes = (ms: number) => {
  const m = ms / 60_000;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
};

/** Faz bitiş (sınır) bildirimi: biten faz + sıradaki faz ve süresi. */
function boundaryContent(
  finished: TimerPhase,
  next: TimerPhase,
  nextDurationMs: number,
  nextRound: number,
  autoAdvance: boolean,
) {
  const title = `${PHASE_LABELS[finished]} bitti`;
  if (next === 'focus') {
    // Nefes Al bitti → yeni tur.
    return {
      title: 'Nefes bitti',
      body: autoAdvance
        ? `${nextRound}. tur başlıyor · Odak ${fmtMinutes(nextDurationMs)} dk`
        : `${nextRound}. tur hazır — 'Sonraki tur'a bas`,
      sound: 'default' as const,
    };
  }
  return {
    title,
    body: `Sıradaki: ${PHASE_LABELS[next]} · ${fmtMinutes(nextDurationMs)} dk`,
    sound: 'default' as const,
  };
}

/** Nefes Al penceresi boyunca gelen dürtü: kalan süreyi söyler. */
function breatheReminderContent(remainingMs: number) {
  return {
    title: 'Nefes Al',
    body: `${fmtMinutes(Math.max(0, remainingMs))} dk kaldı.`,
    sound: 'default' as const,
  };
}

/** "Bitmeye X kala" hatırlatma bildirimi (yalnız Odak/Tekrar fazları). */
function preEndContent(phase: TimerPhase, preEndMs: number) {
  const min = Math.max(1, Math.round(preEndMs / 60_000));
  return {
    title: `${PHASE_LABELS[phase]} bitmeye az kaldı`,
    body: `${min} dk sonra ${PHASE_LABELS[phase]} sona erecek.`,
    sound: 'default' as const,
  };
}

/**
 * Faz sıra numarası (round × 3 + faz sırası) → o sınır için zamanlanmış
 * bildirim kimlikleri. Sonsuz döngüde de benzersiz ve artan kalır.
 */
export type ScheduledAlarms = Map<number, string[]>;

/**
 * Nefes Al dürtü bildirimleri, faz GEÇİŞ alarmından ayrı bir anahtarda
 * tutulur (negatif uzay, sınır anahtarlarıyla çakışmaz). Geçiş alarmı ~5 sn
 * sonra kendiliğinden susarken o sınırın tüm kimlikleri iptal edildiği için,
 * aynı anahtarda dursalardı nefes boyunca gelecek dürtüler de silinirdi.
 */
export const breatheRepeatKey = (round: number) => -(round + 1);

export type CycleTimings = {
  focusMs: number;
  reviewMs: number;
  /** Önayardaki planlanan Nefes Al süresi (borç öncesi). */
  breatheMs: number;
  /** Nefes Al boyunca bildirim aralığı. */
  notifyMs: number;
  /** Nefes Al süresinin borçla inebileceği taban. */
  minBreatheMs: number;
};

/**
 * Borcu tek bir Nefes Al süresine uygular: süre en fazla tabana iner.
 * Dönen: [uygulanacak süre, düşülen borç].
 */
export function applyBreatheDebt(
  breatheMs: number,
  debtMs: number,
  minBreatheMs: number,
): [number, number] {
  if (debtMs <= 0) return [breatheMs, 0];
  const floorMs = Math.min(breatheMs, minBreatheMs);
  const cut = Math.min(debtMs, breatheMs - floorMs);
  return cut > 0 ? [breatheMs - cut, cut] : [breatheMs, 0];
}

/**
 * Tur döngüsünün ileri sınırlarını zamanlar; uygulama arka plandayken/ekran
 * kilitliyken alarm bu sayede çalar.
 *
 * Döngü sonsuz olduğu için ileri gidiş bildirim BÜTÇESİYLE sınırlanır
 * (MAX_SCHEDULED_NOTIFICATIONS); oturum ilerledikçe her faz geçişinde yeniden
 * zamanlandığı için pencere kendiliğinden kayar. Manuel modda Nefes Al'dan
 * sonrasının başlangıcı bilinemeyeceği için o sınırda durulur.
 *
 * Nefes Al'ın BAŞLANGICI (= Tekrar'ın sonu) tekrarlı bildirim üretir: nefes
 * süresi boyunca notifyMs aralıklarla dürtülür. Diğer sınırlar tek bildirim.
 */
export async function scheduleCycleAlarms(
  timings: CycleTimings,
  autoAdvance: boolean,
  startRound: number,
  startPhase: TimerPhase,
  currentPhaseEndsAt: number,
  /** Zamanlama anındaki kalan borç; ileri nefesler simüle edilirken tüketilir. */
  debtMs: number,
  /** Odak/Tekrar bitmeden bu kadar ms önce hatırlatma (0 = kapalı). */
  preEndMs = 0,
): Promise<ScheduledAlarms> {
  const scheduled: ScheduledAlarms = new Map();
  if (!Notifications) return scheduled;
  const api = Notifications;

  const seqOf = (round: number, phase: TimerPhase) =>
    round * 3 + (phase === 'focus' ? 0 : phase === 'review' ? 1 : 2);

  let round = startRound;
  let phase: TimerPhase = startPhase;
  let edge = currentPhaseEndsAt;
  let debt = debtMs;
  let budget = MAX_SCHEDULED_NOTIFICATIONS;

  // Nefes Al'ın ORTASINDA yeniden zamanlanıyorsa (duraklat/devam sonrası),
  // pencerenin kalanı için dürtü bildirimleri yeniden kurulur; yoksa nefes
  // sessiz geçerdi. Kimlik, nefese giriş sınırının (Tekrar sonu) anahtarına
  // yazılır ki susturma yolları onu da kapsasın.
  if (startPhase === 'breathe') {
    const remaining = currentPhaseEndsAt - Date.now();
    const count = Math.min(Math.floor(remaining / timings.notifyMs), budget);
    if (count > 0) {
      const first = Date.now() + timings.notifyMs;
      const ids = await Promise.all(
        Array.from({ length: count }, (_, k) =>
          api
            .scheduleNotificationAsync({
              content: breatheReminderContent(remaining - k * timings.notifyMs),
              trigger: {
                type: api.SchedulableTriggerInputTypes.DATE,
                date: first + k * timings.notifyMs,
                channelId: REPEAT_CHANNEL_ID,
              },
            })
            .catch(() => null),
        ),
      );
      const list = ids.filter((id): id is string => id != null);
      if (list.length > 0) scheduled.set(breatheRepeatKey(round), list);
      budget -= count;
    }
  }

  while (budget > 0) {
    // Sıradaki fazı ve süresini belirle (sınır bildiriminin içeriği bunu yazar).
    let nextPhase: TimerPhase;
    let nextRound = round;
    let nextDurationMs: number;
    if (phase === 'focus') {
      nextPhase = 'review';
      nextDurationMs = timings.reviewMs;
    } else if (phase === 'review') {
      nextPhase = 'breathe';
      const [effective, used] = applyBreatheDebt(timings.breatheMs, debt, timings.minBreatheMs);
      debt -= used;
      nextDurationMs = effective;
    } else {
      nextPhase = 'focus';
      nextRound = round + 1;
      nextDurationMs = timings.focusMs;
    }

    const seq = seqOf(round, phase);
    const content = boundaryContent(phase, nextPhase, nextDurationMs, nextRound + 1, autoAdvance);
    const ids: string[] = [];

    // Nefes Al'a girilen sınırda pencere boyunca tekrar; diğerlerinde tek.
    const repeats =
      nextPhase === 'breathe'
        ? Math.max(1, Math.floor(nextDurationMs / timings.notifyMs))
        : 1;
    const count = Math.min(repeats, budget);
    const at = edge;
    const scheduledIds = await Promise.all(
      Array.from({ length: count }, (_, k) =>
        api
          .scheduleNotificationAsync({
            // k=0 geçiş bildirimi; k>=1 nefes dürtüsü (kalan süreyi yazar).
            content: k === 0 ? content : breatheReminderContent(nextDurationMs - k * timings.notifyMs),
            trigger: {
              type: api.SchedulableTriggerInputTypes.DATE,
              date: at + k * timings.notifyMs,
              // İlk bildirim titreşimli kanaldan (≈5 sn), tekrarlar
              // titreşimsiz kanaldan gider.
              channelId: k === 0 ? BOUNDARY_CHANNEL_ID : REPEAT_CHANNEL_ID,
            },
          })
          .catch(() => null),
      ),
    );
    // k=0 geçiş bildirimi (titreşimli) sınır anahtarına; k>=1 nefes dürtüleri
    // ayrı anahtara — geçiş alarmı sustuğunda dürtüler hayatta kalsın.
    const repeatIds: string[] = [];
    scheduledIds.forEach((id, k) => {
      if (!id) return;
      if (k === 0) ids.push(id);
      else repeatIds.push(id);
    });
    if (repeatIds.length > 0) {
      const key = breatheRepeatKey(round);
      scheduled.set(key, [...(scheduled.get(key) ?? []), ...repeatIds]);
    }
    budget -= count;

    // Bitiş hatırlatıcısı: yalnızca Odak/Tekrar fazları için, o fazın
    // sonundan preEndMs önce. Kimlik AYNI sınır anahtarına eklenir ki
    // susturma / yeniden zamanlama yolları onu da kapsasın. Faz süresi
    // hatırlatmadan kısaysa ya da tetik geçmişte kaldıysa atlanır.
    const phaseDur = phase === 'focus' ? timings.focusMs : timings.reviewMs;
    if (preEndMs > 0 && phase !== 'breathe' && phaseDur > preEndMs && budget > 0) {
      const preAt = at - preEndMs;
      if (preAt > Date.now() + 1_000) {
        const preId = await api
          .scheduleNotificationAsync({
            content: preEndContent(phase, preEndMs),
            trigger: {
              type: api.SchedulableTriggerInputTypes.DATE,
              date: preAt,
              channelId: REPEAT_CHANNEL_ID,
            },
          })
          .catch(() => null);
        if (preId) {
          ids.push(preId);
          budget -= 1;
        }
      }
    }

    scheduled.set(seq, ids);

    // Manuel modda Nefes Al'dan sonrasının başlangıcı bilinemez: burada dur.
    if (phase === 'breathe' && !autoAdvance) break;

    round = nextRound;
    phase = nextPhase;
    edge += nextDurationMs;
  }
  return scheduled;
}

/**
 * Bir sınırın henüz atılmamış bildirimlerini iptal eder, atılmışları panelden
 * kaldırır. Yalnızca O SINIRIN kimlikleriyle çalışır (dismissAll değil):
 * başka bir sınırın hâlâ aktif bildirimi yanlışlıkla silinmez ve gecikmeli
 * ikinci temizlik bayat kalsa bile zararsızdır.
 */
export async function silenceBoundaryAlarms(scheduled: ScheduledAlarms, phaseSeq: number) {
  if (!Notifications) return;
  const api = Notifications;
  const ids = scheduled.get(phaseSeq);
  scheduled.delete(phaseSeq);
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
