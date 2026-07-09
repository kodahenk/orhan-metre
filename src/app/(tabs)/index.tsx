import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatClock, formatDate, formatTime } from '@/features/timer/format';
import { DISPLAY_SIZE_SCALE } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import { Button, HeaderIconButton, ScreenHeader } from '@/features/ui/components';
import { F, L } from '@/features/ui/theme';

export default function TimerTabScreen() {
  const router = useRouter();
  const timer = useTimer();
  const { settings } = useTimerSettings();
  const { width, height } = useWindowDimensions();

  const running = timer.status === 'running';
  const between = timer.status === 'between';

  // Sekme çubuğu + başlık + kontroller varken rakamlara kalan alan daha dar;
  // tam ekrandakiyle aynı sığdırma mantığı, daha küçük bütçeyle.
  const fitFontSize = Math.max(40, Math.min(140, width * 0.24, (height - 430) / 1.32));
  const timeFontSize = fitFontSize * DISPLAY_SIZE_SCALE[settings.display.size];
  const clockFontSize = Math.max(15, Math.round(timeFontSize * 0.28));
  const dateFontSize = Math.max(13, Math.round(timeFontSize * 0.2));

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

  const parts = timer.parts;
  const phase = parts[timer.phaseIndex];
  const nextPart = between ? parts[timer.phaseIndex + 1] : null;

  const topLabel = (() => {
    if (timer.status === 'idle') return 'Hazır';
    if (timer.status === 'done') return 'Tamamlandı';
    if (between && nextPart) return `Sıradaki: ${nextPart.label}`;
    return phase.label;
  })();

  const activeDot = between ? timer.phaseIndex + 1 : timer.phaseIndex;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Zamanlayıcı"
          right={<HeaderIconButton icon="maximize" onPress={() => router.push('/timer')} />}
        />

        <Pressable
          style={styles.body}
          onPress={() => timer.alarmActive && timer.acknowledgeAlarm()}
          android_disableSound
        >
          <View style={styles.topGroup}>
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
          </View>

          <View style={styles.timeGroup}>
            <Text
              style={[styles.time, { fontSize: timeFontSize }]}
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
          </View>

          <View style={styles.controls}>
            {timer.alarmActive && (
              <View style={styles.hintRow}>
                <Feather name="bell-off" size={15} color={L.warning} />
                <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
                  Susturmak için dokun
                </Text>
              </View>
            )}

            {timer.status === 'idle' && (
              <Button icon="play" label="Başlat" onPress={timer.start} variant="primary" />
            )}

            {between && !timer.alarmActive && (
              <View style={styles.buttonRow}>
                <Button icon="play" label="Devam" onPress={timer.advance} variant="primary" />
                <Button icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
              </View>
            )}

            {running && !timer.alarmActive && (
              <View style={styles.buttonRow}>
                <Button icon="pause" label="Duraklat" onPress={timer.pause} />
                <Button icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
              </View>
            )}

            {timer.status === 'paused' && (
              <View style={styles.buttonRow}>
                <Button icon="play" label="Devam" onPress={timer.resume} variant="primary" />
                <Button icon="rotate-ccw" label="Sıfırla" onPress={timer.reset} />
              </View>
            )}

            {timer.status === 'done' && !timer.alarmActive && (
              <Button
                icon="refresh-ccw"
                label="Yeniden Başlat"
                onPress={timer.reset}
                variant="primary"
              />
            )}
          </View>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: L.canvas,
  },
  safeArea: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
  },
  topGroup: {
    alignItems: 'center',
    gap: 14,
  },
  phaseLabel: {
    color: L.ink2,
    fontFamily: F.uiSemi,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: L.hairline,
  },
  dotPast: {
    backgroundColor: L.borderActive,
  },
  dotActive: {
    backgroundColor: L.accent,
  },
  timeGroup: {
    alignItems: 'center',
    gap: 4,
  },
  time: {
    color: L.ink,
    fontFamily: F.monoMed,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 16,
  },
  clock: {
    color: L.ink2,
    fontFamily: F.mono,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
    marginTop: 4,
  },
  date: {
    color: L.tertiary,
    fontFamily: F.mono,
    letterSpacing: 1,
  },
  controls: {
    alignItems: 'center',
    gap: 16,
    minHeight: 96,
    justifyContent: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    color: L.warning,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
