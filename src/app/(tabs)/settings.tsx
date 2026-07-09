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
import { C, F } from '@/features/ui/theme';

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
                    style={[styles.input, styles.flex]}
                    value={part.label}
                    onChangeText={(t) => updatePart(part.id, { label: t })}
                    placeholder="Part adı"
                    placeholderTextColor={C.faint}
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
                      color={parts.length <= 1 ? C.border2 : C.text2}
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
              <Feather name="plus" size={18} color={C.text2} />
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
                  color={autoAdvance === opt.value ? C.text : C.faint}
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
              style={({ pressed }) => [
                styles.saveButton,
                savedFlash && styles.saveButtonDone,
                pressed && styles.pressed,
              ]}
              onPress={onSave}
              disabled={saving}
            >
              <Feather name={savedFlash ? 'check-circle' : 'check'} size={18} color="#000000" />
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
    backgroundColor: C.bg,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    paddingTop: 16,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    color: C.text,
    fontFamily: F.uiSemi,
    fontSize: 14,
    marginTop: 8,
  },
  sectionSpacing: {
    marginTop: 24,
  },
  sectionHint: {
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 12,
    lineHeight: 18,
  },
  partCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.faint,
    fontFamily: F.uiMed,
    fontSize: 14,
    width: 18,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    color: C.text3,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  input: {
    color: C.text,
    fontFamily: F.ui,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.border2,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
  },
  addButtonText: {
    color: C.text2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
  },
  optionSelected: {
    borderColor: C.border2,
  },
  optionTitle: {
    color: C.text2,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  optionTitleSelected: {
    color: C.text,
  },
  optionDesc: {
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  previewBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#050607',
  },
  previewTime: {
    fontFamily: F.monoThin,
    fontVariant: ['tabular-nums'],
  },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border2,
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
    color: C.text2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  segmentTextSelected: {
    color: C.text,
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
    backgroundColor: C.text,
    borderRadius: 999,
    paddingVertical: 15,
    marginTop: 24,
  },
  saveButtonDone: {
    backgroundColor: C.green,
  },
  saveButtonText: {
    color: '#000000',
    fontFamily: F.uiSemi,
    fontSize: 14,
  },
  footnote: {
    color: C.faint,
    fontFamily: F.ui,
    fontSize: 11,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
