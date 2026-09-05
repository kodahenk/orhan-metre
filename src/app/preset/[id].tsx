import { FormScrollView } from '@/features/ui/form-scroll-view';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PRESET_LIMITS, roundMinutes, sanitizePreset } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { confirmAction } from '@/features/ui/dialogs';
import { F, L, R } from '@/features/ui/theme';

// Sayı alanları yazım sırasında serbest metin tutulur; kaydederken ayrıştırılıp
// sınırlara oturtulur (sanitizePreset).
const parseNum = (s: string) => Number(s.replace(',', '.'));

type FieldKey = 'focus' | 'review' | 'breathe' | 'notify';

const FIELDS: {
  key: FieldKey;
  label: string;
  unit: string;
  hint: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    key: 'focus',
    label: 'Odak',
    unit: 'dk',
    hint: 'Turun ilk fazı. Bu fazda bitirilen tur sayılmaz.',
    icon: 'zap',
  },
  {
    key: 'review',
    label: 'Tekrar',
    unit: 'dk',
    hint: 'Bu faza ulaşan tur çalışılmış sayılır ve kaydedilir.',
    icon: 'repeat',
  },
  {
    key: 'breathe',
    label: 'Nefes Al',
    unit: 'dk',
    hint: 'Tur arası bekleme; süresi dolunca sonraki tura geçilir.',
    icon: 'wind',
  },
  {
    key: 'notify',
    label: 'Bildirim aralığı',
    unit: 'sn',
    hint: 'Nefes Al boyunca kaç saniyede bir dürtüleceğin.',
    icon: 'bell',
  },
];

export default function PresetEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { presets, savePreset, deletePreset } = useTimerSettings();
  const preset = presets.find((p) => p.id === id);

  const [name, setName] = useState(preset?.name ?? '');
  const [values, setValues] = useState<Record<FieldKey, string>>(() => ({
    focus: String(preset?.focusMinutes ?? ''),
    review: String(preset?.reviewMinutes ?? ''),
    breathe: String(preset?.breatheMinutes ?? ''),
    notify: String(preset?.notifySeconds ?? ''),
  }));

  if (!preset) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <Text style={styles.emptyText}>Önayar bulunamadı.</Text>
          <Pressable
            style={({ pressed }) => [styles.backHome, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
          >
            <Feather name="chevron-left" size={16} color={L.ink2} />
            <Text style={styles.backHomeText}>Geri dön</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const draft = sanitizePreset({
    id: preset.id,
    name,
    focusMinutes: parseNum(values.focus),
    reviewMinutes: parseNum(values.review),
    breatheMinutes: parseNum(values.breathe),
    notifySeconds: parseNum(values.notify),
  });

  const onSave = async () => {
    await savePreset(draft);
    router.back();
  };

  const confirmDelete = () => {
    if (presets.length <= 1) return;
    confirmAction({
      title: 'Önayarı sil',
      message: `"${preset.name}" silinecek.`,
      onConfirm: async () => {
        await deletePreset(preset.id);
        router.back();
      },
    });
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={24} color={L.ink} />
          </Pressable>
          <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>
            Önayarı Düzenle
          </Text>
          <Pressable
            onPress={confirmDelete}
            hitSlop={8}
            disabled={presets.length <= 1}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={20} color={presets.length <= 1 ? L.hairline : L.ink2} />
          </Pressable>
        </View>

        <View style={styles.flex}>
          <FormScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.3}>
              Önayar adı
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="ör. Klasik Tur"
              placeholderTextColor={L.tertiary}
              maxLength={30}
            />

            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              TUR SÜRELERİ
            </Text>
            <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
              Her tur Odak → Tekrar → Nefes Al sırasıyla işler ve sen bitirene kadar döner.
            </Text>

            <View style={styles.card}>
              {FIELDS.map((field, i) => (
                <View key={field.key} style={[styles.row, i > 0 && styles.rowSeparator]}>
                  <Feather name={field.icon} size={16} color={L.tertiary} />
                  <View style={styles.flex}>
                    <Text style={styles.rowLabel} maxFontSizeMultiplier={1.2}>
                      {field.label}
                    </Text>
                    <Text style={styles.rowHint} maxFontSizeMultiplier={1.2}>
                      {field.hint}
                    </Text>
                  </View>
                  <View style={styles.unitBox}>
                    <TextInput
                      style={styles.unitInput}
                      value={values[field.key]}
                      onChangeText={(t) => setValues((v) => ({ ...v, [field.key]: t }))}
                      keyboardType={field.unit === 'sn' ? 'number-pad' : 'decimal-pad'}
                      maxLength={5}
                    />
                    <Text style={styles.unitSuffix} maxFontSizeMultiplier={1.1}>
                      {field.unit}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.summary} maxFontSizeMultiplier={1.2}>
              Bir tur ≈ {roundMinutes(draft)} dk · Odak {draft.focusMinutes} + Tekrar{' '}
              {draft.reviewMinutes} + Nefes {draft.breatheMinutes} dk
            </Text>
            <Text style={styles.limits} maxFontSizeMultiplier={1.2}>
              Süreler {PRESET_LIMITS.focusMinutes.min}–{PRESET_LIMITS.focusMinutes.max} dk,
              bildirim aralığı {PRESET_LIMITS.notifySeconds.min}–{PRESET_LIMITS.notifySeconds.max}{' '}
              sn arasına oturtulur.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
              onPress={onSave}
            >
              <Feather name="check" size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText} maxFontSizeMultiplier={1.3}>
                Kaydet
              </Text>
            </Pressable>
          </FormScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: L.canvas,
  },
  safeArea: {
    flex: 1,
    minWidth: 0,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 56,
    backgroundColor: L.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.hairline,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
  },
  headerTitle: {
    flexShrink: 1,
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 17,
  },
  content: {
    padding: 16,
    gap: 12,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 12,
    letterSpacing: 0.6,
    marginTop: 12,
  },
  sectionHint: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 12,
    lineHeight: 18,
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
  card: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: L.hairline,
  },
  rowLabel: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  rowHint: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  unitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 8,
    gap: 3,
  },
  unitInput: {
    width: 38,
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 15,
    textAlign: 'right',
    padding: 0,
  },
  unitSuffix: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  summary: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 12,
    marginTop: 4,
  },
  limits: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
    lineHeight: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    backgroundColor: L.accent,
    borderRadius: R.md,
    marginTop: 12,
  },
  saveButtonPressed: {
    backgroundColor: L.accentPressed,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
    fontSize: 14,
  },
  backHome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    height: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  backHomeText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  emptyText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  pressed: {
    backgroundColor: L.pressed,
  },
});
