import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
import { ScreenHeader } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

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
  const { settings, save } = useTimerSettings();

  const [parts, setParts] = useState<DraftPart[]>(() => toDraft(settings));
  const [autoAdvance, setAutoAdvance] = useState(settings.autoAdvance);
  const [display, setDisplay] = useState(settings.display);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

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
      const clean = sanitizeSettings({
        version: 2,
        autoAdvance,
        display,
        parts: parts.map((p) => ({
          id: p.id,
          label: p.label,
          minutes: parseNum(p.minutes),
          alarmSeconds: parseNum(p.alarmSeconds),
        })),
      });
      await save(clean);
      // Kaydedilmiş (sınırlara oturtulmuş) değerleri forma geri yansıt.
      setParts(toDraft(clean));
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Ayarlar" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              PARTLAR
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
                    style={[styles.input, styles.flex]}
                    value={part.label}
                    onChangeText={(t) => updatePart(part.id, { label: t })}
                    placeholder="Part adı"
                    placeholderTextColor={L.tertiary}
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
                      color={parts.length <= 1 ? L.hairline : L.ink2}
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
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              onPress={addPart}
            >
              <Feather name="plus" size={18} color={L.ink2} />
              <Text style={styles.addButtonText} maxFontSizeMultiplier={1.3}>
                Part Ekle
              </Text>
            </Pressable>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
              PART GEÇİŞİ
            </Text>
            <View style={styles.optionCard}>
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
              ].map((opt, i) => (
                <Pressable
                  key={opt.title}
                  style={[
                    styles.option,
                    i > 0 && styles.rowSeparator,
                    autoAdvance === opt.value && styles.optionSelected,
                  ]}
                  onPress={() => setAutoAdvance(opt.value)}
                >
                  <Feather
                    name={autoAdvance === opt.value ? 'check-circle' : 'circle'}
                    size={18}
                    color={autoAdvance === opt.value ? L.accent : L.borderActive}
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
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
              TAM EKRAN GÖRÜNÜMÜ
            </Text>
            <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
              Boyut ve renk, siyah (AMOLED) tam ekran zamanlayıcıya uygulanır.
            </Text>

            {/* Önizleme — tam ekran AMOLED'i temsil eder, bilinçli olarak siyah */}
            <View style={styles.previewBox}>
              <Text
                style={[
                  styles.previewTime,
                  {
                    color: display.color,
                    fontSize: { kucuk: 26, orta: 34, buyuk: 42 }[display.size],
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
              {(Object.keys(DISPLAY_SIZE_LABELS) as TimerDisplaySize[]).map((size, i) => (
                <Pressable
                  key={size}
                  style={[
                    styles.segmentItem,
                    i > 0 && styles.segmentDivider,
                    display.size === size && styles.segmentItemOn,
                  ]}
                  onPress={() => setDisplay((d) => ({ ...d, size }))}
                >
                  <Text
                    style={[styles.segmentText, display.size === size && styles.segmentTextOn]}
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
                  style={[styles.swatchWrap, display.color === color && styles.swatchWrapSelected]}
                  hitSlop={6}
                >
                  <View style={[styles.swatch, { backgroundColor: color }]} />
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                savedFlash && styles.saveButtonDone,
                pressed && !savedFlash && styles.saveButtonPressed,
              ]}
              onPress={onSave}
              disabled={saving}
            >
              <Feather name={savedFlash ? 'check-circle' : 'check'} size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText} maxFontSizeMultiplier={1.3}>
                {savedFlash ? 'Kaydedildi' : 'Kaydet'}
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
    backgroundColor: L.canvas,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 13,
    letterSpacing: 0.6,
    marginTop: 8,
  },
  sectionSpacing: {
    marginTop: 24,
  },
  sectionHint: {
    color: L.muted,
    fontFamily: F.ui,
    fontSize: 12,
    lineHeight: 18,
  },
  partCard: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    padding: 16,
    gap: 12,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  partIndex: {
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 14,
    width: 18,
  },
  field: {
    flex: 1,
    gap: 8,
  },
  fieldLabel: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  input: {
    height: 44,
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 15,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderStyle: 'dashed',
    borderRadius: R.lg,
  },
  addButtonPressed: {
    backgroundColor: L.pressed,
  },
  addButtonText: {
    color: L.ink2,
    fontFamily: F.uiSemi,
    fontSize: 13,
  },
  optionCard: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: L.hairline,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  optionSelected: {
    backgroundColor: L.selected,
  },
  optionTitle: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  optionTitleSelected: {
    color: L.accent,
  },
  optionDesc: {
    color: L.muted,
    fontFamily: F.ui,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  previewBox: {
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#000000',
  },
  previewTime: {
    fontFamily: F.monoThin,
    fontVariant: ['tabular-nums'],
  },
  segment: {
    flexDirection: 'row',
    height: 36,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentDivider: {
    borderLeftWidth: 1,
    borderLeftColor: L.border,
  },
  segmentItemOn: {
    backgroundColor: L.selected,
  },
  segmentText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  segmentTextOn: {
    color: L.accent,
    fontFamily: F.uiSemi,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  swatchWrap: {
    padding: 3,
    borderRadius: R.md + 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchWrapSelected: {
    borderColor: L.ink,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: L.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    backgroundColor: L.accent,
    borderRadius: R.md,
    marginTop: 24,
  },
  saveButtonPressed: {
    backgroundColor: L.accentPressed,
  },
  saveButtonDone: {
    backgroundColor: L.success,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
    fontSize: 14,
  },
  footnote: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
