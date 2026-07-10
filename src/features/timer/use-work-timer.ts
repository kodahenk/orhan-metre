import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';

import { newId, useProjects } from '@/features/projects/projects-context';
import { useSessions, type WorkSession } from '@/features/sessions/sessions-context';
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
const VIBRATION_PATTERN = [0, 600, 400];
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
  const pendingPresetRef = useRef(pendingPreset);
  const settingsRef = useRef(settings);
  const pendingProjectRef = useRef<string | null>(null);
  const scheduledRef = useRef<ScheduledAlarms>(new Map());
  const alarmBoundaryRef = useRef<number | null>(null);
  const alarmEndsAtRef = useRef(0);
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

  // Son kullanılan proje kalıcıdır.
  useEffect(() => {
    let cancelled = false;
    Storage.getItem(LAST_PROJECT_KEY)
      .then((raw) => {
        if (!cancelled && raw) {
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

  /** Oturumu kayda döker. extraMs: mevcut partın kaydedilecek kısmı. */
  const finishSession = useCallback(
    (finalStatus: 'completed' | 'abandoned', extraMs: number, extraType?: Part['type']) => {
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
        endedAt: Date.now(),
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
      finishSession('completed', 0);
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
        return;
      }
      syncNow();
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
      for (const key of [...scheduled.keys()]) void silenceBoundaryAlarms(scheduled, key);
      return;
    }
    scheduledRef.current = scheduled;
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current === 'running' || statusRef.current === 'between') return;
    const epoch = ++epochRef.current;
    const preset = pendingPresetRef.current;
    const parts = preset.parts;
    sessionPartsRef.current = parts;
    autoAdvanceRef.current = settingsRef.current.autoAdvance;
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
    start,
    advance,
    pause,
    resume,
    reset,
    acknowledgeAlarm: stopAlarm,
  };
}
