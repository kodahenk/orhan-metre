import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

import { newId, useProjects } from '@/features/projects/projects-context';
import { useSessions, type WorkSession } from '@/features/sessions/sessions-context';
import { hideMiniTimer, showMiniTimer } from './mini-timer';
import {
  addNotificationTapListener,
  cancelAllSessionAlarms,
  prepareNotifications,
  scheduleSessionAlarms,
  silenceBoundaryAlarms,
  type ScheduledAlarms,
} from './notifications';
import { partAlarmMs, partDurationMs, type Part, type TimerPreset } from './settings';
import { useTimerSettings } from './settings-context';

/**
 * idle → running → between → running → ... → done
 * 'between': bir part bitti, alarm penceresi işliyor. Otomatik geçiş modunda
 * pencere dolunca sonraki part kendiliğinden başlar; manuel modda "Devam"
 * beklenir. Her iki modda da "Devam" ile erken geçilebilir.
 *
 * Zaman takibi: oturum başlarken proje ve önayar sabitlenir; yalnızca 'work'
 * türü partlarda fiilen geçen süre sayılır. done → 'completed', sıfırlama →
 * 'abandoned' kaydı düşülür (60 sn'den kısa çalışma sessizce atılır).
 */
export type TimerStatus = 'idle' | 'running' | 'between' | 'paused' | 'done';

const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'work-timer';
// Titreşim yalnızca part bittiği anda ve sonlu: tekrar bayrağı (repeat)
// kullanılmaz, böylece susturma kaçırılsa bile titreşim kendiliğinden biter
// ("takılı kalma" yok). Pencerenin kalanında yalnızca 15 sn'de bir bildirim var.
const ALARM_VIBRATION_MS = 5_000;
const LAST_PROJECT_KEY = 'timer-last-project';
const MIN_RECORDED_WORK_SECONDS = 60;

// Gösterim 10 sn'lik adımlarla yapılır (her saniye değişen sayaç dikkat
// dağıtıyor); kalan süre yukarı yuvarlanır, render sıklığı da 1/10'a düşer.
const displaySeconds = (ms: number) => Math.max(0, Math.ceil(ms / 10_000) * 10);
const partSeconds = (part: Part) => displaySeconds(partDurationMs(part));

export type LastSaved = {
  projectId: string | null;
  workSeconds: number;
  status: 'completed' | 'abandoned';
};

export function useWorkTimer() {
  const { settings, presets } = useTimerSettings();
  const { projects } = useProjects();
  const { addSession } = useSessions();

  const [status, setStatus] = useState<TimerStatus>('idle');
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);
  // Boştayken seçili proje (kalıcı: son kullanılan); oturum başlayınca kilitlenir.
  const [pendingProjectId, setPendingProjectIdState] = useState<string | null>(null);
  const [sessionProjectId, setSessionProjectId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  // Oturum başlarken parçalar ve mod anlık kopyalanır; ayarlar oturum
  // ortasında değişirse yeni değerler bir SONRAKİ oturumda geçerli olur.
  const [sessionParts, setSessionParts] = useState<Part[] | null>(null);
  const [sessionAuto, setSessionAuto] = useState<boolean | null>(null);
  // null: henüz sorulmadı. false: izin yok/desteklenmiyor → arka planda alarm
  // çalmayacağı için arayüz kullanıcıyı uyarır.
  const [notificationsGranted, setNotificationsGranted] = useState<boolean | null>(null);
  const notificationsGrantedRef = useRef(false);

  // Boştaki gösterim: seçili projenin önayarı (yoksa genel varsayılan).
  const pendingPreset: TimerPreset = useMemo(() => {
    const project = pendingProjectId ? projects.find((p) => p.id === pendingProjectId) : null;
    const byProject = project?.defaultPresetId
      ? presets.find((p) => p.id === project.defaultPresetId)
      : null;
    return byProject ?? presets.find((p) => p.id === settings.activePresetId) ?? presets[0];
  }, [pendingProjectId, projects, presets, settings.activePresetId]);

  const [secondsLeft, setSecondsLeft] = useState(() => partSeconds(pendingPreset.parts[0]));

  const statusRef = useRef<TimerStatus>('idle');
  const phaseIndexRef = useRef(0);
  const endsAtRef = useRef(0);
  const pausedRemainingRef = useRef(0);
  const sessionPartsRef = useRef<Part[]>(pendingPreset.parts);
  const autoAdvanceRef = useRef(settings.autoAdvance);
  // Oturum başında dondurulur (autoAdvance deseniyle aynı): ms cinsinden.
  const workEndReminderMsRef = useRef(0);
  const pendingPresetRef = useRef(pendingPreset);
  const settingsRef = useRef(settings);
  const pendingProjectRef = useRef<string | null>(null);
  const scheduledRef = useRef<ScheduledAlarms>(new Map());
  const alarmBoundaryRef = useRef<number | null>(null);
  const alarmEndsAtRef = useRef(0);
  const alarmVibrateEndsAtRef = useRef(0);
  const alarmStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Her durum geçişinde artar; await sonrası bayatlamış devamları geçersiz kılar.
  const epochRef = useRef(0);

  // Oturum muhasebesi.
  const sessionActiveRef = useRef(false);
  const sessionProjectRef = useRef<string | null>(null);
  const sessionPresetRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef(0);
  const workMsRef = useRef(0);
  const breakMsRef = useRef(0);
  const completedWorkPartsRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
    pendingPresetRef.current = pendingPreset;
    // Boştayken önayar/proje değişirse gösterilen süre güncel kalsın.
    if (statusRef.current === 'idle') {
      setSecondsLeft(partSeconds(pendingPreset.parts[0]));
    }
  }, [settings, pendingPreset]);

  // Son kullanılan proje kalıcıdır. Kullanıcı okuma tamamlanmadan seçim
  // yaptıysa (touched) gecikmiş eski değer seçimi ezmesin.
  const pendingProjectTouchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Storage.getItem(LAST_PROJECT_KEY)
      .then((raw) => {
        if (!cancelled && !pendingProjectTouchedRef.current && raw) {
          pendingProjectRef.current = raw === 'null' ? null : raw;
          setPendingProjectIdState(pendingProjectRef.current);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setPendingProject = useCallback((projectId: string | null) => {
    pendingProjectTouchedRef.current = true;
    pendingProjectRef.current = projectId;
    setPendingProjectIdState(projectId);
    void Storage.setItem(LAST_PROJECT_KEY, projectId ?? 'null').catch(() => {});
  }, []);

  const stopAlarm = useCallback(() => {
    Vibration.cancel();
    if (alarmStopTimer.current) {
      clearTimeout(alarmStopTimer.current);
      alarmStopTimer.current = null;
    }
    const boundary = alarmBoundaryRef.current;
    alarmBoundaryRef.current = null;
    alarmVibrateEndsAtRef.current = 0;
    setAlarmActive(false);
    if (boundary != null) void silenceBoundaryAlarms(scheduledRef.current, boundary);
  }, []);

  /** vibrateMs: 5 sn'lik başlangıç titreşiminden geriye kalan kısım (0 = titreme). */
  const startAlarm = useCallback(
    (boundary: number, windowMs: number, vibrateMs: number) => {
      stopAlarm();
      alarmBoundaryRef.current = boundary;
      alarmEndsAtRef.current = Date.now() + windowMs;
      setAlarmActive(true);
      // Android'de bildirimler aktifken 0. sn titreşimini k=0 sınır
      // bildiriminin kanal deseni (≈5 sn) verir; uygulama içi titreşim
      // atlanır ki iki kaynak çakışmasın (çifte titreşim). iOS / Expo Go /
      // izin yok durumlarında uygulama içi titreşim devrededir.
      const channelVibrates = Platform.OS === 'android' && notificationsGrantedRef.current;
      if (vibrateMs > 0 && !channelVibrates) {
        alarmVibrateEndsAtRef.current = Date.now() + vibrateMs;
        // Süreli tek titreşim (Android); iOS süreyi yok sayıp tek kez titrer.
        Vibration.vibrate(vibrateMs);
      }
      alarmStopTimer.current = setTimeout(stopAlarm, windowMs);
    },
    [stopAlarm],
  );

  /**
   * Oturumu kayda döker. extraMs: mevcut partın kaydedilecek kısmı.
   * endedAtMs: oturumun GERÇEK bitiş anı — arka planda biten oturum,
   * uygulamanın açıldığı an değil sınırın geçildiği anla kaydedilsin.
   */
  const finishSession = useCallback(
    (
      finalStatus: 'completed' | 'abandoned',
      extraMs: number,
      extraType?: Part['type'],
      endedAtMs?: number,
    ) => {
      if (!sessionActiveRef.current) return;
      sessionActiveRef.current = false;
      let workMs = workMsRef.current;
      let breakMs = breakMsRef.current;
      if (extraMs > 0 && extraType === 'work') workMs += extraMs;
      if (extraMs > 0 && extraType === 'break') breakMs += extraMs;
      const workSeconds = Math.round(workMs / 1000);
      if (workSeconds < MIN_RECORDED_WORK_SECONDS) return; // gürültü filtresi
      const session: WorkSession = {
        id: newId(),
        projectId: sessionProjectRef.current,
        presetId: sessionPresetRef.current,
        startedAt: sessionStartedAtRef.current,
        endedAt: endedAtMs ?? Date.now(),
        workSeconds,
        breakSeconds: Math.round(breakMs / 1000),
        completedWorkParts: completedWorkPartsRef.current,
        plannedWorkParts: sessionPartsRef.current.filter((p) => p.type === 'work').length,
        status: finalStatus,
      };
      addSession(session);
      setLastSaved({ projectId: session.projectId, workSeconds, status: finalStatus });
    },
    [addSession],
  );

  // Tik + arka plandan dönüş senkronu: part → alarm boşluğu → part segmentleri
  // üzerinde ilerlenir; manuel modda boşlukta durulur. Geçilen her part,
  // türüne göre çalışma/mola süresine tam olarak eklenir.
  const syncNow = useCallback(() => {
    const st = statusRef.current;
    if (st !== 'running' && st !== 'between') return;
    const now = Date.now();
    const parts = sessionPartsRef.current;
    const auto = autoAdvanceRef.current;

    let idx = phaseIndexRef.current;
    let seg: 'part' | 'gap' = st === 'running' ? 'part' : 'gap';
    let edge = endsAtRef.current;
    let finished = false;
    const crossed: { index: number; at: number }[] = [];

    while (true) {
      if (seg === 'gap' && !auto) break;
      if (now < edge) break;
      if (seg === 'part') {
        crossed.push({ index: idx, at: edge });
        if (idx >= parts.length - 1) {
          finished = true;
          break;
        }
        seg = 'gap';
        edge += partAlarmMs(parts[idx]);
      } else {
        idx += 1;
        seg = 'part';
        edge += partDurationMs(parts[idx]);
      }
    }

    if (crossed.length > 0) {
      // Muhasebe: biten her part türüne göre tam süresiyle sayılır.
      for (const b of crossed) {
        const part = parts[b.index];
        if (part.type === 'work') {
          workMsRef.current += partDurationMs(part);
          completedWorkPartsRef.current += 1;
        } else {
          breakMsRef.current += partDurationMs(part);
        }
      }
      const last = crossed[crossed.length - 1];
      for (const b of crossed.slice(0, -1)) {
        void silenceBoundaryAlarms(scheduledRef.current, b.index);
      }
      const windowMs = partAlarmMs(parts[last.index]);
      const overshoot = now - last.at;
      if (overshoot < windowMs) {
        // Sınır geçileli 5 sn'den fazla olduysa (ör. arka plandan dönüş)
        // titreşim payı kalmamıştır; yalnızca alarm penceresi işler.
        startAlarm(last.index, windowMs - overshoot, Math.max(0, ALARM_VIBRATION_MS - overshoot));
      } else {
        void silenceBoundaryAlarms(scheduledRef.current, last.index);
      }
    }

    if (finished) {
      statusRef.current = 'done';
      phaseIndexRef.current = parts.length - 1;
      setStatus('done');
      setPhaseIndex(parts.length - 1);
      setSecondsLeft(0);
      // finished yalnızca son partın sınırı geçilince true olur → crossed dolu;
      // bitiş anı "şimdi" değil, son sınırın geçildiği andır.
      finishSession('completed', 0, undefined, crossed[crossed.length - 1].at);
      return;
    }

    const nextStatus: TimerStatus = seg === 'part' ? 'running' : 'between';
    if (nextStatus !== statusRef.current || idx !== phaseIndexRef.current) {
      statusRef.current = nextStatus;
      phaseIndexRef.current = idx;
      endsAtRef.current = edge;
      setStatus(nextStatus);
      setPhaseIndex(idx);
      if (nextStatus === 'between') {
        setSecondsLeft(partSeconds(parts[idx + 1]));
      }
    }
    if (statusRef.current === 'running') {
      setSecondsLeft(displaySeconds(endsAtRef.current - now));
    }
  }, [startAlarm, finishSession]);

  useEffect(() => {
    if (status !== 'running' && status !== 'between') return;
    const id = setInterval(syncNow, TICK_MS);
    return () => clearInterval(id);
  }, [status, syncNow]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        Vibration.cancel();
        // Arka plan mini sayacı: yalnızca bir part fiilen akarken gösterilir.
        // Tikleme native tarafta (endsAt ile) sürer; JS burada durur.
        if (statusRef.current === 'running') {
          showMiniTimer(
            endsAtRef.current,
            sessionPartsRef.current[phaseIndexRef.current].label,
          );
        }
        return;
      }
      hideMiniTimer();
      syncNow();
      if (alarmBoundaryRef.current != null) {
        const remaining = alarmEndsAtRef.current - Date.now();
        if (remaining <= 0) {
          stopAlarm();
        } else {
          // Yalnızca 5 sn'lik başlangıç titreşiminin kalanı devam eder;
          // pencerenin geri kalanı titreşimsizdir (bildirimler zamanlı).
          const vibrateLeft = alarmVibrateEndsAtRef.current - Date.now();
          if (vibrateLeft > 0) Vibration.vibrate(vibrateLeft);
          if (alarmStopTimer.current) clearTimeout(alarmStopTimer.current);
          alarmStopTimer.current = setTimeout(stopAlarm, remaining);
        }
      }
    });
    return () => sub.remove();
  }, [syncNow, stopAlarm]);

  useEffect(() => {
    return addNotificationTapListener(() => {
      syncNow();
      stopAlarm();
    });
  }, [syncNow, stopAlarm]);

  useEffect(() => {
    if (statusRef.current === 'idle') void cancelAllSessionAlarms();
  }, []);

  useEffect(() => {
    if (status !== 'running' && status !== 'between') return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [status]);

  useEffect(() => {
    return () => {
      Vibration.cancel();
      hideMiniTimer();
      if (alarmStopTimer.current) clearTimeout(alarmStopTimer.current);
    };
  }, []);

  /**
   * Bildirimleri MEVCUT konumdan zamanlar. Konum parametre olarak alınmaz:
   * await'ler (izin diyaloğu, toplu iptal) sırasında sayaç tiklemeye devam
   * eder ve sınır geçilmiş olabilir; await öncesi yakalanmış bayat
   * index/endsAt ile zamanlamak tüm alarmları kaydırırdı. Konum bu yüzden
   * iptal await'inden SONRA ref'lerden okunur.
   */
  const rescheduleAlarms = useCallback(async (epoch: number) => {
    await cancelAllSessionAlarms();
    if (epochRef.current !== epoch) return;
    const parts = sessionPartsRef.current;
    const auto = autoAdvanceRef.current;
    const st = statusRef.current;
    let fromIndex = phaseIndexRef.current;
    let endsAt = endsAtRef.current;
    if (st === 'between') {
      // Mevcut sınır çoktan geçti. Otomatik modda sonraki part boşluk bitince
      // (endsAt) başlar; manuel modda başlangıç bilinemez, "Devam" yeniden
      // zamanlayacağı için burada zamanlanacak bir şey yok.
      if (!auto || fromIndex >= parts.length - 1) return;
      fromIndex += 1;
      endsAt += partDurationMs(parts[fromIndex]);
    } else if (st !== 'running') {
      return; // idle/paused/done: zamanlanacak sınır yok
    }
    const scheduled = await scheduleSessionAlarms(
      parts,
      auto,
      fromIndex,
      endsAt,
      workEndReminderMsRef.current,
    );
    if (epochRef.current !== epoch) {
      for (const key of [...scheduled.keys()]) void silenceBoundaryAlarms(scheduled, key);
      return;
    }
    scheduledRef.current = scheduled;
  }, []);

  const start = useCallback(async () => {
    // Yalnızca idle/done'dan başlanır: 'paused' oturumu kayıtsız silecek gizli
    // yol kapalı (devam/sıfırla kullanılmalı).
    if (statusRef.current !== 'idle' && statusRef.current !== 'done') return;
    const epoch = ++epochRef.current;
    // 'done' + alarm penceresi açıkken başlatılırsa eski alarmın zamanlayıcısı
    // yeni oturumun bildirimlerini susturmasın.
    stopAlarm();
    const preset = pendingPresetRef.current;
    const parts = preset.parts;
    sessionPartsRef.current = parts;
    autoAdvanceRef.current = settingsRef.current.autoAdvance;
    workEndReminderMsRef.current = Math.max(
      0,
      settingsRef.current.workEndReminderMinutes * 60_000,
    );
    setSessionParts(parts);
    setSessionAuto(settingsRef.current.autoAdvance);
    setLastSaved(null);

    // Oturum muhasebesini başlat: proje/önayar kilitlenir.
    sessionActiveRef.current = true;
    sessionProjectRef.current = pendingProjectRef.current;
    sessionPresetRef.current = preset.id;
    sessionStartedAtRef.current = Date.now();
    workMsRef.current = 0;
    breakMsRef.current = 0;
    completedWorkPartsRef.current = 0;
    setSessionProjectId(pendingProjectRef.current);

    statusRef.current = 'running';
    phaseIndexRef.current = 0;
    endsAtRef.current = Date.now() + partDurationMs(parts[0]);
    setStatus('running');
    setPhaseIndex(0);
    setSecondsLeft(partSeconds(parts[0]));

    const granted = await prepareNotifications().catch(() => false);
    notificationsGrantedRef.current = granted;
    setNotificationsGranted(granted);
    if (epochRef.current !== epoch) return;
    await rescheduleAlarms(epoch);
  }, [stopAlarm, rescheduleAlarms]);

  /** Partlar arası beklemeden sonraki parta geç ("Devam"). */
  const advance = useCallback(async () => {
    if (statusRef.current !== 'between') return;
    const epoch = ++epochRef.current;
    stopAlarm();
    const parts = sessionPartsRef.current;
    const next = phaseIndexRef.current + 1;
    statusRef.current = 'running';
    phaseIndexRef.current = next;
    endsAtRef.current = Date.now() + partDurationMs(parts[next]);
    setStatus('running');
    setPhaseIndex(next);
    setSecondsLeft(partSeconds(parts[next]));
    await rescheduleAlarms(epoch);
  }, [stopAlarm, rescheduleAlarms]);

  /**
   * Çalışan molayı atlar; kalan mola süresi sıradaki İLK MOLAYA eklenir
   * (dinlenme ertelenir — oturuma özel kopyada, önayara yazılmaz). Sonrasında
   * hiç mola yoksa süre kaybolmasın diye ilk ÇALIŞMA partına eklenir.
   * Muhasebede molanın yalnızca fiilen geçen kısmı sayılır; taşınan süre,
   * uzayan part hangi türdense o türde sayılır. Mola son part ise atlamak
   * seansı tamamlar.
   */
  const skipBreak = useCallback(async () => {
    if (statusRef.current !== 'running') return;
    const parts = sessionPartsRef.current;
    const idx = phaseIndexRef.current;
    if (parts[idx].type !== 'break') return;
    const epoch = ++epochRef.current;
    stopAlarm();
    const now = Date.now();
    const remainingMs = Math.max(0, endsAtRef.current - now);
    breakMsRef.current += Math.max(0, partDurationMs(parts[idx]) - remainingMs);

    if (idx >= parts.length - 1) {
      statusRef.current = 'done';
      setStatus('done');
      setSecondsLeft(0);
      finishSession('completed', 0);
      scheduledRef.current = new Map();
      void cancelAllSessionAlarms();
      return;
    }

    const next = idx + 1;
    // Aktarım hedefi: idx'ten sonraki ilk MOLA; yoksa ilk çalışma partı.
    // (idx son part değil — o durum yukarıda seansı bitirdi — dolayısıyla
    // normalde bir hedef bulunur; güvenlik için -1 yine de kontrol edilir.)
    const nextBreak = parts.findIndex((p, i) => i > idx && p.type === 'break');
    const target = nextBreak !== -1 ? nextBreak : parts.findIndex((p, i) => i > idx && p.type === 'work');
    const newParts =
      target === -1
        ? parts
        : parts.map((p, i) =>
            i === target ? { ...p, minutes: p.minutes + remainingMs / 60_000 } : p,
          );
    sessionPartsRef.current = newParts;
    setSessionParts(newParts);
    statusRef.current = 'running';
    phaseIndexRef.current = next;
    endsAtRef.current = now + partDurationMs(newParts[next]);
    setPhaseIndex(next);
    setSecondsLeft(displaySeconds(endsAtRef.current - now));
    await rescheduleAlarms(epoch);
  }, [stopAlarm, finishSession, rescheduleAlarms]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    epochRef.current += 1;
    stopAlarm();
    pausedRemainingRef.current = Math.max(0, endsAtRef.current - Date.now());
    statusRef.current = 'paused';
    setStatus('paused');
    setSecondsLeft(displaySeconds(pausedRemainingRef.current));
    scheduledRef.current = new Map();
    void cancelAllSessionAlarms();
  }, [stopAlarm]);

  const resume = useCallback(async () => {
    if (statusRef.current !== 'paused') return;
    const epoch = ++epochRef.current;
    endsAtRef.current = Date.now() + pausedRemainingRef.current;
    statusRef.current = 'running';
    setStatus('running');
    await rescheduleAlarms(epoch);
  }, [rescheduleAlarms]);

  const reset = useCallback(() => {
    epochRef.current += 1;
    // Yarım kalan oturumu 'abandoned' olarak kaydet: mevcut partın yalnızca
    // fiilen geçen kısmı sayılır (beklemede ek yok — önceki part zaten sayıldı).
    if (sessionActiveRef.current) {
      const st = statusRef.current;
      const part = sessionPartsRef.current[phaseIndexRef.current];
      let extraMs = 0;
      if (st === 'running') {
        extraMs = partDurationMs(part) - Math.max(0, endsAtRef.current - Date.now());
      } else if (st === 'paused') {
        extraMs = partDurationMs(part) - pausedRemainingRef.current;
      }
      finishSession('abandoned', Math.max(0, extraMs), part.type);
    }
    stopAlarm();
    statusRef.current = 'idle';
    phaseIndexRef.current = 0;
    endsAtRef.current = 0;
    pausedRemainingRef.current = 0;
    setStatus('idle');
    setPhaseIndex(0);
    setSecondsLeft(partSeconds(pendingPresetRef.current.parts[0]));
    setSessionParts(null);
    setSessionAuto(null);
    setSessionProjectId(null);
    scheduledRef.current = new Map();
    void cancelAllSessionAlarms();
  }, [stopAlarm, finishSession]);

  return {
    /** Aktif oturumun partları; boştayken seçili önayarın partları. */
    parts: sessionParts ?? pendingPreset.parts,
    autoAdvance: sessionAuto ?? settings.autoAdvance,
    status,
    phaseIndex,
    secondsLeft,
    alarmActive,
    /** Boşta: seçilecek proje. Oturumda: değişmez (sessionProjectId'ye bak). */
    pendingProjectId,
    setPendingProject,
    /** Oturum başladığında kilitlenen proje. */
    sessionProjectId,
    /** Boştaki seçime göre çalışacak önayar. */
    pendingPresetName: pendingPreset.name,
    /** Son kaydedilen oturum özeti (done ekranında gösterilir). */
    lastSaved,
    /** false: bildirim izni yok/desteklenmiyor → arka planda alarm çalmaz. */
    notificationsGranted,
    start,
    advance,
    skipBreak,
    pause,
    resume,
    reset,
    acknowledgeAlarm: stopAlarm,
  };
}
