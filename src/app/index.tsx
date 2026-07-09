import {
  RobotoMono_200ExtraLight,
  RobotoMono_300Light,
  RobotoMono_500Medium,
} from '@expo-google-fonts/roboto-mono';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { totalMinutes } from '@/features/timer/settings';
import { useTimer } from '@/features/timer/timer-context';

const UI_FONT = 'RobotoMono_300Light';
const STRONG_FONT = 'RobotoMono_500Medium';

const STATUS_TEXT: Record<string, string> = {
  running: 'Oturum sürüyor',
  between: 'Part arası bekleme',
  paused: 'Duraklatıldı',
  done: 'Tamamlandı',
};

export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    RobotoMono_200ExtraLight,
    RobotoMono_300Light,
    RobotoMono_500Medium,
  });
  const router = useRouter();
  const timer = useTimer();

  if (!fontsLoaded) {
    return <View style={styles.screen} />;
  }

  const sessionActive = timer.status !== 'idle';
  const parts = timer.parts;

  const onPrimary = () => {
    if (!sessionActive) timer.start();
    router.push('/timer');
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        {/* Üst bar */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} maxFontSizeMultiplier={1.3}>
            Orhan Metre
          </Text>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Feather name="settings" size={20} color="#8A8F98" />
          </Pressable>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          {/* Plan özeti */}
          <View style={styles.hero}>
            <Text style={styles.heroTotal} maxFontSizeMultiplier={1.2}>
              {totalMinutes(parts)}
              <Text style={styles.heroUnit}> dk</Text>
            </Text>
            <View style={styles.heroMeta}>
              <View style={styles.chip}>
                <Feather
                  name={timer.autoAdvance ? 'fast-forward' : 'play-circle'}
                  size={12}
                  color="#8A8F98"
                />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.3}>
                  {timer.autoAdvance ? 'Otomatik geçiş' : 'Manuel geçiş'}
                </Text>
              </View>
              <View style={styles.chip}>
                <Feather name="layers" size={12} color="#8A8F98" />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.3}>
                  {parts.length} part
                </Text>
              </View>
            </View>
          </View>

          {/* Part listesi */}
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
            Plan
          </Text>
          {parts.map((part, i) => {
            const isCurrent = sessionActive && i === timer.phaseIndex;
            const isDone =
              sessionActive &&
              (i < timer.phaseIndex || (timer.status === 'done' && i <= timer.phaseIndex));
            return (
              <View key={part.id} style={[styles.partRow, isCurrent && styles.partRowActive]}>
                <View style={[styles.partBadge, isCurrent && styles.partBadgeActive]}>
                  {isDone ? (
                    <Feather name="check" size={14} color="#34D399" />
                  ) : (
                    <Text
                      style={[styles.partBadgeText, isCurrent && styles.partBadgeTextActive]}
                      maxFontSizeMultiplier={1.2}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <View style={styles.flex}>
                  <Text
                    style={[styles.partLabel, isCurrent && styles.partLabelActive]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {part.label}
                  </Text>
                  <Text style={styles.partMeta} maxFontSizeMultiplier={1.3}>
                    {part.minutes} dk · alarm {part.alarmSeconds} sn
                  </Text>
                </View>
                <Text style={styles.partDuration} maxFontSizeMultiplier={1.2}>
                  {part.minutes}′
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Alt eylem çubuğu */}
        <View style={styles.bottomBar}>
          {sessionActive && (
            <View style={styles.sessionBanner}>
              <View style={styles.sessionPulse} />
              <Text style={styles.sessionText} maxFontSizeMultiplier={1.3}>
                {STATUS_TEXT[timer.status] ?? ''}
              </Text>
              <Pressable onPress={timer.reset} hitSlop={10}>
                <Text style={styles.sessionReset} maxFontSizeMultiplier={1.3}>
                  Sıfırla
                </Text>
              </Pressable>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={onPrimary}
          >
            <Feather
              name={sessionActive ? 'clock' : 'play'}
              size={18}
              color="#000000"
            />
            <Text style={styles.primaryButtonText} maxFontSizeMultiplier={1.2}>
              {sessionActive ? 'Zamanlayıcıya Dön' : 'Başlat'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111316',
  },
  headerTitle: {
    color: '#E8EAED',
    fontFamily: STRONG_FONT,
    fontSize: 15,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 12,
  },
  heroTotal: {
    color: '#E8EAED',
    fontFamily: 'RobotoMono_200ExtraLight',
    fontSize: 64,
  },
  heroUnit: {
    color: '#5A5F68',
    fontSize: 24,
    fontFamily: UI_FONT,
  },
  heroMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#1C1E22',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#5A5F68',
    fontFamily: UI_FONT,
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#15171B',
    backgroundColor: '#0A0B0D',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  partRowActive: {
    borderColor: '#3A3E45',
  },
  partBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#2A2D33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partBadgeActive: {
    borderColor: '#E8EAED',
  },
  partBadgeText: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 13,
  },
  partBadgeTextActive: {
    color: '#E8EAED',
  },
  partLabel: {
    color: '#C9CDD3',
    fontFamily: STRONG_FONT,
    fontSize: 15,
  },
  partLabelActive: {
    color: '#FFFFFF',
  },
  partMeta: {
    color: '#5A5F68',
    fontFamily: UI_FONT,
    fontSize: 12,
    marginTop: 3,
  },
  partDuration: {
    color: '#8A8F98',
    fontFamily: 'RobotoMono_200ExtraLight',
    fontSize: 24,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#111316',
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  sessionText: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 13,
    flex: 1,
  },
  sessionReset: {
    color: '#F87171',
    fontFamily: UI_FONT,
    fontSize: 13,
    letterSpacing: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#E8EAED',
    borderRadius: 999,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#000000',
    fontFamily: STRONG_FONT,
    fontSize: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.7,
  },
});
