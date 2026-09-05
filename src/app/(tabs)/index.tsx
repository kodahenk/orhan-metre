import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessions } from '@/features/sessions/sessions-context';
import { taskPathLabel, useProjects } from '@/features/projects/projects-context';
import { formatClock, formatDate, formatDuration, formatTime, startOfToday } from '@/features/timer/format';
import { DISPLAY_SIZE_SCALE, PHASE_LABELS, PHASE_ORDER } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import {
  NO_PROJECT_KEY,
  NO_TASK_KEY,
  useSelectionPickers,
} from '@/features/timer/use-selection-pickers';
import { Button, HeaderIconButton, PickerSheet, ScreenHeader, ScreenIntro } from '@/features/ui/components';
import { confirmAction } from '@/features/ui/dialogs';
import { F, L, R } from '@/features/ui/theme';

export default function TimerTabScreen() {
  const router = useRouter();
  const timer = useTimer();
  const { settings } = useTimerSettings();
  const { projects, tasks } = useProjects();
  const { sessions } = useSessions();
  const todayStart = startOfToday().getTime();
  const { todaySeconds, todayRounds, todayCount } = useMemo(() => {
    let todaySeconds = 0;
    let todayRounds = 0;
    let todayCount = 0;
    for (const session of sessions) {
      if (session.startedAt < todayStart) continue;
      todaySeconds += session.workSeconds;
      todayRounds += session.completedRounds;
      todayCount += 1;
    }
    return { todaySeconds, todayRounds, todayCount };
  }, [sessions, todayStart]);
  const { width, height } = useWindowDimensions();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);

  const idle = timer.status === 'idle';
  const running = timer.status === 'running';
  const waiting = timer.status === 'waiting';
  // Nefes Al: hem akarken hem beklerken sonraki tura geçilebilir.
  const inBreathe = (running && timer.phase === 'breathe') || waiting;

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

  const topLabel = (() => {
    if (idle) return 'Hazır';
    if (waiting) return 'Nefes bitti';
    if (timer.status === 'paused') return `${PHASE_LABELS[timer.phase]} · duraklatıldı`;
    return PHASE_LABELS[timer.phase];
  })();

  const { projectOptions, taskOptions, pendingProject, pendingTask, projectTasks, selectProject, selectTask } =
    useSelectionPickers();

  // Bitir geri alınamaz (oturum kaydedilir) — onay istenir. Odak fazında
  // bitirmek o turu kaybettireceği için ayrıca uyarılır.
  const confirmFinish = () => {
    const losesRound = timer.status !== 'idle' && timer.phase === 'focus';
    confirmAction({
      title: 'Çalışmayı bitir',
      message: losesRound
        ? `Odak fazındasın: bu tur sayılmayacak. ${timer.completedRounds} tamamlanmış tur kaydedilecek.`
        : `${timer.completedRounds} tur kaydedilecek.`,
      confirmLabel: 'Bitir',
      onConfirm: timer.finish,
    });
  };

  const findProject = (id: string | null) => projects.find((p) => p.id === id) ?? null;
  const lockedProject = findProject(timer.sessionProjectId);
  const lastSavedProject = timer.lastSaved ? findProject(timer.lastSaved.projectId) : null;

  const lockedTaskLabel = timer.sessionTaskId ? taskPathLabel(tasks, timer.sessionTaskId) : null;
  const lastSavedTaskLabel = timer.lastSaved?.taskId
    ? taskPathLabel(tasks, timer.lastSaved.taskId)
    : null;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader
          title="Zamanlayıcı"
          subtitle="Bir seferde tek işe odaklan"
          right={<HeaderIconButton icon="maximize" onPress={() => router.push('/timer')} />}
        />

        <ScrollView contentContainerStyle={styles.page}>
          <ScreenIntro eyebrow="ODAK ZAMANI" title={idle ? 'Şimdi, kendine zaman ayır.' : 'Ritmini koru.'} description={idle ? 'Bir proje seç, dikkatini topla ve ilk adımı at.' : 'Küçük adımlar birikir. Şu an yalnızca yaptığın işe odaklan.'} />
        <Pressable
          style={styles.body}
          onPress={() => timer.alarmActive && timer.acknowledgeAlarm()}
          android_disableSound
        >
          <View style={styles.topGroup}>
            <Text style={styles.phaseLabel} maxFontSizeMultiplier={1.3}>
              {topLabel}
            </Text>
            {/* Oturumda kilitli proje + görev etiketi */}
            {!idle && lockedProject && (
              <View style={styles.lockedProjectRow}>
                <View style={[styles.projectDot, { backgroundColor: lockedProject.color }]} />
                <Text numberOfLines={2} style={styles.lockedProjectText} maxFontSizeMultiplier={1.2}>
                  {lockedProject.name}
                </Text>
              </View>
            )}
            {!idle && lockedTaskLabel && (
              <Text style={styles.lockedTaskText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {lockedTaskLabel}
              </Text>
            )}
            {/* Turdaki üç faz: hangisinde olunduğu tek bakışta görünür. */}
            <View style={styles.dots}>
              {PHASE_ORDER.map((p) => (
                <View key={p} style={[styles.phaseChip, (idle ? p === 'focus' : p === timer.phase) && styles.phaseChipActive]}>
                  <View style={[styles.dot, (idle ? p === 'focus' : p === timer.phase) && styles.dotActive]} />
                  <Text style={[styles.phaseChipText, (idle ? p === 'focus' : p === timer.phase) && { color: L.accent }]}>{PHASE_LABELS[p]}</Text>
                </View>
              ))}
            </View>
            {!idle && (
              <Text style={styles.roundText} maxFontSizeMultiplier={1.2}>
                {timer.round + 1}. tur · {timer.completedRounds} tamamlandı
              </Text>
            )}
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
            {/* Boşta planlı başlangıç; oturumda nefeslerden düşülen borç ve
                bildirim izni uyarısı — tam ekranla aynı bilgiler. */}
            {idle && settings.plannedStartTime && (
              <Text style={styles.infoLine} maxFontSizeMultiplier={1.2}>
                Planlı başlangıç: {settings.plannedStartTime}
              </Text>
            )}
            {!idle && timer.breatheDebtAppliedMs > 0 && (
              <Text style={styles.infoLine} maxFontSizeMultiplier={1.2}>
                Nefeslerden düşüldü: {Math.max(1, Math.round(timer.breatheDebtAppliedMs / 60_000))} dk
              </Text>
            )}
            {!idle && timer.notificationsGranted === false && (
              <Text style={styles.warnLine} maxFontSizeMultiplier={1.2}>
                Bildirim izni yok — arka planda alarm çalmaz
              </Text>
            )}
            {timer.alarmActive && (
              <View style={styles.hintRow}>
                <Feather name="bell-off" size={15} color={L.warning} />
                <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
                  Susturmak için dokun
                </Text>
              </View>
            )}

            {idle && (
              <>
                {timer.lastSaved && (
                  <Text style={styles.savedLine} maxFontSizeMultiplier={1.2}>
                    {timer.lastSaved.recovered ? 'Kurtarıldı' : 'Kaydedildi'}:{' '}
                    {lastSavedProject ? lastSavedProject.name : 'Projesiz'}
                    {lastSavedTaskLabel ? ` · ${lastSavedTaskLabel}` : ''} ·{' '}
                    {formatDuration(timer.lastSaved.workSeconds)} ·{' '}
                    {timer.lastSaved.completedRounds} tur
                  </Text>
                )}
                {/* Proje seçimi — oturum bu projeye yazılır */}
                <Pressable
                  style={({ pressed }) => [styles.projectChip, pressed && styles.chipPressed]}
                  onPress={() => setProjectPickerOpen(true)}
                >
                  {pendingProject ? (
                    <View style={[styles.projectDot, { backgroundColor: pendingProject.color }]} />
                  ) : (
                    <Feather name="folder" size={14} color={L.ink2} />
                  )}
                  <Text numberOfLines={2} style={styles.projectChipText} maxFontSizeMultiplier={1.2}>
                    {pendingProject ? pendingProject.name : 'Proje seç (isteğe bağlı)'}
                  </Text>
                  <Feather name="chevron-down" size={15} color={L.tertiary} />
                </Pressable>
                {/* Görev seçimi. Proje seçiliyken HER ZAMAN görünür: açık görev
                    yoksa görev eklemeye yönlendirir, böylece 'göreve çalışma'
                    akışı ana ekranda gizli kalmaz. */}
                {pendingProject &&
                  (projectTasks.length > 0 ? (
                    <Pressable
                      style={({ pressed }) => [styles.projectChip, pressed && styles.chipPressed]}
                      onPress={() => setTaskPickerOpen(true)}
                    >
                      <Feather name="check-square" size={14} color={L.ink2} />
                      <Text numberOfLines={2} style={styles.projectChipText} maxFontSizeMultiplier={1.2}>
                        {pendingTask ? pendingTask.title : 'Görevsiz'}
                      </Text>
                      <Feather name="chevron-down" size={15} color={L.tertiary} />
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [styles.projectChip, pressed && styles.chipPressed]}
                      onPress={() => router.push(`/project/${pendingProject.id}`)}
                    >
                      <Feather name="plus-circle" size={14} color={L.tertiary} />
                      <Text style={[styles.projectChipText, styles.chipMuted]} maxFontSizeMultiplier={1.2}>
                        Görev ekle
                      </Text>
                    </Pressable>
                  ))}
                <Text style={styles.presetCaption} maxFontSizeMultiplier={1.2}>
                  {timer.pendingPresetName} · {timer.pendingPreset.focusMinutes}+
                  {timer.pendingPreset.reviewMinutes}+{timer.pendingPreset.breatheMinutes} dk
                </Text>
                <Button icon="play" label="Odaklanmaya başla" onPress={timer.start} variant="primary" />
              </>
            )}

            {/* Nefes Al: sonraki tura geç. Odak/Tekrar: duraklat. */}
            {!idle && !timer.alarmActive && (
              <View style={styles.buttonRow}>
                {inBreathe && (
                  <Button
                    icon="play"
                    label="Sonraki tur"
                    onPress={timer.advance}
                    variant="primary"
                  />
                )}
                {running && !inBreathe && (
                  <Button icon="pause" label="Duraklat" onPress={timer.pause} />
                )}
                {timer.status === 'paused' && (
                  <Button icon="play" label="Devam" onPress={timer.resume} variant="primary" />
                )}
                <Button icon="square" label="Bitir" onPress={confirmFinish} />
              </View>
            )}
          </View>
        </Pressable>
          <View style={styles.summary}>
            {[{ icon: 'clock' as const, value: formatDuration(todaySeconds), label: 'Bugünkü odak' }, { icon: 'check-circle' as const, value: String(todayRounds), label: 'Tamamlanan tur' }, { icon: 'layers' as const, value: String(todayCount), label: 'Oturum' }].map((item) => <View key={item.label} style={styles.summaryItem}>
              <Feather name={item.icon} size={17} color={L.accent} />
              <Text style={styles.summaryValue}>{item.value}</Text>
              <Text style={styles.summaryLabel}>{item.label}</Text>
            </View>)}
          </View>
        </ScrollView>
      </SafeAreaView>

      <PickerSheet
        visible={projectPickerOpen}
        title="Proje seç"
        options={projectOptions}
        selectedKey={timer.pendingProjectId ?? NO_PROJECT_KEY}
        onSelect={selectProject}
        onClose={() => setProjectPickerOpen(false)}
      />
      <PickerSheet
        visible={taskPickerOpen}
        title="Görev seç"
        options={taskOptions}
        selectedKey={pendingTask?.id ?? NO_TASK_KEY}
        onSelect={selectTask}
        onClose={() => setTaskPickerOpen(false)}
      />
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
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: 20 },
  phaseChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: R.md, backgroundColor: L.canvas },
  phaseChipActive: { backgroundColor: L.selected },
  phaseChipText: { fontFamily: F.uiMed, fontSize: 11, color: L.tertiary },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: { flex: 1, minWidth: 120, alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 6, borderRadius: R.lg, backgroundColor: L.surface, borderWidth: 1, borderColor: L.hairline },
  summaryValue: { textAlign: 'center', flexShrink: 1, fontFamily: F.uiSemi, fontSize: 20, color: L.ink },
  summaryLabel: { fontFamily: F.ui, fontSize: 11, color: L.tertiary, textAlign: 'center' },
  body: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: 24,
    gap: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  topGroup: {
    alignItems: 'center',
    gap: 12,
  },
  phaseLabel: {
    color: L.ink2,
    fontFamily: F.uiSemi,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  lockedProjectRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockedProjectText: {
    flexShrink: 1,
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  lockedTaskText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    maxWidth: 280,
  },
  roundText: {
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  dots: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: R.md,
    backgroundColor: L.hairline,
  },
  dotBreathe: {
    borderWidth: 1,
    borderColor: L.borderActive,
    backgroundColor: L.surface,
  },
  dotActive: {
    backgroundColor: L.accent,
    borderWidth: 0,
  },
  timeGroup: {
    alignItems: 'center',
    gap: 4,
  },
  time: {
    color: L.ink,
    fontFamily: F.mono,
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
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    minHeight: 132,
    justifyContent: 'center',
  },
  projectChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  chipPressed: {
    backgroundColor: L.pressed,
  },
  projectChipText: {
    flexShrink: 1,
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  chipMuted: {
    color: L.tertiary,
  },
  projectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  presetCaption: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  savedLine: {
    color: L.success,
    fontFamily: F.uiMed,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  infoLine: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  warnLine: {
    color: L.warning,
    fontFamily: F.uiMed,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
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
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
});
