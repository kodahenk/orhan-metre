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
  useAnimatedValue,
  useWindowDimensions,
  View,
} from 'react-native';

import { useProjects } from '@/features/projects/projects-context';
import { formatClock, formatDate, formatTime } from '@/features/timer/format';
import { DISPLAY_SIZE_SCALE } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
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

// Sayaç çalışırken arayüz (part adı, butonlar) bu süre sonunda kendiliğinden
// gizlenir; ekrana dokunmak arayüzü açıp kapatır.
const CHROME_HIDE_DELAY_MS = 10_000;

export default function FullscreenTimerScreen() {
  const router = useRouter();
  const timer = useTimer();
  const { settings } = useTimerSettings();
  const { projects } = useProjects();
  const sessionProject = timer.sessionProjectId
    ? projects.find((p) => p.id === timer.sessionProjectId)
    : null;
  const running = timer.status === 'running';
  const between = timer.status === 'between';
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
  const timeColor = settings.display.color;

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
  const chromeOpacity = useAnimatedValue(1);
  const dimOpacity = useAnimatedValue(1);
  const shiftX = useAnimatedValue(0);
  const shiftY = useAnimatedValue(0);

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

  // Çalışırken 10 sn hareketsizlik sonrası arayüzü gizle.
  // Alarm çalarken gizleme askıya alınır: "Susturmak için dokun" ipucu
  // alarm penceresi boyunca görünür kalmalı.
  useEffect(() => {
    if (!running || !chromeVisible || timer.alarmActive) return;
    const id = setTimeout(() => setChromeVisible(false), CHROME_HIDE_DELAY_MS);
    return () => clearTimeout(id);
  }, [running, chromeVisible, revealNonce, timer.alarmActive]);

  // Sayaç durunca (bekleme dahil) ve part değişince arayüz görünür olsun.
  useEffect(() => {
    if (!running) setChromeVisible(true);
  }, [running]);
  useEffect(() => {
    if (timer.phaseIndex > 0) {
      setChromeVisible(true);
      setRevealNonce((n) => n + 1);
    }
  }, [timer.phaseIndex]);

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
  }, [timer.alarmActive, timer.acknowledgeAlarm, running]);

  const parts = timer.parts;
  const phase = parts[timer.phaseIndex];
  const nextPart = between ? parts[timer.phaseIndex + 1] : null;

  const topLabel = (() => {
    if (timer.status === 'idle') return 'Hazır';
    if (timer.status === 'done') return 'Tamamlandı';
    if (between && nextPart) return `Sıradaki: ${nextPart.label}`;
    return phase.label;
  })();

  // Beklemede etkin nokta sıradaki partı gösterir.
  const activeDot = between ? timer.phaseIndex + 1 : timer.phaseIndex;

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
        <View style={styles.dots}>
          {parts.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.dot,
                i < activeDot && styles.dotPast,
                i === activeDot && timer.status !== 'idle' && styles.dotActive,
              ]}
            />
          ))}
        </View>
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
        {/* İzin reddedildiyse/desteklenmiyorsa oturum boyunca uyar: arka
            planda alarm çalmayacak, kullanıcı bunu bilmeli. */}
        {timer.notificationsGranted === false &&
          timer.status !== 'idle' &&
          timer.status !== 'done' && (
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

        {timer.status === 'idle' && (
          <TimerButton icon="play" label="Başlat" onPress={timer.start} primary />
        )}

        {/* Partlar arası bekleme: Devam ile geç; otomatik modda alarm bitince
            kendiliğinden geçer. Alarm çalarken butonlar gizli (running bloğu
            ve ana ekranla tutarlı): dokunuş önce susturur, aceleyle Sıfırla'ya
            basılıp seans kaybedilmez. */}
        {between && !timer.alarmActive && (
          <>
            {timer.autoAdvance && (
              <Text style={styles.model} maxFontSizeMultiplier={1.3}>
                Alarm süresi dolunca otomatik başlar
              </Text>
            )}
            <View style={styles.buttonRow}>
              <TimerButton icon="play" label="Devam" onPress={timer.advance} primary />
              <TimerButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
            </View>
          </>
        )}

        {/* Alarm çalarken butonlar gizli: her dokunuş yalnızca alarmı susturur,
            aceleyle Sıfırla'ya basılıp seans kaybedilmez. */}
        {running && !timer.alarmActive && (
          <>
            {/* Mola atlanabilir; kalan süre sıradaki MOLAYA taşınır (dinlenme
                ertelenir), sonrasında mola yoksa çalışmaya (süre kaybolmasın). */}
            {phase.type === 'break' && timer.phaseIndex < parts.length - 1 && (
              <Text style={styles.model} maxFontSizeMultiplier={1.3}>
                {parts.slice(timer.phaseIndex + 1).some((p) => p.type === 'break')
                  ? 'Atlarsan kalan süre sıradaki molaya eklenir'
                  : 'Atlarsan kalan süre sıradaki çalışmaya eklenir'}
              </Text>
            )}
            <View style={styles.buttonRow}>
              {phase.type === 'break' && (
                <TimerButton icon="skip-forward" label="Atla" onPress={timer.skipBreak} primary />
              )}
              <TimerButton icon="pause" label="Duraklat" onPress={timer.pause} />
              <TimerButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
            </View>
          </>
        )}

        {timer.status === 'paused' && (
          <View style={styles.buttonRow}>
            <TimerButton icon="play" label="Devam" onPress={timer.resume} primary />
            <TimerButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
          </View>
        )}

        {timer.status === 'done' && !timer.alarmActive && (
          <TimerButton icon="refresh-ccw" label="Yeniden Başlat" onPress={timer.reset} primary />
        )}
      </Animated.View>
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
  dotPast: {
    backgroundColor: D.dotPast,
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
