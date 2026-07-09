import { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from 'react-native';

import { WORK_PHASES } from '@/features/timer/phases';
import { useWorkTimer } from '@/features/timer/use-work-timer';

// Sayaç çalışırken arayüz (faz adı, butonlar) bu süre sonunda kaybolur;
// ekrana dokununca geri gelir ve tekrar bu süre sonunda gizlenir.
const CHROME_HIDE_DELAY_MS = 3_000;

function formatTime(totalSeconds: number) {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function TimerScreen() {
  const timer = useWorkTimer();
  const running = timer.status === 'running';

  const [chromeVisible, setChromeVisible] = useState(true);
  const [revealNonce, setRevealNonce] = useState(0);
  // useRef(new Animated.Value()).current render sırasında ref okuduğu için
  // React Compiler tüm bileşeni optimizasyon dışı bırakıyordu.
  const chromeOpacity = useAnimatedValue(1);

  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: chromeVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, chromeOpacity]);

  // Çalışırken 3 sn hareketsizlik sonrası arayüzü gizle.
  useEffect(() => {
    if (!running || !chromeVisible) return;
    const id = setTimeout(() => setChromeVisible(false), CHROME_HIDE_DELAY_MS);
    return () => clearTimeout(id);
  }, [running, chromeVisible, revealNonce]);

  // Sayaç durunca ve faz değişince arayüz görünür olsun.
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
    }
    if (running) {
      setChromeVisible(true);
      setRevealNonce((n) => n + 1);
    }
  }, [timer.alarmActive, timer.acknowledgeAlarm, running]);

  const phase = WORK_PHASES[timer.phaseIndex];

  return (
    <Pressable style={styles.screen} onPress={onScreenPress} android_disableSound>
      <Animated.View
        style={[styles.chrome, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <Text style={styles.phaseLabel} maxFontSizeMultiplier={1.3}>
          {timer.status === 'done' ? 'Tamamlandı 🎉' : phase.label}
        </Text>
        <View style={styles.dots}>
          {WORK_PHASES.map((p, i) => (
            <View
              key={p.key}
              style={[
                styles.dot,
                i < timer.phaseIndex && styles.dotPast,
                i === timer.phaseIndex && timer.status !== 'idle' && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={styles.time} numberOfLines={1} adjustsFontSizeToFit>
        {formatTime(timer.secondsLeft)}
      </Text>

      <Animated.View
        style={[styles.chrome, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        {timer.alarmActive && <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Bildirimi durdurmak için dokun</Text>}

        {timer.status === 'idle' && (
          <>
            <Text style={styles.model} maxFontSizeMultiplier={1.3}>
              {WORK_PHASES.map((p) => `${p.label} ${p.minutes}dk`).join('  ·  ')}
            </Text>
            <Pressable style={styles.buttonPrimary} onPress={timer.start}>
              <Text style={styles.buttonPrimaryText} maxFontSizeMultiplier={1.3}>Başlat</Text>
            </Pressable>
          </>
        )}

        {/* Alarm çalarken butonlar gizli: her dokunuş yalnızca alarmı susturur,
            aceleyle Sıfırla'ya basılıp seans kaybedilmez. */}
        {running && !timer.alarmActive && (
          <View style={styles.buttonRow}>
            <Pressable style={styles.button} onPress={timer.pause}>
              <Text style={styles.buttonText} maxFontSizeMultiplier={1.3}>Duraklat</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={timer.reset}>
              <Text style={styles.buttonText} maxFontSizeMultiplier={1.3}>Sıfırla</Text>
            </Pressable>
          </View>
        )}

        {timer.status === 'paused' && (
          <View style={styles.buttonRow}>
            <Pressable style={styles.buttonPrimary} onPress={timer.resume}>
              <Text style={styles.buttonPrimaryText} maxFontSizeMultiplier={1.3}>Devam</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={timer.reset}>
              <Text style={styles.buttonText} maxFontSizeMultiplier={1.3}>Sıfırla</Text>
            </Pressable>
          </View>
        )}

        {timer.status === 'done' && !timer.alarmActive && (
          <Pressable style={styles.buttonPrimary} onPress={timer.reset}>
            <Text style={styles.buttonPrimaryText} maxFontSizeMultiplier={1.3}>Yeniden Başlat</Text>
          </Pressable>
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
    gap: 28,
  },
  chrome: {
    alignItems: 'center',
    gap: 20,
    minHeight: 96,
    justifyContent: 'center',
  },
  phaseLabel: {
    color: '#8A8F98',
    fontSize: 22,
    letterSpacing: 6,
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
    color: '#E8EAED',
    fontSize: 104,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'ui-rounded', default: 'sans-serif-light' }),
    paddingHorizontal: 16,
  },
  model: {
    color: '#5A5F68',
    fontSize: 14,
  },
  hint: {
    color: '#B8860B',
    fontSize: 14,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  buttonPrimary: {
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  buttonPrimaryText: {
    color: '#E8EAED',
    fontSize: 17,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  button: {
    borderWidth: 1,
    borderColor: '#2A2D33',
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#8A8F98',
    fontSize: 15,
    letterSpacing: 1,
  },
});
