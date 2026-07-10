import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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
  newPartId,
  PART_LIMITS,
  PART_TYPE_LABELS,
  sanitizePreset,
  type PartType,
} from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { F, L, R } from '@/features/ui/theme';

// Sayı alanları yazım sırasında serbest metin tutulur; kaydederken ayrıştırılıp
// sınırlara oturtulur (sanitizePreset).
type DraftPart = {
  id: string;
  label: string;
  minutes: string;
  alarmSeconds: string;
  type: PartType;
};

const parseNum = (s: string) => Number(s.replace(',', '.'));

export default function PresetEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { presets, savePreset, deletePreset } = useTimerSettings();
  const preset = presets.find((p) => p.id === id);

  const [name, setName] = useState(preset?.name ?? '');
  const [parts, setParts] = useState<DraftPart[]>(() =>
    (preset?.parts ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      minutes: String(p.minutes),
      alarmSeconds: String(p.alarmSeconds),
      type: p.type,
    })),
  );

  if (!preset) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Text style={styles.emptyText}>Önayar bulunamadı.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const updatePart = (partId: string, patch: Partial<DraftPart>) =>
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, ...patch } : p)));

  const removePart = (partId: string) =>
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== partId) : prev));

  const addPart = () =>
    setParts((prev) => [
      ...prev,
      {
        id: newPartId(),
        label: prev.some((p) => p.type === 'break') ? `Part ${prev.length + 1}` : 'Mola',
        minutes: '5',
        alarmSeconds: '30',
        type: prev.some((p) => p.type === 'break') ? 'work' : 'break',
      },
    ]);

  const onSave = async () => {
    await savePreset(
      sanitizePreset({
        id: preset.id,
        name,
        parts: parts.map((p) => ({
          id: p.id,
          label: p.label,
          minutes: parseNum(p.minutes),
          alarmSeconds: parseNum(p.alarmSeconds),
          type: p.type,
        })),
      }),
    );
    router.back();
  };

  const confirmDelete = () => {
    if (presets.length <= 1) return;
    Alert.alert('Önayarı sil', `"${preset.name}" silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deletePreset(preset.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
            <Feather
              name="trash-2"
              size={20}
              color={presets.length <= 1 ? L.hairline : L.ink2}
            />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
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
              placeholder="ör. Klasik Pomodoro"
              placeholderTextColor={L.tertiary}
              maxLength={30}
            />

            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              PARTLAR
            </Text>
            <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
              "Çalışma" partları rapor ve hedeflerde sayılır; "Mola" sayılmaz. Süre dk (
              {PART_LIMITS.minutes.min}–{PART_LIMITS.minutes.max}), alarm sn (
              {PART_LIMITS.alarmSeconds.min}–{PART_LIMITS.alarmSeconds.max}).
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
                    style={({ pressed }) => pressed && styles.pressedOpacity}
                  >
                    <Feather
                      name="trash-2"
                      size={18}
                      color={parts.length <= 1 ? L.hairline : L.ink2}
                    />
                  </Pressable>
                </View>

                {/* Tür seçimi */}
                <View style={styles.segment}>
                  {(['work', 'break'] as PartType[]).map((type, ti) => (
                    <Pressable
                      key={type}
                      style={[
                        styles.segmentItem,
                        ti > 0 && styles.segmentDivider,
                        part.type === type && styles.segmentItemOn,
                      ]}
                      onPress={() => updatePart(part.id, { type })}
                    >
                      <Feather
                        name={type === 'work' ? 'zap' : 'coffee'}
                        size={13}
                        color={part.type === type ? L.accent : L.tertiary}
                      />
                      <Text
                        style={[styles.segmentText, part.type === type && styles.segmentTextOn]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {PART_TYPE_LABELS[type]}
                      </Text>
                    </Pressable>
                  ))}
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
              <Feather name="plus" size={18} color={L.ink2} />
              <Text style={styles.addButtonText} maxFontSizeMultiplier={1.3}>
                Part Ekle
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
              onPress={onSave}
            >
              <Feather name="check" size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText} maxFontSizeMultiplier={1.3}>
                Kaydet
              </Text>
            </Pressable>
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
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 17,
  },
  content: {
    padding: 16,
    gap: 12,
    maxWidth: 560,
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
  partCard: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    padding: 14,
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
    gap: 6,
  },
  segment: {
    flexDirection: 'row',
    height: 34,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    fontSize: 12,
  },
  segmentTextOn: {
    color: L.accent,
    fontFamily: F.uiSemi,
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
  addButtonText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
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
  pressedOpacity: {
    opacity: 0.6,
  },
});
