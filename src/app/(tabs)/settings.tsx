import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  hasOverlayPermission,
  miniTimerSupported,
  requestOverlayPermission,
} from '@/features/timer/mini-timer';
import { notificationsSupported, prepareNotifications } from '@/features/timer/notifications';

import {
  DISPLAY_SIZE_LABELS,
  MIN_BREATHE_LIMITS,
  roundMinutes,
  WORK_END_REMINDER_OPTIONS,
  type TimerDisplaySize,
} from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { ScreenIntro, ScreenHeader } from '@/features/ui/components';
import { D, F, L, R } from '@/features/ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, presets, save, addPreset } = useTimerSettings();

  const [autoAdvance, setAutoAdvance] = useState(settings.autoAdvance);
  const [workEndReminder, setWorkEndReminder] = useState(settings.workEndReminderMinutes);
  const [plannedStart, setPlannedStart] = useState(settings.plannedStartTime ?? '');
  const [minBreathe, setMinBreathe] = useState(String(settings.minBreatheMinutes));
  const [display, setDisplay] = useState(settings.display);
  const [overlayGranted, setOverlayGranted] = useState(hasOverlayPermission);
  // Bildirim izni: alarmların arka planda çalışmasının ön koşulu.
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [activePresetId, setActivePresetId] = useState(settings.activePresetId);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ayarlar başka yerde değişirse VEYA diskten geç yüklenirse formun TÜM
  // alanları tazelenir. Yalnızca activePresetId tazelense, soğuk açılışta
  // varsayılanlarla dolan form Kaydet'te gerçek tercihleri sessizce ezerdi.
  const [previousSettings, setPreviousSettings] = useState(settings);
  if (previousSettings !== settings) {
    setPreviousSettings(settings);
    setActivePresetId(settings.activePresetId);
    setAutoAdvance(settings.autoAdvance);
    setWorkEndReminder(settings.workEndReminderMinutes);
    setPlannedStart(settings.plannedStartTime ?? '');
    setMinBreathe(String(settings.minBreatheMinutes));
    setDisplay(settings.display);
  }

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Sistem ayarlarından dönüşte izin durumlarını tazele.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setOverlayGranted(hasOverlayPermission());
    });
    return () => sub.remove();
  }, []);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Geçersiz saat/dk girişlerini sanitizeSettings eler (saat → null,
      // dk → 1-30 aralığına kırpma); kaydedilen değer forma geri yansır.
      await save({
        version: 4,
        activePresetId,
        autoAdvance,
        workEndReminderMinutes: workEndReminder,
        plannedStartTime: plannedStart.trim() || null,
        minBreatheMinutes: Number(minBreathe.replace(',', '.')),
        display,
      });
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
        <ScreenHeader title="Ayarlar" subtitle="Sana uyum sağlayan bir çalışma ritmi" />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <ScreenIntro eyebrow="TERCİHLERİN" title="Kendi ritmini bul." description="Odak sürelerini, molalarını ve bildirimlerini çalışma alışkanlığına göre düzenle." />
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
                      Odak {preset.focusMinutes} · Tekrar {preset.reviewMinutes} · Nefes{' '}
                      {preset.breatheMinutes} dk · tur ≈ {roundMinutes(preset)} dk
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

          {/* Tur geçişi */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
            TUR GEÇİŞİ
          </Text>
          <View style={styles.card}>
            {[
              {
                value: false,
                title: 'Elle geçiş',
                desc: "Nefes Al süresi dolunca bekler; sonraki tur 'Sonraki tur' ile başlar.",
              },
              {
                value: true,
                title: 'Otomatik',
                desc: 'Nefes Al süresi dolunca sonraki tur kendiliğinden başlar.',
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

          {/* Bildirim izni — alarmlar arka planda bu izinle çalar */}
          {notificationsSupported && (
            <>
              <Text
                style={[styles.sectionTitle, styles.sectionSpacing]}
                maxFontSizeMultiplier={1.3}
              >
                BİLDİRİMLER
              </Text>
              <View style={styles.card}>
                <Pressable
                  style={({ pressed }) => [styles.option, pressed && styles.rowPressed]}
                  onPress={async () => setNotifGranted(await prepareNotifications().catch(() => false))}
                >
                  <Feather
                    name={notifGranted === true ? 'check-circle' : 'circle'}
                    size={18}
                    color={notifGranted === true ? L.success : L.borderActive}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.optionTitle} maxFontSizeMultiplier={1.3}>
                      Bildirim izni
                    </Text>
                    <Text style={styles.optionDesc} maxFontSizeMultiplier={1.3}>
                      {notifGranted === true
                        ? 'Verildi — faz alarmları ve Nefes Al dürtüleri çalışır'
                        : notifGranted === false
                          ? 'Reddedildi — sistem ayarlarından açman gerekir'
                          : 'Durumu kontrol etmek / izin vermek için dokun'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </>
          )}

          {/* Arka plan mini sayaç (yalnızca Android development build) */}
          {miniTimerSupported && (
            <>
              <Text
                style={[styles.sectionTitle, styles.sectionSpacing]}
                maxFontSizeMultiplier={1.3}
              >
                ARKA PLAN MİNİ SAYAÇ
              </Text>
              <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
                {"Sayaç çalışırken uygulamadan çıkınca bildirim panelinde canlı geri sayım gösterilir. Ekranın sol üstünde yarı saydam mini sayaç için 'üstte gösterme' izni gerekir."}
              </Text>
              <View style={styles.card}>
                <Pressable
                  style={({ pressed }) => [styles.option, pressed && styles.rowPressed]}
                  onPress={() => {
                    if (!overlayGranted) requestOverlayPermission();
                  }}
                >
                  <Feather
                    name={overlayGranted ? 'check-circle' : 'circle'}
                    size={18}
                    color={overlayGranted ? L.success : L.borderActive}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.optionTitle} maxFontSizeMultiplier={1.3}>
                      Üstte gösterme izni
                    </Text>
                    <Text style={styles.optionDesc} maxFontSizeMultiplier={1.3}>
                      {overlayGranted
                        ? 'Verildi — mini sayaç ekran üstünde görünecek'
                        : "Dokun; açılan listeden orhan-metre'yi seçip izni aç"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </>
          )}

          {/* Planlı başlangıç + nefes borcu */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
            PLANLI BAŞLANGIÇ
          </Text>
          <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
            Günün ilk seansı bu saatten geç başlarsa gecikme, sonraki Nefes Al sürelerinden
            düşülür (her nefes en fazla minimuma iner, artan sonraki nefese taşar). Odak veya
            Tekrar sırasında duraklatılan süre de aynı şekilde düşülür. Saati boş bırak = kapalı.
          </Text>
          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.3}>
                Başlangıç saati
              </Text>
              <TextInput
                style={styles.input}
                value={plannedStart}
                onChangeText={setPlannedStart}
                placeholder="09:00"
                placeholderTextColor={L.tertiary}
                maxLength={5}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.3}>
                Minimum nefes (dk)
              </Text>
              <TextInput
                style={styles.input}
                value={minBreathe}
                onChangeText={setMinBreathe}
                keyboardType="number-pad"
                maxLength={2}
                placeholder={String(MIN_BREATHE_LIMITS.min)}
                placeholderTextColor={L.tertiary}
              />
            </View>
          </View>

          {/* Faz bitiş hatırlatıcısı */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
            FAZ BİTİŞ HATIRLATICISI
          </Text>
          <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
            {"Odak veya Tekrar bitmeden seçilen süre kadar önce 'bitmeye az kaldı' bildirimi gönderilir. Nefes Al'a uygulanmaz."}
          </Text>
          <View style={styles.segment}>
            {WORK_END_REMINDER_OPTIONS.map((min, i) => (
              <Pressable
                key={min}
                style={[
                  styles.segmentItem,
                  i > 0 && styles.segmentDivider,
                  workEndReminder === min && styles.segmentItemOn,
                ]}
                onPress={() => setWorkEndReminder(min)}
              >
                <Text
                  style={[styles.segmentText, workEndReminder === min && styles.segmentTextOn]}
                  maxFontSizeMultiplier={1.2}
                >
                  {min === 0 ? 'Kapalı' : `${min} dk`}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Görünüm */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]} maxFontSizeMultiplier={1.3}>
            TAM EKRAN GÖRÜNÜMÜ
          </Text>
          <Text style={styles.sectionHint} maxFontSizeMultiplier={1.3}>
            Boyut hem ana ekranda hem tam ekran zamanlayıcıda geçerlidir. Renk otomatiktir:
            Odak gri, Tekrar mavi, Nefes Al sarı.
          </Text>
          <View style={styles.previewBox}>
            <Text
              style={[
                styles.previewTime,
                {
                  color: D.text,
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
    maxWidth: 720,
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
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
    gap: 6,
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
