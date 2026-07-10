import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DISPLAY_SIZE_LABELS,
  presetTotalMinutes,
  TIMER_COLORS,
  type TimerDisplaySize,
} from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { ScreenHeader } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, presets, save, addPreset } = useTimerSettings();

  const [autoAdvance, setAutoAdvance] = useState(settings.autoAdvance);
  const [display, setDisplay] = useState(settings.display);
  const [activePresetId, setActivePresetId] = useState(settings.activePresetId);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ayarlar başka yerde değişirse (ör. önayar silinince) formu tazele.
  useEffect(() => {
    setActivePresetId(settings.activePresetId);
  }, [settings.activePresetId]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save({ version: 3, activePresetId, autoAdvance, display });
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const onAddPreset = () => {
    const id = addPreset();
    router.push(`/preset/${id}`);
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Ayarlar" />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          {/* Önayarlar */}
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
            SAYAÇ ÖNAYARLARI
          </Text>
          <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
            Radyoya dokunmak genel varsayılanı seçer; satıra dokunmak önayarı düzenler.
            Projeler kendi önayarını proje detayından atayabilir.
          </Text>
          <View style={styles.card}>
            {presets.map((preset, i) => {
              const isActive = activePresetId === preset.id;
              const workCount = preset.parts.filter((p) => p.type === 'work').length;
              const breakCount = preset.parts.length - workCount;
              return (
                <Pressable
                  key={preset.id}
                  style={({ pressed }) => [
                    styles.presetRow,
                    i > 0 && styles.rowSeparator,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => router.push(`/preset/${preset.id}`)}
                >
                  <Pressable hitSlop={10} onPress={() => setActivePresetId(preset.id)}>
                    <Feather
                      name={isActive ? 'check-circle' : 'circle'}
                      size={19}
                      color={isActive ? L.accent : L.borderActive}
                    />
                  </Pressable>
                  <View style={styles.flex}>
                    <Text style={styles.presetName} maxFontSizeMultiplier={1.3}>
                      {preset.name}
                      {isActive && <Text style={styles.presetDefault}>  · varsayılan</Text>}
                    </Text>
                    <Text style={styles.presetMeta} maxFontSizeMultiplier={1.2}>
                      {preset.parts.length} part · {presetTotalMinutes(preset)} dk
                      {breakCount > 0 ? ` · ${workCount} çalışma, ${breakCount} mola` : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={L.tertiary} />
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.rowPressed]}
            onPress={onAddPreset}
          >
            <Feather name="plus" size={18} color={L.ink2} />
            <Text style={styles.addButtonText} maxFontSizeMultiplier={1.3}>
              Önayar Ekle
            </Text>
          </Pressable>

          {/* Part geçişi */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
            PART GEÇİŞİ
          </Text>
          <View style={styles.card}>
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

          {/* Görünüm */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
            TAM EKRAN GÖRÜNÜMÜ
          </Text>
          <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
            Boyut ve renk, siyah (AMOLED) tam ekran zamanlayıcıya uygulanır.
          </Text>
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
    fontSize: 12,
    letterSpacing: 0.6,
  },
  sectionSpacing: {
    marginTop: 24,
  },
  sectionHint: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
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
  rowPressed: {
    backgroundColor: L.pressed,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 60,
    paddingVertical: 10,
  },
  presetName: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 15,
  },
  presetDefault: {
    color: L.accent,
    fontFamily: F.ui,
    fontSize: 12,
  },
  presetMeta: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 3,
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
    color: L.ink2,
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
  fieldLabel: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
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
});
