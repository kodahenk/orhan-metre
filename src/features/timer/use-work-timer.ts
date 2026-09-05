import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

import { newId, useProjects } from '@/features/projects/projects-context';
import { useSessions, type WorkSession } from '@/features/sessions/sessions-context';
import { dateKey } from './format';
import { hideMiniTimer, showMiniTimer } from './mini-timer';
import {
  clearSnapshot,
  loadSnapshot,
  saveSnapshot,
  SNAPSHOT_INTERVAL_MS,
} from './session-recovery';
import {
  addNotificationTapListener,
  applyBreatheDebt,
  breatheRepeatKey,
  cancelAllSessionAlarms,
  prepareNotifications,
  scheduleCycleAlarms,
  silenceBoundaryAlarms,
  type CycleTimings,
  type ScheduledAlarms,
} from './notifications';
import {
  notifyIntervalMs,
  phaseDurationMs,
  PHASE_LABELS,
  plannedStartTimestamp,
  readPlannedStartStamp,
  writePlannedStartStamp,
  type TimerPhase,
  type TimerPreset,
} from './settings';
import { useTimerSettings } from './settings-context';

// Web'de titreşim yok; navigator.vibrate çağrıları (özellikle kullanıcı
// etkileşimi öncesi) tarayıcı konsoluna hata bastığı için tamamen atlanır.
const canVibrate = Platform.OS !== 'web';
const vibrate = (ms: number) => {
  if (canVibrate) Vibration.vibrate(ms);
};
const cancelVibration = () => {
  if (canVibrate) Vibration.cancel();
};

/**
 * TUR DÖNGÜSÜ: Odak → Tekrar → Nefes Al → (sonraki tur) → ... sonsuz.
 *
 *   idle → running(focus) → running(review) → running(breathe)
 *        → [otomatik] running(focus, tur+1)  /  [manuel] waiting → running(focus, tur+1)
 *
 * SAYIM KURALI: bir tur ancak TEKRAR fazına ulaşırsa çalışılmış sayılır.
 * Odak fazında bitirilen tur kayda hiç geçmez (odak süresi de sayılmaz);
 * önceki tamamlanmış turlar korunur ve oturum 'completed' olarak yazılır.
 * Hiç tur tamamlanmadan bitirilirse kayıt 'abandoned' olur (60 sn'den kısa
 * çalışma zaten sessizce atılır).
 *
 * 'waiting': manuel modda Nefes Al süresi doldu, "Devam" bekleniyor.
 */
export type TimerStatus = 'idle' | 'running' | 'waiting' | 'paused';

const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'work-timer';
// Titreşim yalnızca faz geçtiği anda ve sonlu: tekrar bayrağı (repeat)
// kullanılmaz, böylece susturma kaçırılsa bile titreşim kendiliğinden biter
// ("takılı kalma" yok). Nefes Al boyunca yalnızca bildirim gider, titreşim yok.
const ALARM_VIBRATION_MS = 5_000;
const LAST_PROJECT_KEY = 'timer-last-project';
const LAST_TASK_KEY = 'timer-last-task';
const MIN_RECORDED_WORK_SECONDS = 60;

// Gösterim 10 sn'lik adımlarla yapılır (her saniye değişen sayaç dikkat
// dağıtıyor); kalan süre yukarı yuvarlanır, render sıklığı da 1/10'a düşer.
const displaySeconds = (ms: number) => Math.max(0, Math.ceil(ms / 10_000) * 10);

/** Sonsuz döngüde benzersiz, artan sınır anahtarı. */
const phaseSeq = (round: number, phase: TimerPhase) =>
  round * 3 + (phase === 'focus' ? 0 : phase === 'review' ? 1 : 2);

export type LastSaved = {
  projectId: string | null;
  taskId: string | null;
  workSeconds: number;
  completedRounds: number;
  status: 'completed' | 'abandoned';
  /** true: uygulama kapalıyken yarım kalmış oturum açılışta kurtarıldı. */
  recovered?: boolean;
};

export function useWorkTimer() {
  const { settings, presets } = useTimerSettings();
  const { projects, tasks } = useProjects();
  const { addSession } = useSessions();

  const [status, setStatus] = useState<TimerStatus>('idle');
  const [phase, setPhaseState] = useState<TimerPhase>('focus');
  const [round, setRoundState] = useState(0);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);
  // Boştayken seçili proje (kalıcı: son kullanılan); oturum başlayınca kilitlenir.
  const [pendingProjectId, setPendingProjectIdState] = useState<string | null>(null);
  const [sessionProjectId, setSessionProjectId] = useState<string | null>(null);
  // Boştayken seçili görev (projeye bağlı; proje değişince sıfırlanır);
  // oturum başlayınca kilitlenir ve kayda yazılır.
  const [pendingTaskId, setPendingTaskIdState] = useState<string | null>(null);
  const [sessionTaskId, setSessionTaskId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  // Oturum başlarken süreler ve mod anlık kopyalanır; ayarlar oturum ortasında
  // değişirse yeni değerler bir SONRAKİ oturumda geçerli olur.
  const [sessionAuto, setSessionAuto] = useState<boolean | null>(null);
  // null: henüz sorulmadı. false: izin yok/desteklenmiyor → arka planda alarm
  // çalmayacağı için arayüz kullanıcıyı uyarır.
  const [notificationsGranted, setNotificationsGranted] = useState<boolean | null>(null);
  const notificationsGrantedRef = useRef(false);
  const [breatheDebtAppliedMs, setBreatheDebtAppliedMs] = useState(0);

  // Boştaki gösterim: seçili projenin önayarı (yoksa genel varsayılan).
  const pendingPreset: TimerPreset = useMemo(() => {
    const project = pendingProjectId ? projects.find((p) => p.id === pendingProjectId) : null;
    const byProject = project?.defaultPresetId
      ? presets.find((p) => p.id === project.defaultPresetId)
      : null;
    return byProject ?? presets.find((p) => p.id === settings.activePresetId) ?? presets[0];
  }, [pendingProjectId, projects, presets, settings.activePresetId]);

  const [secondsLeft, setSecondsLeft] = useState(() =>
    displaySeconds(phaseDurationMs(pendingPreset, 'focus')),
  );

  const statusRef = useRef<TimerStatus>('idle');
  const phaseRef = useRef<TimerPhase>('focus');
  const roundRef = useRef(0);
  const endsAtRef = useRef(0);
  /** Yürüyen fazın FİİLİ süresi (Nefes Al borçla kısalmış olabilir). */
  const phaseDurRef = useRef(0);
  const pausedRemainingRef = useRef(0);
  // Duraklatma ANI (odak/tekrar fazında): devamda geçen süre borç olur.
  const pausedAtRef = useRef(0);
  /** Nefes Al sürelerinden düşülmeyi bekleyen borç havuzu. */
  const debtRef = useRef(0);
  const debtAppliedRef = useRef(0);

  const timingsRef = useRef<CycleTimings>({
    focusMs: 0,
    reviewMs: 0,
    breatheMs: 0,
    notifyMs: 15_000,
    minBreatheMs: 60_000,
  });
  const autoAdvanceRef = useRef(settings.autoAdvance);
  const workEndReminderMsRef = useRef(0);
  const pendingPresetRef = useRef(pendingPreset);
  const settingsRef = useRef(settings);
  const pendingProjectRef = useRef<string | null>(null);
  const pendingTaskRef = useRef<string | null>(null);
  const tasksRef = useRef(tasks);
  const projectsRef = useRef(projects);
  const scheduledRef = useRef<ScheduledAlarms>(new Map());
  const alarmBoundaryRef = useRef<number | null>(null);
  const alarmEndsAtRef = useRef(0);
  const alarmVibrateEndsAtRef = useRef(0);
  const alarmStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rescheduleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Uygulama ön planda mı — arka planda mini sayacı geri koymak için. */
  const appActiveRef = useRef(true);
  // Her durum geçişinde artar; await sonrası bayatlamış devamları geçersiz kılar.
  const epochRef = useRef(0);

  // Oturum muhasebesi.
  const sessionActiveRef = useRef(false);
  const sessionProjectRef = useRef<string | null>(null);
  const sessionTaskRef = useRef<string | null>(null);
  const sessionPresetRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef(0);
  const workMsRef = useRef(0);
  const breatheMsRef = useRef(0);
  const completedRoundsRef = useRef(0);

  useEffect(() => {
    tasksRef.current = tasks;
    projectsRef.current = projects;
  }, [tasks, projects]);

  useEffect(() => {
    settingsRef.current = settings;
    pendingPresetRef.current = pendingPreset;
    // Boştayken önayar/proje değişirse gösterilen süre güncel kalsın.
    if (statusRef.current === 'idle') {
      setSecondsLeft(displaySeconds(phaseDurationMs(pendingPreset, 'focus')));
    }
  }, [settings, pendingPreset]);

  // Son kullanılan proje ve görev kalıcıdır. Kullanıcı okuma tamamlanmadan
  // seçim yaptıysa (touched) gecikmiş eski değer seçimi ezmesin.
  const pendingProjectTouchedRef = useRef(false);
  const pendingTaskTouchedRef = useRef(false);

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
    Storage.getItem(LAST_TASK_KEY)
      .then((raw) => {
        if (!cancelled && !pendingTaskTouchedRef.current && raw) {
          // Geçerlilik (görev hâlâ var mı / projesiyle uyumlu mu) seçim
          // gösterilirken ve start()'ta denetlenir; burada ham kimlik yüklenir.
          pendingTaskRef.current = raw === 'null' ? null : raw;
          setPendingTaskIdState(pendingTaskRef.current);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setPendingTask = useCallback((taskId: string | null) => {
    pendingTaskTouchedRef.current = true;
    pendingTaskRef.current = taskId;
    setPendingTaskIdState(taskId);
    void Storage.setItem(LAST_TASK_KEY, taskId ?? 'null').catch(() => {});
  }, []);

  const setPendingProject = useCallback(
    (projectId: string | null) => {
      if (pendingProjectRef.current === projectId) return;
      pendingProjectTouchedRef.current = true;
      pendingProjectRef.current = projectId;
      setPendingProjectIdState(projectId);
      void Storage.setItem(LAST_PROJECT_KEY, projectId ?? 'null').catch(() => {});
      // Görev projeye bağlıdır: proje değişince seçili görev sıfırlanır.
      setPendingTask(null);
    },
    [setPendingTask],
  );

  /**
   * Alarmı susturur. `silenceBreatheReminders`: yalnızca KULLANICI susturduğunda
   * (ekrana/bildirime dokunma) true — o zaman Nefes Al'ın kalan dürtüleri de
   * iptal edilir. Otomatik zaman aşımında false kalır, yoksa 5 sn sonra dürtüler
   * kendiliğinden silinip özellik işlevsizleşirdi.
   */
  const stopAlarm = useCallback((silenceBreatheReminders = false) => {
    cancelVibration();
    if (alarmStopTimer.current) {
      clearTimeout(alarmStopTimer.current);
      alarmStopTimer.current = null;
    }
    const boundary = alarmBoundaryRef.current;
    alarmBoundaryRef.current = null;
    alarmVibrateEndsAtRef.current = 0;
    setAlarmActive(false);
    if (boundary != null) {
      void silenceBoundaryAlarms(scheduledRef.current, boundary);
      // Nefese giriş sınırı (Tekrar sonu) susturuluyorsa dürtüler de sussun.
      if (silenceBreatheReminders && boundary % 3 === 1) {
        void silenceBoundaryAlarms(scheduledRef.current, breatheRepeatKey((boundary - 1) / 3));
      }
    }
  }, []);

  /** vibrateMs: 5 sn'lik geçiş titreşiminden geriye kalan kısım (0 = titreme). */
  const startAlarm = useCallback(
    (boundary: number, windowMs: number, vibrateMs: number) => {
      stopAlarm();
      alarmBoundaryRef.current = boundary;
      alarmEndsAtRef.current = Date.now() + windowMs;
      setAlarmActive(true);
      // Android'de bildirimler aktifken geçiş titreşimini sınır bildiriminin
      // kanal deseni (≈5 sn) verir; uygulama içi titreşim atlanır ki iki
      // kaynak çakışmasın. iOS / Expo Go / izin yok durumlarında devrededir.
      const channelVibrates = Platform.OS === 'android' && notificationsGrantedRef.current;
      if (vibrateMs > 0 && !channelVibrates) {
        alarmVibrateEndsAtRef.current = Date.now() + vibrateMs;
        vibrate(vibrateMs);
      }
      alarmStopTimer.current = setTimeout(() => stopAlarm(), windowMs);
    },
    [stopAlarm],
  );

  /**
   * Yürüyen oturumun ilerlemesini diske yazar: süreç arka planda öldürülürse
   * (sonsuz döngüde oturum tüm günü kapsayabilir) çalışma kaybolmasın.
   */
  const persistSnapshot = useCallback(() => {
    if (!sessionActiveRef.current) return;
    saveSnapshot({
      projectId: sessionProjectRef.current,
      taskId: sessionTaskRef.current,
      presetId: sessionPresetRef.current,
      startedAt: sessionStartedAtRef.current,
      updatedAt: Date.now(),
      workMs: workMsRef.current,
      breatheMs: breatheMsRef.current,
      completedRounds: completedRoundsRef.current,
    });
  }, []);

  /**
   * Oturumu kayda döker. extraWorkMs/extraBreatheMs: yürüyen fazın
   * kaydedilecek kısmı (odak fazı hiç sayılmaz — tur tekrara ulaşmadı).
   */
  const finishSession = useCallback(
    (extraWorkMs: number, extraBreatheMs: number) => {
      if (!sessionActiveRef.current) return;
      sessionActiveRef.current = false;
      const workMs = workMsRef.current + Math.max(0, extraWorkMs);
      const breatheMs = breatheMsRef.current + Math.max(0, extraBreatheMs);
      const workSeconds = Math.round(workMs / 1000);
      if (workSeconds < MIN_RECORDED_WORK_SECONDS) {
        clearSnapshot(); // gürültü filtresi: kaydedilmeyen oturumun izi kalmasın
        return;
      }
      // Tamamlanmış tur varsa oturum 'completed': odakta yarıda bırakılan SON
      // tur sayılmaz ama ondan öncekiler oturumu terk edilmiş yapmaz.
      const finalStatus = completedRoundsRef.current > 0 ? 'completed' : 'abandoned';
      const session: WorkSession = {
        id: newId(),
        projectId: sessionProjectRef.current,
        taskId: sessionTaskRef.current,
        presetId: sessionPresetRef.current,
        startedAt: sessionStartedAtRef.current,
        endedAt: Date.now(),
        workSeconds,
        breakSeconds: Math.round(breatheMs / 1000),
        completedRounds: completedRoundsRef.current,
        status: finalStatus,
      };
      addSession(session);
      clearSnapshot();
      setLastSaved({
        projectId: session.projectId,
        taskId: session.taskId,
        workSeconds,
        completedRounds: session.completedRounds,
        status: finalStatus,
      });
    },
    [addSession],
  );

  /**
   * Bildirimleri MEVCUT konumdan zamanlar. Konum parametre olarak alınmaz:
   * await'ler (izin diyaloğu, toplu iptal) sırasında sayaç tiklemeye devam
   * eder ve faz geçilmiş olabilir; await öncesi yakalanmış bayat konumla
   * zamanlamak tüm alarmları kaydırırdı. Konum bu yüzden iptal await'inden
   * SONRA ref'lerden okunur.
   */
  const rescheduleAlarms = useCallback(async (epoch: number) => {
    await cancelAllSessionAlarms();
    if (epochRef.current !== epoch) return;
    if (statusRef.current !== 'running') return; // idle/paused/waiting: sınır yok
    const scheduled = await scheduleCycleAlarms(
      timingsRef.current,
      autoAdvanceRef.current,
      roundRef.current,
      phaseRef.current,
      endsAtRef.current,
      debtRef.current,
      workEndReminderMsRef.current,
    );
    if (epochRef.current !== epoch) {
      for (const key of [...scheduled.keys()]) void silenceBoundaryAlarms(scheduled, key);
      return;
    }
    scheduledRef.current = scheduled;
  }, []);

  /**
   * Tik + arka plandan dönüş senkronu: faz zinciri üzerinde ilerlenir.
   * Geçilen her faz muhasebeye işlenir; Nefes Al'a her girişte borç havuzundan
   * düşülür. Manuel modda Nefes Al'ın sonunda 'waiting' durumunda durulur.
   */
  const syncNow = useCallback(() => {
    if (statusRef.current !== 'running') return;
    const now = Date.now();
    const t = timingsRef.current;
    const auto = autoAdvanceRef.current;

    let curRound = roundRef.current;
    let curPhase = phaseRef.current;
    let curDur = phaseDurRef.current;
    let edge = endsAtRef.current;
    let debt = debtRef.current;
    let debtApplied = 0;
    let workAdd = 0;
    let breatheAdd = 0;
    let roundsAdd = 0;
    let waiting = false;
    const crossed: { seq: number; at: number }[] = [];

    while (now >= edge) {
      crossed.push({ seq: phaseSeq(curRound, curPhase), at: edge });
      if (curPhase === 'focus') {
        // Odak tamamlandı → tur Tekrar'a ulaştı: bu tur artık sayılır.
        workAdd += t.focusMs;
        roundsAdd += 1;
        curPhase = 'review';
        curDur = t.reviewMs;
      } else if (curPhase === 'review') {
        workAdd += t.reviewMs;
        const [effective, used] = applyBreatheDebt(t.breatheMs, debt, t.minBreatheMs);
        debt -= used;
        debtApplied += used;
        curPhase = 'breathe';
        curDur = effective;
      } else {
        breatheAdd += curDur;
        if (!auto) {
          waiting = true;
          break;
        }
        curRound += 1;
        curPhase = 'focus';
        curDur = t.focusMs;
      }
      edge += curDur;
    }

    if (crossed.length > 0) {
      workMsRef.current += workAdd;
      breatheMsRef.current += breatheAdd;
      if (roundsAdd > 0) {
        completedRoundsRef.current += roundsAdd;
        setCompletedRounds(completedRoundsRef.current);
      }
      debtRef.current = debt;
      // Faz geçişi = muhasebenin değiştiği an; ilerleme hemen diske yazılır.
      persistSnapshot();
      if (debtApplied > 0) {
        debtAppliedRef.current += debtApplied;
        setBreatheDebtAppliedMs(debtAppliedRef.current);
      }
      const last = crossed[crossed.length - 1];
      for (const c of crossed.slice(0, -1)) {
        void silenceBoundaryAlarms(scheduledRef.current, c.seq);
      }
      // Biten her Nefes Al'ın dürtü bildirimleri (ayrı kovada) susturulur;
      // pencere kapandıktan sonra panele düşen dürtü kalmasın.
      for (const c of crossed) {
        if (c.seq % 3 === 2) {
          void silenceBoundaryAlarms(scheduledRef.current, breatheRepeatKey((c.seq - 2) / 3));
        }
      }
      const overshoot = now - last.at;
      if (overshoot < ALARM_VIBRATION_MS) {
        startAlarm(last.seq, ALARM_VIBRATION_MS - overshoot, ALARM_VIBRATION_MS - overshoot);
      } else {
        // Geçiş çoktan olmuş (ör. arka plandan dönüş): titreşim payı yok.
        // Nefes Al'a girildiyse bildirimleri susturma — pencere hâlâ işliyor.
        if (!(curPhase === 'breathe' && !waiting)) {
          void silenceBoundaryAlarms(scheduledRef.current, last.seq);
        }
        setAlarmActive(false);
      }
    }

    roundRef.current = curRound;
    phaseRef.current = curPhase;
    phaseDurRef.current = curDur;
    setRoundState(curRound);
    setPhaseState(curPhase);

    if (waiting) {
      statusRef.current = 'waiting';
      setStatus('waiting');
      // Beklerken sıradaki turun odak süresi gösterilir.
      setSecondsLeft(displaySeconds(t.focusMs));
      return;
    }
    endsAtRef.current = edge;
    setSecondsLeft(displaySeconds(edge - now));

    // Döngü sonsuz olduğu için bildirimler ileriye BÜTÇEYLE zamanlanır; pencere
    // kendiliğinden kaymaz. Yeni tura girildiğinde (otomatik geçiş) pencere
    // tazelenir, yoksa birkaç tur sonra alarmlar sessizce biterdi.
    if (crossed.length > 0 && curPhase === 'focus') {
      // ÖNEMLİ: hemen çağrılırsa cancelAll, az önce düşen geçiş bildirimini
      // panelden siler ve Android o bildirimin sesini/titreşimini de keser —
      // yani yeni tur alarmı ~0,25 sn çalıp susardı. Titreşim penceresi
      // dolduktan sonra zamanlanır.
      if (rescheduleTimer.current) clearTimeout(rescheduleTimer.current);
      rescheduleTimer.current = setTimeout(() => {
        rescheduleTimer.current = null;
        if (statusRef.current !== 'running') return;
        void rescheduleAlarms(++epochRef.current).then(() => {
          // cancelAll mini sayaç bildirimini de sildiği için arka plandaysak
          // geri konur; yoksa cepteyken her turda kaybolurdu.
          if (!appActiveRef.current && statusRef.current === 'running') {
            showMiniTimer(endsAtRef.current, PHASE_LABELS[phaseRef.current]);
          }
        });
      }, ALARM_VIBRATION_MS + 1_000);
    }
  }, [startAlarm, rescheduleAlarms, persistSnapshot]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(syncNow, TICK_MS);
    // Faz geçişleri seyrek (dakikalar) olduğundan ilerleme ayrıca düzenli
    // aralıkla da yazılır; süreç ölürse en fazla bir aralık kadar kayıp olur.
    const snap = setInterval(persistSnapshot, SNAPSHOT_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearInterval(snap);
    };
  }, [status, syncNow, persistSnapshot]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (state !== 'active') {
        cancelVibration();
        // Arka plan mini sayacı: yalnızca bir faz fiilen akarken gösterilir.
        // Tikleme native tarafta (endsAt ile) sürer; JS burada durur.
        if (statusRef.current === 'running') {
          showMiniTimer(endsAtRef.current, PHASE_LABELS[phaseRef.current]);
        }
        // Süreç en çok arka planda öldürülür: çıkarken ilerlemeyi yaz.
        persistSnapshot();
        return;
      }
      hideMiniTimer();
      syncNow();
      if (alarmBoundaryRef.current != null) {
        const remaining = alarmEndsAtRef.current - Date.now();
        if (remaining <= 0) {
          stopAlarm();
        } else {
          const vibrateLeft = alarmVibrateEndsAtRef.current - Date.now();
          if (vibrateLeft > 0) vibrate(vibrateLeft);
          if (alarmStopTimer.current) clearTimeout(alarmStopTimer.current);
          alarmStopTimer.current = setTimeout(() => stopAlarm(), remaining);
        }
      }
    });
    return () => sub.remove();
  }, [syncNow, stopAlarm, persistSnapshot]);

  useEffect(() => {
    return addNotificationTapListener(() => {
      syncNow();
      stopAlarm(true);
    });
  }, [syncNow, stopAlarm]);

  useEffect(() => {
    // Soğuk açılış temizliği: önceki süreçten kalmış alarm bildirimleri ve
    // (süreç ölümünde asılı kalmış olabilecek) mini sayaç bildirimi süpürülür.
    if (statusRef.current !== 'idle') return;
    hideMiniTimer();
    void cancelAllSessionAlarms();

    // Kurtarma: süreç yürüyen oturumun ortasında öldürülmüşse, son yazılan
    // ilerleme kayda dönüştürülür. Oturum devam ETTİRİLMEZ — uygulama kapalıyken
    // turların dönmeye devam ettiğini varsaymak yanlış süre üretirdi.
    void loadSnapshot().then((snap) => {
      if (!snap) return;
      clearSnapshot();
      const workSeconds = Math.round(snap.workMs / 1000);
      if (workSeconds < MIN_RECORDED_WORK_SECONDS) return;
      const recovered: WorkSession = {
        id: newId(),
        projectId: snap.projectId,
        taskId: snap.taskId,
        presetId: snap.presetId,
        startedAt: snap.startedAt,
        endedAt: snap.updatedAt,
        workSeconds,
        breakSeconds: Math.round(snap.breatheMs / 1000),
        completedRounds: snap.completedRounds,
        status: snap.completedRounds > 0 ? 'completed' : 'abandoned',
      };
      addSession(recovered);
      setLastSaved({
        projectId: recovered.projectId,
        taskId: recovered.taskId,
        workSeconds,
        completedRounds: recovered.completedRounds,
        status: recovered.status,
        recovered: true,
      });
    });
  }, [addSession]);

  useEffect(() => {
    if (status !== 'running' && status !== 'waiting') return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [status]);

  useEffect(() => {
    return () => {
      cancelVibration();
      hideMiniTimer();
      if (alarmStopTimer.current) clearTimeout(alarmStopTimer.current);
      if (rescheduleTimer.current) clearTimeout(rescheduleTimer.current);
    };
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current !== 'idle') return;
    const epoch = ++epochRef.current;
    stopAlarm();
    const preset = pendingPresetRef.current;
    autoAdvanceRef.current = settingsRef.current.autoAdvance;
    workEndReminderMsRef.current = Math.max(0, settingsRef.current.workEndReminderMinutes * 60_000);
    timingsRef.current = {
      focusMs: phaseDurationMs(preset, 'focus'),
      reviewMs: phaseDurationMs(preset, 'review'),
      breatheMs: phaseDurationMs(preset, 'breathe'),
      notifyMs: notifyIntervalMs(preset),
      minBreatheMs: settingsRef.current.minBreatheMinutes * 60_000,
    };
    debtRef.current = 0;
    debtAppliedRef.current = 0;
    setBreatheDebtAppliedMs(0);

    // Planlı başlangıç: gecikme borcu yalnızca günün İLK başlatmasında
    // hesaplanır; damga borç doğsun doğmasın basılır (erken başlangıç dahil).
    // Senkron kv API'si bilinçli: start() guard'ı senkron kalır (çift-tık
    // re-entrancy açılmaz). Borç havuza yazılır, ilk Nefes Al'da işlemeye
    // başlar — sonsuz döngüde eninde sonunda tamamı ödenir.
    const plannedStart = settingsRef.current.plannedStartTime;
    if (plannedStart) {
      const today = dateKey(new Date());
      if (readPlannedStartStamp() !== today) {
        writePlannedStartStamp(today);
        debtRef.current = Math.max(0, Date.now() - plannedStartTimestamp(plannedStart));
      }
    }

    setSessionAuto(settingsRef.current.autoAdvance);
    setLastSaved(null);

    // Oturum muhasebesini başlat: proje/görev/önayar kilitlenir.
    sessionActiveRef.current = true;
    sessionProjectRef.current = pendingProjectRef.current;
    // Görev kilidi: yalnızca kilitlenen projeye ait, hâlâ var olan ve
    // tamamlanmamış görev yazılır (kalıcı seçim bayatlamış olabilir).
    const pendingTask = pendingTaskRef.current
      ? tasksRef.current.find((t) => t.id === pendingTaskRef.current)
      : undefined;
    // Görev, seçili projeye VEYA onun bir alt projesine ait olabilir: seçici
    // alt proje görevlerini de listeliyor (raporlar da alt projeleri üst
    // projeye topluyor). Kapsam dışıysa görevsiz başlanır.
    const scopeIds = new Set<string>();
    if (pendingProjectRef.current) {
      scopeIds.add(pendingProjectRef.current);
      for (const pr of projectsRef.current) {
        if (pr.parentId === pendingProjectRef.current) scopeIds.add(pr.id);
      }
    }
    sessionTaskRef.current =
      pendingTask && !pendingTask.done && scopeIds.has(pendingTask.projectId)
        ? pendingTask.id
        : null;
    setSessionTaskId(sessionTaskRef.current);
    sessionPresetRef.current = preset.id;
    sessionStartedAtRef.current = Date.now();
    workMsRef.current = 0;
    breatheMsRef.current = 0;
    completedRoundsRef.current = 0;
    setCompletedRounds(0);
    setSessionProjectId(pendingProjectRef.current);

    statusRef.current = 'running';
    phaseRef.current = 'focus';
    roundRef.current = 0;
    phaseDurRef.current = timingsRef.current.focusMs;
    endsAtRef.current = Date.now() + phaseDurRef.current;
    setStatus('running');
    setPhaseState('focus');
    setRoundState(0);
    setSecondsLeft(displaySeconds(phaseDurRef.current));
    persistSnapshot();

    const granted = await prepareNotifications().catch(() => false);
    notificationsGrantedRef.current = granted;
    setNotificationsGranted(granted);
    if (epochRef.current !== epoch) return;
    await rescheduleAlarms(epoch);
  }, [stopAlarm, rescheduleAlarms, persistSnapshot]);

  /**
   * Sonraki tura geç: Nefes Al sırasında (erken bitir) ya da manuel moddaki
   * bekleme durumunda kullanılır. Nefesin fiilen geçen kısmı sayılır.
   */
  const advance = useCallback(async () => {
    const st = statusRef.current;
    const inBreathe = st === 'running' && phaseRef.current === 'breathe';
    if (st !== 'waiting' && !inBreathe) return;
    const epoch = ++epochRef.current;
    stopAlarm();
    if (inBreathe) {
      // Nefes erken bitiyor: geçen kısmı say, kalan dürtü bildirimlerini sustur.
      const elapsed = phaseDurRef.current - Math.max(0, endsAtRef.current - Date.now());
      breatheMsRef.current += Math.max(0, elapsed);
      void silenceBoundaryAlarms(scheduledRef.current, breatheRepeatKey(roundRef.current));
    }
    // 'waiting' durumunda nefes zaten tamamlandı ve syncNow'da sayıldı.
    const nextRound = roundRef.current + 1;
    roundRef.current = nextRound;
    phaseRef.current = 'focus';
    phaseDurRef.current = timingsRef.current.focusMs;
    endsAtRef.current = Date.now() + phaseDurRef.current;
    statusRef.current = 'running';
    setStatus('running');
    setRoundState(nextRound);
    setPhaseState('focus');
    setSecondsLeft(displaySeconds(phaseDurRef.current));
    await rescheduleAlarms(epoch);
  }, [stopAlarm, rescheduleAlarms]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    epochRef.current += 1;
    stopAlarm();
    pausedAtRef.current = Date.now();
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
    // Odak/Tekrar fazında duraklatılan süre borçtur: sonraki Nefes Al
    // sürelerinden düşülür. Nefes Al'da duraklatma borç doğurmaz.
    if (phaseRef.current !== 'breathe' && pausedAtRef.current > 0) {
      debtRef.current += Math.max(0, Date.now() - pausedAtRef.current);
    }
    pausedAtRef.current = 0;
    endsAtRef.current = Date.now() + pausedRemainingRef.current;
    statusRef.current = 'running';
    setStatus('running');
    await rescheduleAlarms(epoch);
  }, [rescheduleAlarms]);

  /** Oturumu bitirir ve kayda döker; sayaç boşa döner. */
  const finish = useCallback(() => {
    epochRef.current += 1;
    if (sessionActiveRef.current) {
      const st = statusRef.current;
      const ph = phaseRef.current;
      let elapsed = 0;
      if (st === 'running') {
        elapsed = phaseDurRef.current - Math.max(0, endsAtRef.current - Date.now());
      } else if (st === 'paused') {
        elapsed = phaseDurRef.current - pausedRemainingRef.current;
      }
      elapsed = Math.max(0, elapsed);
      // Odak fazında bırakılan tur SAYILMAZ: ne süresi ne turu işlenir.
      const extraWork = ph === 'review' ? elapsed : 0;
      const extraBreathe = ph === 'breathe' && st !== 'waiting' ? elapsed : 0;
      finishSession(extraWork, extraBreathe);
    }
    stopAlarm();
    statusRef.current = 'idle';
    phaseRef.current = 'focus';
    roundRef.current = 0;
    endsAtRef.current = 0;
    phaseDurRef.current = 0;
    pausedRemainingRef.current = 0;
    pausedAtRef.current = 0;
    // Borç oturuma özeldir: bitirmeyle ölür, sonraki seansa taşınmaz.
    debtRef.current = 0;
    debtAppliedRef.current = 0;
    setBreatheDebtAppliedMs(0);
    setStatus('idle');
    setPhaseState('focus');
    setRoundState(0);
    setCompletedRounds(0);
    setSecondsLeft(displaySeconds(phaseDurationMs(pendingPresetRef.current, 'focus')));
    setSessionAuto(null);
    setSessionProjectId(null);
    sessionTaskRef.current = null;
    setSessionTaskId(null);
    hideMiniTimer();
    scheduledRef.current = new Map();
    void cancelAllSessionAlarms();
  }, [stopAlarm, finishSession]);

  return {
    status,
    /** Yürüyen faz: 'focus' | 'review' | 'breathe'. */
    phase,
    /** Kaçıncı tur (0-tabanlı; gösterimde +1). */
    round,
    /** Tekrar fazına ulaşmış (sayılan) tur sayısı. */
    completedRounds,
    secondsLeft,
    alarmActive,
    autoAdvance: sessionAuto ?? settings.autoAdvance,
    /** Boşta: seçilecek proje. Oturumda: değişmez (sessionProjectId'ye bak). */
    pendingProjectId,
    setPendingProject,
    /** Oturum başladığında kilitlenen proje. */
    sessionProjectId,
    /** Boşta: seçilecek görev (projeye bağlı). Oturumda: değişmez. */
    pendingTaskId,
    setPendingTask,
    /** Oturum başladığında kilitlenen görev (kayda yazılır). */
    sessionTaskId,
    /** Boştaki seçime göre çalışacak önayar. */
    pendingPreset,
    pendingPresetName: pendingPreset.name,
    /** Son kaydedilen oturum özeti. */
    lastSaved,
    /** false: bildirim izni yok/desteklenmiyor → arka planda alarm çalmaz. */
    notificationsGranted,
    /** Nefes sürelerinden fiilen düşülen toplam borç (gecikme + duraklatma), ms. */
    breatheDebtAppliedMs,
    start,
    advance,
    pause,
    resume,
    finish,
    /** Silinen kaydın özet satırı ekranda kalmasın diye. */
    clearLastSaved: () => setLastSaved(null),
    acknowledgeAlarm: () => stopAlarm(true),
  };
}
