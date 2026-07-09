import {
  RobotoMono_200ExtraLight,
  RobotoMono_300Light,
} from '@expo-google-fonts/roboto-mono';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DISPLAY_SIZE_LABELS,
  newPartId,
  PART_LIMITS,
  sanitizeSettings,
  TIMER_COLORS,
  type TimerDisplaySize,
  type TimerSettings,
} from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';

const UI_FONT = 'RobotoMono_300Light';

// Sayı alanları yazım sırasında serbest metin tutulur; kaydederken ayrıştırılıp
// sınırlara oturtulur (settings.sanitizeSettings).
type DraftPart = {
  id: string;
  label: string;
  minutes: string;
  alarmSeconds: string;
};

function toDraft(settings: TimerSettings): DraftPart[] {
  return settings.parts.map((p) => ({
    id: p.id,
    label: p.label,
    minutes: String(p.minutes),
    alarmSeconds: String(p.alarmSeconds),
  }));
}

const parseNum = (s: string) => Number(s.replace(',', '.'));

export default function SettingsScreen() {
  const [fontsLoaded] = useFonts({
    RobotoMono_200ExtraLight,
    RobotoMono_300Light,
  });
  const router = useRouter();
  const { settings, save } = useTimerSettings();

  const [parts, setParts] = useState<DraftPart[]>(() => toDraft(settings));
  const [autoAdvance, setAutoAdvance] = useState(settings.autoAdvance);
  const [display, setDisplay] = useState(settings.display);
  const [saving, setSaving] = useState(false);

  const updatePart = (id: string, patch: Partial<DraftPart>) => {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePart = (id: string) => {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  };

  const addPart = () => {
    setParts((prev) => [
      ...prev,
      { id: newPartId(), label: `Part ${prev.length + 1}`, minutes: '25', alarmSeconds: '60' },
    ]);
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save(
        sanitizeSettings({
          version: 2,
          autoAdvance,
          display,
          parts: parts.map((p) => ({
            id: p.id,
            label: p.label,
            minutes: parseNum(p.minutes),
            alarmSeconds: parseNum(p.alarmSeconds),
          })),
        }),
      );
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (!fontsLoaded) {
    return <View style={styles.screen} />;
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={() => router.back()} hitSlop={12}>
              <Feather name="chevron-left" size={22} color="#8A8F98" />
            </Pressable>
            <Text style={styles.headerTitle} maxFontSizeMultiplier={1.3}>
              Ayarlar
            </Text>
            <View style={styles.headerButton} />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              Partlar
            </Text>
            <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
              Her partın adı, süresi (dk, {PART_LIMITS.minutes.min}–{PART_LIMITS.minutes.max}) ve
              part bitince alarmın süreceği süre (sn, {PART_LIMITS.alarmSeconds.min}–
              {PART_LIMITS.alarmSeconds.max}). Alarm boyunca 15 sn'de bir bildirim gönderilir.
            </Text>

            {parts.map((part, i) => (
              <View key={part.id} style={styles.partCard}>
                <View style={styles.partRow}>
                  <Text style={styles.partIndex} maxFontSizeMultiplier={1.3}>
                    {i + 1}
                  </Text>
                  <TextInput
                    style={[styles.input, styles.inputLabel]}
                    value={part.label}
                    onChangeText={(t) => updatePart(part.id, { label: t })}
                    placeholder="Part adı"
                    placeholderTextColor="#3A3E45"
                    maxLength={24}
                  />
                  <Pressable
                    onPress={() => removePart(part.id)}
                    hitSlop={10}
                    disabled={parts.length <= 1}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Feather
                      name="trash-2"
                      size={18}
                      color={parts.length <= 1 ? '#2A2D33' : '#8A8F98'}
                    />
                  </Pressable>
                </View>
                <View style={styles.partRow}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.3}>
                      Süre (dk)
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={part.minutes}
                      onChangeText={(t) => updatePart(part.id, { minutes: t })}
                      keyboardType="decimal-pad"
                      maxLength={6}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.3}>
                      Alarm (sn)
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={part.alarmSeconds}
                      onChangeText={(t) => updatePart(part.id, { alarmSeconds: t })}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                </View>
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              onPress={addPart}
            >
              <Feather name="plus" size={18} color="#8A8F98" />
              <Text style={styles.addButtonText} maxFontSizeMultiplier={1.3}>
                Part Ekle
              </Text>
            </Pressable>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
              Part Geçişi
            </Text>
            {[
              {
                value: false,
                title: "Devam'a basınca",
                desc: 'Part bitince bekler; sonraki part Devam ile başlar.',
              },
              {
                value: true,
                title: 'Otomatik',
                desc: 'Alarm süresi dolunca sonraki part kendiliğinden başlar.',
              },
            ].map((opt) => (
              <Pressable
                key={opt.title}
                style={[styles.option, autoAdvance === opt.value && styles.optionSelected]}
                onPress={() => setAutoAdvance(opt.value)}
              >
                <Feather
                  name={autoAdvance === opt.value ? 'check-circle' : 'circle'}
                  size={18}
                  color={autoAdvance === opt.value ? '#E8EAED' : '#4A4F58'}
                />
                <View style={styles.flex}>
                  <Text
                    style={[
                      styles.optionTitle,
                      autoAdvance === opt.value && styles.optionTitleSelected,
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {opt.title}
                  </Text>
                  <Text style={styles.optionDesc} maxFontSizeMultiplier={1.3}>
                    {opt.desc}
                  </Text>
                </View>
              </Pressable>
            ))}

            <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
              Görünüm
            </Text>

            {/* Önizleme */}
            <View style={styles.previewBox}>
              <Text
                style={[
                  styles.previewTime,
                  {
                    color: display.color,
                    fontSize: { kucuk: 34, orta: 44, buyuk: 54 }[display.size],
                  },
                ]}
                maxFontSizeMultiplier={1.1}
              >
                25:00
              </Text>
            </View>

            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.3}>
              Sayaç boyutu
            </Text>
            <View style={styles.segment}>
              {(Object.keys(DISPLAY_SIZE_LABELS) as TimerDisplaySize[]).map((size) => (
                <Pressable
                  key={size}
                  style={[styles.segmentItem, display.size === size && styles.segmentItemSelected]}
                  onPress={() => setDisplay((d) => ({ ...d, size }))}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      display.size === size && styles.segmentTextSelected,
                    ]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {DISPLAY_SIZE_LABELS[size]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 8 }]} maxFontSizeMultiplier={1.3}>
              Sayaç rengi
            </Text>
            <View style={styles.swatchRow}>
              {TIMER_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setDisplay((d) => ({ ...d, color }))}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    display.color === color && styles.swatchSelected,
                  ]}
                  hitSlop={6}
                >
                  {display.color === color && <Feather name="check" size={14} color="#000000" />}
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
              onPress={onSave}
              disabled={saving}
            >
              <Feather name="check" size={18} color="#E8EAED" />
              <Text style={styles.saveButtonText} maxFontSizeMultiplier={1.3}>
                Kaydet
              </Text>
            </Pressable>
            <Text style={styles.footnote} maxFontSizeMultiplier={1.3}>
              Değişiklikler bir sonraki oturumda geçerli olur.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: '#E8EAED',
    fontFamily: UI_FONT,
    fontSize: 16,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 13,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  sectionSpacing: {
    marginTop: 24,
  },
  sectionHint: {
    color: '#5A5F68',
    fontFamily: UI_FONT,
    fontSize: 12,
    lineHeight: 18,
  },
  partCard: {
    borderWidth: 1,
    borderColor: '#1C1E22',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  partIndex: {
    color: '#4A4F58',
    fontFamily: UI_FONT,
    fontSize: 14,
    width: 18,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    color: '#5A5F68',
    fontFamily: UI_FONT,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    color: '#E8EAED',
    fontFamily: UI_FONT,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2A2D33',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputLabel: {
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2D33',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
  },
  addButtonText: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#1C1E22',
    borderRadius: 16,
    padding: 14,
  },
  optionSelected: {
    borderColor: '#4A4F58',
  },
  optionTitle: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 14,
  },
  optionTitleSelected: {
    color: '#E8EAED',
  },
  optionDesc: {
    color: '#5A5F68',
    fontFamily: UI_FONT,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  previewBox: {
    borderWidth: 1,
    borderColor: '#1C1E22',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#050607',
  },
  previewTime: {
    fontFamily: 'RobotoMono_200ExtraLight',
    fontVariant: ['tabular-nums'],
  },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#2A2D33',
    borderRadius: 12,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  segmentItemSelected: {
    backgroundColor: '#1C1E22',
  },
  segmentText: {
    color: '#8A8F98',
    fontFamily: UI_FONT,
    fontSize: 13,
  },
  segmentTextSelected: {
    color: '#E8EAED',
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 14,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 24,
  },
  saveButtonText: {
    color: '#E8EAED',
    fontFamily: UI_FONT,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  footnote: {
    color: '#3A3E45',
    fontFamily: UI_FONT,
    fontSize: 11,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
