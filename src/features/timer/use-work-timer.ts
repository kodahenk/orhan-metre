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
import { ALARM_WINDOW_MS, WORK_PHASES, phaseDurationMs } from './phases';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

// Zaman damgası tabanlı sayım: her tik'te kalan süre `endsAt - now` üzerinden
// hesaplanır, böylece JS zamanlayıcısı kısılsa/uygulama arka plana alınsa bile
// sayaç şaşmaz. setState yalnızca görünen saniye değiştiğinde render tetikler.
const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'work-timer';

// Sonlu desen (~4 sn), sonsuz tekrar YOK: uygulama alarm penceresi içinde arka
// plana alınırsa JS zamanlayıcıları durur; sonsuz tekrarlı titreşim native
// tarafta çalmaya devam ederdi. Sonlu desen kendi kendine biter.
const VIBRATION_PATTERN = [0, 600, 250, 600, 250, 600, 250, 600, 250, 600];

export function useWorkTimer() {
  const [status, setStatus] = useState<TimerStatus>('idle');
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(WORK_PHASES[0].minutes * 60);
  const [alarmActive, setAlarmActive] = useState(false);

  const statusRef = useRef<TimerStatus>('idle');
  const phaseIndexRef = useRef(0);
  const endsAtRef = useRef(0);
  const pausedRemainingRef = useRef(0);
  const scheduledRef = useRef<ScheduledAlarms>(new Map());
  const alarmBoundaryRef = useRef<number | null>(null);
  const alarmStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Her durum geçişinde artar; await sonrası bayatlamış devamları geçersiz kılar.
  const epochRef = useRef(0);

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
      setAlarmActive(true);
      Vibration.vibrate(VIBRATION_PATTERN, false);
      alarmStopTimer.current = setTimeout(stopAlarm, windowMs);
    },
    [stopAlarm],
  );

  // Tik + arka plandan dönüş senkronu: geçen süreye göre gerekirse birden çok
  // faz birden atlanır. Yalnızca son 5 sn içinde biten sınır için alarm çalar;
  // daha eski sınırların bildirimleri sessizce temizlenir.
  const syncNow = useCallback(() => {
    if (statusRef.current !== 'running') return;
    const now = Date.now();
    let idx = phaseIndexRef.current;
    let endsAt = endsAtRef.current;
    const crossed: { index: number; at: number }[] = [];

    while (idx < WORK_PHASES.length && now >= endsAt) {
      crossed.push({ index: idx, at: endsAt });
      idx += 1;
      if (idx < WORK_PHASES.length) endsAt += phaseDurationMs(WORK_PHASES[idx]);
    }

    if (crossed.length > 0) {
      const last = crossed[crossed.length - 1];
      for (const b of crossed.slice(0, -1)) {
        void silenceBoundaryAlarms(scheduledRef.current, b.index);
      }
      const overshoot = now - last.at;
      if (overshoot < ALARM_WINDOW_MS) {
        startAlarm(last.index, ALARM_WINDOW_MS - overshoot);
      } else {
        void silenceBoundaryAlarms(scheduledRef.current, last.index);
      }

      if (idx >= WORK_PHASES.length) {
        statusRef.current = 'done';
        phaseIndexRef.current = WORK_PHASES.length - 1;
        setStatus('done');
        setPhaseIndex(WORK_PHASES.length - 1);
        setSecondsLeft(0);
        return;
      }
      phaseIndexRef.current = idx;
      endsAtRef.current = endsAt;
      setPhaseIndex(idx);
    }

    setSecondsLeft(Math.max(0, Math.ceil((endsAtRef.current - now) / 1000)));
  }, [startAlarm]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(syncNow, TICK_MS);
    return () => clearInterval(id);
  }, [status, syncNow]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  // Bildirime dokunmak alarmı durdurmak sayılır: önce senkronize et
  // (arka planda biten faz varsa alarm kurulur), sonra sustur.
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

  // Sayaç çalışırken ekran uyumasın.
  useEffect(() => {
    if (status !== 'running') return;
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

  const start = useCallback(async () => {
    if (statusRef.current === 'running') return;
    const epoch = ++epochRef.current;
    const first = WORK_PHASES[0];
    statusRef.current = 'running';
    phaseIndexRef.current = 0;
    endsAtRef.current = Date.now() + phaseDurationMs(first);
    setStatus('running');
    setPhaseIndex(0);
    setSecondsLeft(first.minutes * 60);

    // İzin verilmese de sayaç çalışır; yalnızca bildirimler gösterilmez.
    await prepareNotifications().catch(() => false);
    if (epochRef.current !== epoch) return;
    await cancelAllSessionAlarms();
    if (epochRef.current !== epoch) return;
    const scheduled = await scheduleSessionAlarms(0, endsAtRef.current);
    if (epochRef.current !== epoch) {
      // Bu arada duraklatıldı/sıfırlandı: az önce zamanlananları geri al.
      for (const key of [...scheduled.keys()]) void silenceBoundaryAlarms(scheduled, key);
      return;
    }
    scheduledRef.current = scheduled;
  }, []);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    epochRef.current += 1;
    stopAlarm();
    pausedRemainingRef.current = Math.max(0, endsAtRef.current - Date.now());
    statusRef.current = 'paused';
    setStatus('paused');
    setSecondsLeft(Math.ceil(pausedRemainingRef.current / 1000));
    scheduledRef.current = new Map();
    void cancelAllSessionAlarms();
  }, [stopAlarm]);

  const resume = useCallback(async () => {
    if (statusRef.current !== 'paused') return;
    const epoch = ++epochRef.current;
    endsAtRef.current = Date.now() + pausedRemainingRef.current;
    statusRef.current = 'running';
    setStatus('running');
    const scheduled = await scheduleSessionAlarms(phaseIndexRef.current, endsAtRef.current);
    if (epochRef.current !== epoch) {
      for (const key of [...scheduled.keys()]) void silenceBoundaryAlarms(scheduled, key);
      return;
    }
    scheduledRef.current = scheduled;
  }, []);

  const reset = useCallback(() => {
    epochRef.current += 1;
    stopAlarm();
    statusRef.current = 'idle';
    phaseIndexRef.current = 0;
    endsAtRef.current = 0;
    pausedRemainingRef.current = 0;
    setStatus('idle');
    setPhaseIndex(0);
    setSecondsLeft(WORK_PHASES[0].minutes * 60);
    scheduledRef.current = new Map();
    void cancelAllSessionAlarms();
  }, [stopAlarm]);

  return {
    status,
    phaseIndex,
    secondsLeft,
    alarmActive,
    start,
    pause,
    resume,
    reset,
    acknowledgeAlarm: stopAlarm,
  };
}
