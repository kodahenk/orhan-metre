import {
  RobotoMono_200ExtraLight,
  RobotoMono_300Light,
} from '@expo-google-fonts/roboto-mono';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
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

import { DISPLAY_SIZE_SCALE } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';

// Sayaç çalışırken arayüz (part adı, butonlar) bu süre sonunda kendiliğinden
// gizlenir; ekrana dokunmak arayüzü açıp kapatır.
const CHROME_HIDE_DELAY_MS = 10_000;

const TIME_FONT = 'RobotoMono_200ExtraLight';
const UI_FONT = 'RobotoMono_300Light';

function formatTime(totalSeconds: number) {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

type IconButtonProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
};

function IconButton({ icon, label, onPress, primary }: IconButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Feather name={icon} size={18} color={primary ? '#E8EAED' : '#8A8F98'} />
      <Text
        style={[styles.buttonText, primary && styles.buttonPrimaryText]}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function TimerScreen() {
  const [fontsLoaded] = useFonts({
    RobotoMono_200ExtraLight,
    RobotoMono_300Light,
  });
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
  // (5 karakter × 0.6em mono) ve dikey bütçe (2 × chrome 96 + boşluklar 48,
  // satır yüksekliği ≈ 1.32em) birlikte hesaplanır; kullanıcı boyut tercihi
  // bu sığan üst sınırın yüzdesi olarak uygulanır (asla taşmaz).
  const fitFontSize = Math.max(48, Math.min(200, width * 0.3, (height - 240) / 1.32));
  const timeFontSize = fitFontSize * DISPLAY_SIZE_SCALE[settings.display.size];
  const timeColor = settings.display.color;

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

  if (!fontsLoaded) {
    return <View style={styles.screen} />;
  }

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
      {/* Üst köşe: ana sayfaya dönüş (oturum devam eder) */}
      <Animated.View
        style={[styles.backWrap, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={20} color="#8A8F98" />
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

      <Animated.Text
        style={[
          styles.time,
          {
            fontSize: timeFontSize,
            color: timeColor,
            opacity: dimOpacity,
            transform: [{ translateX: shiftX }, { translateY: shiftY }],
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.1}
      >
        {formatTime(timer.secondsLeft)}
      </Animated.Text>

      <Animated.View
        style={[styles.chrome, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        {timer.alarmActive && (
          <View style={styles.hintRow}>
            <Feather name="bell-off" size={15} color="#B8860B" />
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
              Susturmak için dokun
            </Text>
          </View>
        )}

        {timer.status === 'idle' && (
          <IconButton icon="play" label="Başlat" onPress={timer.start} primary />
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
              <IconButton icon="play" label="Devam" onPress={timer.advance} primary />
              <IconButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
            </View>
          </>
        )}

        {/* Alarm çalarken butonlar gizli: her dokunuş yalnızca alarmı susturur,
            aceleyle Sıfırla'ya basılıp seans kaybedilmez. */}
        {running && !timer.alarmActive && (
          <View style={styles.buttonRow}>
            <IconButton icon="pause" label="Duraklat" onPress={timer.pause} />
            <IconButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
          </View>
        )}

        {timer.status === 'paused' && (
          <View style={styles.buttonRow}>
            <IconButton icon="play" label="Devam" onPress={timer.resume} primary />
            <IconButton icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
          </View>
        )}

        {timer.status === 'done' && !timer.alarmActive && (
          <IconButton icon="refresh-ccw" label="Yeniden Başlat" onPress={timer.reset} primary />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
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
    color: '#8A8F98',
    fontFamily: UI_FONT,
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
    backgroundColor: '#E8EAED',
  },
  time: {
    fontFamily: TIME_FONT,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 16,
  },
  model: {
    color: '#5A5F68',
    fontFamily: UI_FONT,
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
    color: '#B8860B',
    fontFamily: UI_FONT,
    fontSize: 13,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2D33',
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  buttonPrimary: {
    borderColor: '#E8EAED',
    paddingHorizontal: 34,
  },
  buttonText: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  buttonPrimaryText: {
    color: '#E8EAED',
  },
  pressed: {
    opacity: 0.6,
  },
});
