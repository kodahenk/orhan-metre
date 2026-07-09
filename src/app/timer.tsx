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

import { formatClock, formatDate, formatTime } from '@/features/timer/format';
import { DISPLAY_SIZE_SCALE } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import { PillButton } from '@/features/ui/components';
import { C, F } from '@/features/ui/theme';

// Sayaç çalışırken arayüz (part adı, butonlar) bu süre sonunda kendiliğinden
// gizlenir; ekrana dokunmak arayüzü açıp kapatır.
const CHROME_HIDE_DELAY_MS = 10_000;

export default function FullscreenTimerScreen() {
  const router = useRouter();
  const timer = useTimer();
  const { settings } = useTimerSettings();
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
          <Feather name="minimize" size={19} color={C.text2} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[styles.chrome, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <Text style={styles.phaseLabel} maxFontSizeMultiplier={1.3}>
          {topLabel}
        </Text>
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
        {timer.alarmActive && (
          <View style={styles.hintRow}>
            <Feather name="bell-off" size={15} color={C.amber} />
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
              Susturmak için dokun
            </Text>
          </View>
        )}

        {timer.status === 'idle' && (
          <PillButton icon="play" label="Başlat" onPress={timer.start} primary />
        )}

        {/* Partlar arası bekleme: Devam ile geç; otomatik modda alarm bitince
            kendiliğinden geçer. */}
        {between && (
          <>
            {!timer.alarmActive && timer.autoAdvance && (
              <Text style={styles.model} maxFontSizeMultiplier={1.3}>
                Alarm süresi dolunca otomatik başlar
              </Text>
            )}
            <View style={styles.buttonRow}>
              <PillButton icon="play" label="Devam" onPress={timer.advance} primary />
              <PillButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
            </View>
          </>
        )}

        {/* Alarm çalarken butonlar gizli: her dokunuş yalnızca alarmı susturur,
            aceleyle Sıfırla'ya basılıp seans kaybedilmez. */}
        {running && !timer.alarmActive && (
          <View style={styles.buttonRow}>
            <PillButton icon="pause" label="Duraklat" onPress={timer.pause} />
            <PillButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
          </View>
        )}

        {timer.status === 'paused' && (
          <View style={styles.buttonRow}>
            <PillButton icon="play" label="Devam" onPress={timer.resume} primary />
            <PillButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
          </View>
        )}

        {timer.status === 'done' && !timer.alarmActive && (
          <PillButton icon="refresh-ccw" label="Yeniden Başlat" onPress={timer.reset} primary />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C1E22',
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
    color: C.text2,
    fontFamily: F.mono,
    fontSize: 20,
    letterSpacing: 8,
    textTransform: 'uppercase',
  },
  dots: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1C1E22',
  },
  dotPast: {
    backgroundColor: '#4A4F58',
  },
  dotActive: {
    backgroundColor: C.text,
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
    color: '#B6BBC2',
    fontFamily: F.mono,
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
    marginTop: 4,
  },
  date: {
    color: C.text2,
    fontFamily: F.mono,
    letterSpacing: 2,
  },
  model: {
    color: C.text3,
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
    color: C.amber,
    fontFamily: F.mono,
    fontSize: 13,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  pressed: {
    opacity: 0.6,
  },
});
