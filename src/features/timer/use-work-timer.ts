import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';

import {
  addNotificationTapListener,
  cancelAllSessionAlarms,
  prepareNotifications,
  scheduleSessionAlarms,
  silenceBoundaryAlarms,
  type ScheduledAlarms,
} from './notifications';
import { partAlarmMs, partDurationMs, type Part } from './settings';
import { useTimerSettings } from './settings-context';

/**
 * idle → running → between → running → ... → done
 * 'between': bir part bitti, alarm penceresi işliyor. Otomatik geçiş modunda
 * pencere dolunca sonraki part kendiliğinden başlar; manuel modda "Devam"
 * beklenir. Her iki modda da "Devam" ile erken geçilebilir.
 */
export type TimerStatus = 'idle' | 'running' | 'between' | 'paused' | 'done';

// Zaman damgası tabanlı sayım: her tik'te kalan süre `endsAt - now` üzerinden
// hesaplanır, böylece JS zamanlayıcısı kısılsa/uygulama arka plana alınsa bile
// sayaç şaşmaz. setState yalnızca görünen saniye değiştiğinde render tetikler.
const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'work-timer';

// Alarm penceresi boyunca tekrarlanan titreşim. Uygulama arka plana geçerse
// JS zamanlayıcıları durup titreşimi kapatamayacağı için AppState dinleyicisi
// arka plana geçişte titreşimi keser (arka planda kanal titreşimi devrededir).
const VIBRATION_PATTERN = [0, 600, 400];

// Gösterim 10 sn'lik adımlarla yapılır (her saniye değişen sayaç dikkat
// dağıtıyor); kalan süre yukarı yuvarlanır, render sıklığı da 1/10'a düşer.
const displaySeconds = (ms: number) => Math.max(0, Math.ceil(ms / 10_000) * 10);
const partSeconds = (part: Part) => displaySeconds(partDurationMs(part));

export function useWorkTimer() {
  const { settings } = useTimerSettings();

  const [status, setStatus] = useState<TimerStatus>('idle');
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(partSeconds(settings.parts[0]));
  const [alarmActive, setAlarmActive] = useState(false);
  // Oturum başlarken ayarların anlık kopyası alınır; ayarlar oturum ortasında
  // değişirse yeni değerler bir SONRAKİ oturumda geçerli olur.
  const [sessionParts, setSessionParts] = useState<Part[] | null>(null);
  const [sessionAuto, setSessionAuto] = useState<boolean | null>(null);

  const statusRef = useRef<TimerStatus>('idle');
  const phaseIndexRef = useRef(0);
  const endsAtRef = useRef(0);
  const pausedRemainingRef = useRef(0);
  const sessionPartsRef = useRef<Part[]>(settings.parts);
  const autoAdvanceRef = useRef(settings.autoAdvance);
  const settingsRef = useRef(settings);
  const scheduledRef = useRef<ScheduledAlarms>(new Map());
  const alarmBoundaryRef = useRef<number | null>(null);
  const alarmEndsAtRef = useRef(0);
  const alarmStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Her durum geçişinde artar; await sonrası bayatlamış devamları geçersiz kılar.
  const epochRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
    // Boştayken ayar değişirse gösterilen süre ve part listesi güncel kalsın.
    if (statusRef.current === 'idle') {
      setSecondsLeft(partSeconds(settings.parts[0]));
    }
  }, [settings]);

  const stopAlarm = useCallback(() => {
    Vibration.cancel();
    if (alarmStopTimer.current) {
      clearTimeout(alarmStopTimer.current);
      alarmStopTimer.current = null;
    }
    const boundary = alarmBoundaryRef.current;
    alarmBoundaryRef.current = null;
    setAlarmActive(false);
    if (boundary != null) void silenceBoundaryAlarms(scheduledRef.current, boundary);
  }, []);

  const startAlarm = useCallback(
    (boundary: number, windowMs: number) => {
      stopAlarm();
      alarmBoundaryRef.current = boundary;
      alarmEndsAtRef.current = Date.now() + windowMs;
      setAlarmActive(true);
      Vibration.vibrate(VIBRATION_PATTERN, true);
      alarmStopTimer.current = setTimeout(stopAlarm, windowMs);
    },
    [stopAlarm],
  );

  // Tik + arka plandan dönüş senkronu: geçen süreye göre part → alarm boşluğu
  // → part ... segmentleri üzerinde ilerlenir; manuel modda boşlukta durulur.
  // Yalnızca kendi alarm penceresi hâlâ açık olan EN SON sınır için alarm
  // çalar; daha eski sınırların bildirimleri sessizce temizlenir.
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
      if (seg === 'gap' && !auto) break; // manuel bekleme: kendiliğinden ilerlemez
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
      const last = crossed[crossed.length - 1];
      for (const b of crossed.slice(0, -1)) {
        void silenceBoundaryAlarms(scheduledRef.current, b.index);
      }
      const windowMs = partAlarmMs(parts[last.index]);
      const overshoot = now - last.at;
      if (overshoot < windowMs) {
        startAlarm(last.index, windowMs - overshoot);
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
        // Beklemede büyük sayaç, sıradaki partın süresini sabit gösterir.
        setSecondsLeft(partSeconds(parts[idx + 1]));
      }
    }
    if (statusRef.current === 'running') {
      setSecondsLeft(displaySeconds(endsAtRef.current - now));
    }
  }, [startAlarm]);

  useEffect(() => {
    if (status !== 'running' && status !== 'between') return;
    const id = setInterval(syncNow, TICK_MS);
    return () => clearInterval(id);
  }, [status, syncNow]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        // Arka planda JS zamanlayıcıları durur; tekrarlı titreşim susmadan
        // kalmasın. Uyarıyı zamanlanmış bildirimlerin kanal titreşimi sürdürür.
        Vibration.cancel();
        return;
      }
      syncNow();
      // Öne dönüşte yarım kalan alarmı toparla: penceresi geçtiyse kapat,
      // sürüyorsa titreşimi kalan süre için yeniden başlat.
      if (alarmBoundaryRef.current != null) {
        const remaining = alarmEndsAtRef.current - Date.now();
        if (remaining <= 0) {
          stopAlarm();
        } else {
          Vibration.vibrate(VIBRATION_PATTERN, true);
          if (alarmStopTimer.current) clearTimeout(alarmStopTimer.current);
          alarmStopTimer.current = setTimeout(stopAlarm, remaining);
        }
      }
    });
    return () => sub.remove();
  }, [syncNow, stopAlarm]);

  // Bildirime dokunmak alarmı durdurmak sayılır: önce senkronize et
  // (arka planda biten part varsa alarm kurulur), sonra sustur.
  useEffect(() => {
    return addNotificationTapListener(() => {
      syncNow();
      stopAlarm();
    });
  }, [syncNow, stopAlarm]);

  // Süreç ölümünden kalan sahipsiz bildirim zamanlamalarını temizle
  // (oturum bellekte tutulur; uygulama yeniden açıldığında boşta başlar).
  useEffect(() => {
    if (statusRef.current === 'idle') void cancelAllSessionAlarms();
  }, []);

  // Sayaç çalışırken ve partlar arası beklerken ekran uyumasın.
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
      if (alarmStopTimer.current) clearTimeout(alarmStopTimer.current);
    };
  }, []);

  const rescheduleFrom = useCallback(async (epoch: number, fromIndex: number, endsAt: number) => {
    await cancelAllSessionAlarms();
    if (epochRef.current !== epoch) return;
    const scheduled = await scheduleSessionAlarms(
      sessionPartsRef.current,
      autoAdvanceRef.current,
      fromIndex,
      endsAt,
    );
    if (epochRef.current !== epoch) {
      // Bu arada durum değişti: az önce zamanlananları geri al.
      for (const key of [...scheduled.keys()]) void silenceBoundaryAlarms(scheduled, key);
      return;
    }
    scheduledRef.current = scheduled;
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current === 'running' || statusRef.current === 'between') return;
    const epoch = ++epochRef.current;
    const parts = settingsRef.current.parts;
    sessionPartsRef.current = parts;
    autoAdvanceRef.current = settingsRef.current.autoAdvance;
    setSessionParts(parts);
    setSessionAuto(settingsRef.current.autoAdvance);

    statusRef.current = 'running';
    phaseIndexRef.current = 0;
    endsAtRef.current = Date.now() + partDurationMs(parts[0]);
    setStatus('running');
    setPhaseIndex(0);
    setSecondsLeft(partSeconds(parts[0]));

    // İzin verilmese de sayaç çalışır; yalnızca bildirimler gösterilmez.
    await prepareNotifications().catch(() => false);
    if (epochRef.current !== epoch) return;
    await rescheduleFrom(epoch, 0, endsAtRef.current);
  }, [rescheduleFrom]);

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
    await rescheduleFrom(epoch, next, endsAtRef.current);
  }, [stopAlarm, rescheduleFrom]);

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
    await rescheduleFrom(epoch, phaseIndexRef.current, endsAtRef.current);
  }, [rescheduleFrom]);

  const reset = useCallback(() => {
    epochRef.current += 1;
    stopAlarm();
    statusRef.current = 'idle';
    phaseIndexRef.current = 0;
    endsAtRef.current = 0;
    pausedRemainingRef.current = 0;
    setStatus('idle');
    setPhaseIndex(0);
    setSecondsLeft(partSeconds(settingsRef.current.parts[0]));
    setSessionParts(null);
    setSessionAuto(null);
    scheduledRef.current = new Map();
    void cancelAllSessionAlarms();
  }, [stopAlarm]);

  return {
    /** Aktif oturumun partları; boştayken güncel ayarlardaki partlar. */
    parts: sessionParts ?? settings.parts,
    autoAdvance: sessionAuto ?? settings.autoAdvance,
    status,
    phaseIndex,
    secondsLeft,
    alarmActive,
    start,
    advance,
    pause,
    resume,
    reset,
    acknowledgeAlarm: stopAlarm,
  };
}
