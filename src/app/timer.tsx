import { Feather } from '@expo/vector-icons';
import { NavigationBar } from 'expo-navigation-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarHidden } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { taskPathLabel, useProjects } from '@/features/projects/projects-context';
import { formatClock, formatDate, formatTime } from '@/features/timer/format';
import { DISPLAY_SIZE_SCALE, PHASE_LABELS, PHASE_ORDER } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import {
  NO_PROJECT_KEY,
  NO_TASK_KEY,
  useSelectionPickers,
} from '@/features/timer/use-selection-pickers';
import { PickerSheet } from '@/features/ui/components';
import { confirmAction } from '@/features/ui/dialogs';
import { D, F, R } from '@/features/ui/theme';

type TimerButtonProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
};

// AMOLED ekrana özel koyu buton: saydam zemin, hairline kenarlık, minimal radius.
function TimerButton({ icon, label, onPress, primary }: TimerButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Feather name={icon} size={17} color={primary ? D.text : D.text2} />
      <Text
        style={[styles.buttonText, primary && styles.buttonTextPrimary]}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Sayaç çalışırken arayüz (faz adı, butonlar) bu süre sonunda kendiliğinden
// gizlenir; ekrana dokunmak arayüzü açıp kapatır.
const CHROME_HIDE_DELAY_MS = 10_000;

export default function FullscreenTimerScreen() {
  const router = useRouter();
  const timer = useTimer();
  const { settings } = useTimerSettings();
  const { projects, tasks } = useProjects();
  const { projectOptions, taskOptions, pendingProject, pendingTask, projectTasks, selectProject, selectTask } =
    useSelectionPickers();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const sessionProject = timer.sessionProjectId
    ? projects.find((p) => p.id === timer.sessionProjectId)
    : null;
  const sessionTaskLabel = timer.sessionTaskId ? taskPathLabel(tasks, timer.sessionTaskId) : null;
  const idle = timer.status === 'idle';
  const running = timer.status === 'running';
  const waiting = timer.status === 'waiting';
  // Nefes Al: hem akarken hem beklerken sonraki tura geçilebilir.
  const inBreathe = (running && timer.phase === 'breathe') || waiting;
  const { width, height } = useWindowDimensions();

  // Zamanlayıcı ekranı odaktayken tam ekran: sistem çubukları gizlenir,
  // ekrandan çıkınca geri gelir.
  useFocusEffect(
    useCallback(() => {
      setStatusBarHidden(true, 'fade');
      if (Platform.OS === 'android') NavigationBar.setHidden(true);
      return () => {
        setStatusBarHidden(false, 'fade');
        if (Platform.OS === 'android') NavigationBar.setHidden(false);
      };
    }, []),
  );

  // Rakamlar hem dikeyde hem yatayda taşmadan sığsın: genişlik sınırı
  // (5 karakter × 0.6em mono) ve dikey bütçe (2 × chrome 96 + boşluklar
  // + saat/tarih satırları, satır yüksekliği ≈ 1.32em) birlikte hesaplanır;
  // kullanıcı boyut tercihi bu sığan üst sınırın yüzdesi olarak uygulanır.
  const fitFontSize = Math.max(48, Math.min(200, width * 0.3, (height - 300) / 1.32));
  const timeFontSize = fitFontSize * DISPLAY_SIZE_SCALE[settings.display.size];
  const clockFontSize = Math.max(18, Math.round(timeFontSize * 0.3));
  const dateFontSize = Math.max(15, Math.round(timeFontSize * 0.22));

  // Faz rengi: Odak gri, Tekrar mavi, Nefes Al sarı. Beklerken sıradaki tur
  // için odak süresi gösterildiğinden gri kullanılır.
  const timeColor = (() => {
    if (idle || waiting) return D.text;
    if (timer.phase === 'review') return D.sky;
    if (timer.phase === 'breathe') return D.yellow;
    return D.text;
  })();

  // Tarih ve saat satırları: 10 sn'de bir tazelenir; değer değişmedikçe
  // setState render tetiklemez (tarih günde bir, saat dakikada bir değişir).
  const [dateText, setDateText] = useState(() => formatDate(new Date()));
  const [clockText, setClockText] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setDateText(formatDate(now));
      setClockText(formatClock(now));
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const [chromeVisible, setChromeVisible] = useState(true);
  const [revealNonce, setRevealNonce] = useState(0);
  // NOT: react-native-web 'useAnimatedValue' export etmiyor; kullanılırsa web'de
  // ekran komple çöküyor. Taşınabilir karşılığı: useState başlatıcısıyla bir kez
  // kurulan Animated.Value (useRef().current render sırasında ref okuması sayılır).
  const [chromeOpacity] = useState(() => new Animated.Value(1));
  const [dimOpacity] = useState(() => new Animated.Value(1));
  const [shiftX] = useState(() => new Animated.Value(0));
  const [shiftY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: chromeVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, chromeOpacity]);

  // AMOLED koruması 1 — soluklaştırma: arayüz gizliyken rakamlar %65
  // parlaklığa iner (panel eskimesi + pil); dokununca tam parlaklığa döner.
  useEffect(() => {
    Animated.timing(dimOpacity, {
      toValue: chromeVisible ? 1 : 0.65,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, dimOpacity]);

  // AMOLED koruması 2 — piksel kaydırma: uzun oturumlarda rakamlar hep aynı
  // piksellerde durmasın diye gizliyken her 60 sn'de bir yumuşak geçişle
  // ±8/±6 piksellik rastgele konuma kayar; arayüz açılınca merkeze döner.
  useEffect(() => {
    const glide = (x: number, y: number) =>
      Animated.parallel([
        Animated.timing(shiftX, { toValue: x, duration: 1000, useNativeDriver: true }),
        Animated.timing(shiftY, { toValue: y, duration: 1000, useNativeDriver: true }),
      ]).start();

    if (chromeVisible) {
      glide(0, 0);
      return;
    }
    const move = () => glide((Math.random() * 2 - 1) * 8, (Math.random() * 2 - 1) * 6);
    move();
    const id = setInterval(move, 60_000);
    return () => clearInterval(id);
  }, [chromeVisible, shiftX, shiftY]);

  // Çalışırken 10 sn hareketsizlik sonrası arayüzü gizle. Alarm çalarken
  // gizleme askıya alınır: "Susturmak için dokun" ipucu görünür kalmalı.
  useEffect(() => {
    if (!running || !chromeVisible || timer.alarmActive) return;
    const id = setTimeout(() => setChromeVisible(false), CHROME_HIDE_DELAY_MS);
    return () => clearTimeout(id);
  }, [running, chromeVisible, revealNonce, timer.alarmActive]);

  // Sayaç durunca (bekleme dahil) ve faz değişince arayüz görünür olsun.
  const chromeStateKey = `${timer.status}:${timer.phase}:${timer.round}`;
  const [previousChromeState, setPreviousChromeState] = useState(chromeStateKey);
  if (previousChromeState !== chromeStateKey) {
    setPreviousChromeState(chromeStateKey);
    setChromeVisible(true);
    setRevealNonce((n) => n + 1);
  }

  const onScreenPress = useCallback(() => {
    if (timer.alarmActive) {
      timer.acknowledgeAlarm();
      // Susturma anında kontroller görünür olsun ki dokunuşun karşılığı görülsün.
      setChromeVisible(true);
      setRevealNonce((n) => n + 1);
      return;
    }
    if (running) {
      // Dokunmak arayüzü açar/kapatır; açıksa 10 sn sonra kendiliğinden gizlenir.
      setChromeVisible((v) => !v);
      setRevealNonce((n) => n + 1);
    }
  }, [timer, running]);

  // Bitir geri alınamaz; ana ekranla aynı onay burada da sorulur.
  const confirmFinish = () =>
    confirmAction({
      title: 'Çalışmayı bitir',
      message:
        timer.phase === 'focus' && !idle
          ? `Odak fazındasın: bu tur sayılmayacak. ${timer.completedRounds} tamamlanmış tur kaydedilecek.`
          : `${timer.completedRounds} tur kaydedilecek.`,
      confirmLabel: 'Bitir',
      onConfirm: timer.finish,
    });

  const topLabel = (() => {
    if (idle) return 'Hazır';
    if (waiting) return 'Nefes bitti';
    return PHASE_LABELS[timer.phase];
  })();

  return (
    <Pressable style={styles.screen} onPress={onScreenPress} android_disableSound>
      {/* Üst köşe: sekmelere dönüş (oturum devam eder) */}
      <Animated.View
        style={[styles.backWrap, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Feather name="minimize" size={19} color={D.text2} />
        </Pressable>
      </Animated.View>

      {/* Alarm göstergesi: hangi aşamada olunduğu üstten okunur. Chrome
          animasyonundan bağımsız; pointerEvents kapalı ki ekrana dokunup
          susturmayı engellemesin. */}
      {timer.alarmActive && (
        <View style={styles.alarmBadge} pointerEvents="none">
          <Feather name="bell" size={20} color={D.yellow} />
        </View>
      )}

      <Animated.View
        style={[styles.chrome, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <Text style={styles.phaseLabel} maxFontSizeMultiplier={1.3}>
          {topLabel}
        </Text>
        {sessionProject && (
          <View style={styles.projectRow}>
            <View style={[styles.projectDot, { backgroundColor: sessionProject.color }]} />
            <Text style={styles.projectText} maxFontSizeMultiplier={1.2}>
              {sessionProject.name}
            </Text>
          </View>
        )}
        {sessionTaskLabel && (
          <Text style={styles.taskText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {sessionTaskLabel}
          </Text>
        )}
        <View style={styles.dots}>
          {PHASE_ORDER.map((p) => (
            <View
              key={p}
              style={[styles.dot, !idle && p === timer.phase && styles.dotActive]}
            />
          ))}
        </View>
        {!idle && (
          <Text style={styles.roundText} maxFontSizeMultiplier={1.2}>
            {timer.round + 1}. TUR · {timer.completedRounds} TAMAM
          </Text>
        )}
      </Animated.View>

      {/* Rakamlar + saat + tarih tek grup: soluklaştırma ve piksel kaydırma
          üçünü birden kapsar. */}
      <Animated.View
        style={[
          styles.timeGroup,
          {
            opacity: dimOpacity,
            transform: [{ translateX: shiftX }, { translateY: shiftY }],
          },
        ]}
      >
        <Text
          style={[styles.time, { fontSize: timeFontSize, color: timeColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.1}
        >
          {formatTime(timer.secondsLeft)}
        </Text>
        <Text
          style={[styles.clock, { fontSize: clockFontSize }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {clockText}
        </Text>
        <Text
          style={[styles.date, { fontSize: dateFontSize }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {dateText}
        </Text>
      </Animated.View>

      <Animated.View
        style={[styles.chrome, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        {/* Boşta: planlı başlangıç. Oturumda: nefeslerden düşülen borç. */}
        {idle && settings.plannedStartTime && (
          <Text style={styles.model} maxFontSizeMultiplier={1.3}>
            Planlı başlangıç: {settings.plannedStartTime}
          </Text>
        )}
        {timer.breatheDebtAppliedMs > 0 && !idle && (
          <Text style={styles.model} maxFontSizeMultiplier={1.3}>
            Nefeslerden düşüldü: {Math.max(1, Math.round(timer.breatheDebtAppliedMs / 60_000))} dk
          </Text>
        )}

        {/* İzin reddedildiyse/desteklenmiyorsa oturum boyunca uyar. */}
        {timer.notificationsGranted === false && !idle && (
          <Text style={styles.model} maxFontSizeMultiplier={1.2}>
            Bildirim izni yok — uygulama arka plandayken alarm çalmaz
          </Text>
        )}

        {timer.alarmActive && (
          <View style={styles.hintRow}>
            <Feather name="bell-off" size={15} color={D.amber} />
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
              Susturmak için dokun
            </Text>
          </View>
        )}

        {/* Boşta proje + görev seçimi: tam ekrandan da başlatılabildiği için
            seçim buraya da konur, yoksa bayat seçimle oturum açılırdı. */}
        {idle && (
          <>
            <View style={styles.chipRow}>
              <Pressable
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                onPress={() => setProjectPickerOpen(true)}
              >
                <Feather name="folder" size={14} color={D.text2} />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                  {pendingProject ? pendingProject.name : 'Projesiz'}
                </Text>
              </Pressable>
              {pendingProject && projectTasks.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                  onPress={() => setTaskPickerOpen(true)}
                >
                  <Feather name="check-square" size={14} color={D.text2} />
                  <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {pendingTask ? pendingTask.title : 'Görevsiz'}
                  </Text>
                </Pressable>
              )}
            </View>
            <TimerButton icon="play" label="Başlat" onPress={timer.start} primary />
          </>
        )}

        {/* Nefes Al'da otomatik geçiş bilgisi */}
        {running && timer.phase === 'breathe' && !timer.alarmActive && timer.autoAdvance && (
          <Text style={styles.model} maxFontSizeMultiplier={1.3}>
            Nefes bitince sonraki tur kendiliğinden başlar
          </Text>
        )}

        {/* Alarm çalarken butonlar gizli: her dokunuş yalnızca alarmı susturur,
            aceleyle Bitir'e basılıp seans kapatılmaz. */}
        {!idle && !timer.alarmActive && (
          <View style={styles.buttonRow}>
            {inBreathe && (
              <TimerButton icon="play" label="Sonraki tur" onPress={timer.advance} primary />
            )}
            {running && !inBreathe && (
              <TimerButton icon="pause" label="Duraklat" onPress={timer.pause} />
            )}
            {timer.status === 'paused' && (
              <TimerButton icon="play" label="Devam" onPress={timer.resume} primary />
            )}
            <TimerButton icon="square" label="Bitir" onPress={confirmFinish} />
          </View>
        )}
      </Animated.View>

      <PickerSheet
        visible={projectPickerOpen}
        title="Proje seç"
        options={projectOptions}
        selectedKey={timer.pendingProjectId ?? NO_PROJECT_KEY}
        onSelect={selectProject}
        onClose={() => setProjectPickerOpen(false)}
      />
      <PickerSheet
        visible={taskPickerOpen}
        title="Görev seç"
        options={taskOptions}
        selectedKey={pendingTask?.id ?? NO_TASK_KEY}
        onSelect={selectTask}
        onClose={() => setTaskPickerOpen(false)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: D.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  backWrap: {
    position: 'absolute',
    top: 24,
    left: 20,
    zIndex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: D.dotOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmBadge: {
    position: 'absolute',
    top: 24,
    right: 20,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  chrome: {
    alignItems: 'center',
    gap: 20,
    minHeight: 96,
    justifyContent: 'center',
  },
  phaseLabel: {
    color: D.text2,
    fontFamily: F.mono,
    fontSize: 20,
    letterSpacing: 8,
    textTransform: 'uppercase',
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  projectText: {
    color: D.text3,
    fontFamily: F.mono,
    fontSize: 12,
    letterSpacing: 1,
  },
  taskText: {
    color: D.text3,
    fontFamily: F.mono,
    fontSize: 11,
    letterSpacing: 1,
    maxWidth: 300,
  },
  roundText: {
    color: D.text3,
    fontFamily: F.mono,
    fontSize: 11,
    letterSpacing: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: D.dotOff,
  },
  dotActive: {
    backgroundColor: D.text,
  },
  timeGroup: {
    alignItems: 'center',
    gap: 6,
  },
  time: {
    fontFamily: F.monoThin,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 16,
  },
  clock: {
    color: D.clock,
    fontFamily: F.mono,
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
    marginTop: 4,
  },
  date: {
    color: D.text2,
    fontFamily: F.mono,
    letterSpacing: 2,
  },
  model: {
    color: D.text3,
    fontFamily: F.mono,
    fontSize: 13,
    letterSpacing: 1,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    color: D.amber,
    fontFamily: F.mono,
    fontSize: 13,
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    maxWidth: 220,
    paddingHorizontal: 14,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: D.border,
  },
  chipText: {
    color: D.text2,
    fontFamily: F.mono,
    fontSize: 12,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: D.border,
  },
  buttonPrimary: {
    borderColor: D.text,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: D.text2,
    fontFamily: F.mono,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  buttonTextPrimary: {
    color: D.text,
  },
  pressed: {
    opacity: 0.6,
  },
});
