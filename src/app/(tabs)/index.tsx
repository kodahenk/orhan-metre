import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { Button, HeaderIconButton, PickerSheet, ScreenHeader } from '@/features/ui/components';
import { confirmAction } from '@/features/ui/dialogs';
import { FieldRow } from '@/features/ui/compact';
import { F, L } from '@/features/ui/theme';

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

  const fitFontSize = Math.max(52, Math.min(104, width * 0.25, height * 0.15));
  const timeFontSize = fitFontSize * DISPLAY_SIZE_SCALE[settings.display.size];

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
  const lockedTaskLabel = timer.sessionTaskId ? taskPathLabel(tasks, timer.sessionTaskId) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Odak" right={<HeaderIconButton icon="maximize" label="Tam ekran" onPress={() => router.push('/timer')} />} />
      <View style={styles.today}>
        <Text style={styles.todayLabel}>BUGÜN</Text>
        <Text style={styles.todayValue}>{formatDuration(todaySeconds)} <Text style={styles.muted}>odak</Text></Text>
        <Text style={styles.todayValue}>{todayRounds} <Text style={styles.muted}>tur</Text></Text>
        <Text style={styles.todayValue}>{todayCount} <Text style={styles.muted}>oturum</Text></Text>
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.page}>
        <View style={styles.selection}>
          <FieldRow disabled={!idle} icon="folder" label="Proje" value={idle ? pendingProject?.name ?? 'Projesiz' : lockedProject?.name ?? 'Projesiz'} onPress={() => idle && setProjectPickerOpen(true)} />
          {(idle ? pendingProject : lockedProject) && <FieldRow disabled={!idle} icon="check-square" label="Görev" value={idle ? pendingTask?.title ?? 'Görev seç' : lockedTaskLabel ?? 'Görevsiz'} onPress={() => {
            if (!idle) return;
            if (projectTasks.length) setTaskPickerOpen(true);
            else if (pendingProject) router.push(`/project/${pendingProject.id}`);
          }} />}
        </View>
        <View style={styles.timerArea}>
          <View style={styles.phases}>
            {PHASE_ORDER.map((phase) => <View key={phase} style={[styles.phase, (idle ? phase === 'focus' : phase === timer.phase) && styles.phaseOn]}>
              <Text style={[styles.phaseText, (idle ? phase === 'focus' : phase === timer.phase) && styles.phaseTextOn]}>{PHASE_LABELS[phase]}</Text>
            </View>)}
          </View>
          <Text style={styles.state}>{topLabel}{!idle ? ` · ${timer.round + 1}. tur` : ''}</Text>
          <Text style={[styles.time, { fontSize: timeFontSize }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1}>{formatTime(timer.secondsLeft)}</Text>
          <Text style={styles.date}>{clockText} · {dateText}</Text>
        </View>
        <View style={styles.preset}>
          <Text style={styles.presetName}>{timer.pendingPresetName}</Text>
          <Text style={styles.presetDetail}>{timer.pendingPreset.focusMinutes} dk odak · {timer.pendingPreset.reviewMinutes} dk tekrar · {timer.pendingPreset.breatheMinutes} dk mola</Text>
          {idle && <Button label="Süreleri düzenle" variant="ghost" onPress={() => router.push(`/preset/${timer.pendingPreset.id}`)} />}
        </View>
        {idle && timer.lastSaved && <Text style={styles.saved}>{timer.lastSaved.recovered ? 'Oturum kurtarıldı' : 'Oturum kaydedildi'} · {formatDuration(timer.lastSaved.workSeconds)}</Text>}
        {idle && settings.plannedStartTime && <Text style={styles.info}>Planlı başlangıç: {settings.plannedStartTime}</Text>}
        {!idle && timer.breatheDebtAppliedMs > 0 && <Text style={styles.info}>Nefeslerden düşülen: {Math.max(1, Math.round(timer.breatheDebtAppliedMs / 60000))} dk</Text>}
        {!idle && timer.notificationsGranted === false && <Text style={styles.warning}>Arka plan alarmı için bildirim izni gerekli.</Text>}
      </ScrollView>
      <View style={styles.actions}>
        {timer.alarmActive ? <Button icon="bell-off" label="Alarmı sustur" variant="primary" onPress={timer.acknowledgeAlarm} /> : idle ?
          <Button icon="play" label="Odaklanmaya başla" variant="primary" onPress={timer.start} /> :
          <View style={styles.actionRow}>
            <View style={styles.flex}>{inBreathe ? <Button icon="play" label="Sonraki tur" variant="primary" onPress={timer.advance} /> : running ?
              <Button icon="pause" label="Duraklat" variant="primary" onPress={timer.pause} /> : <Button icon="play" label="Devam et" variant="primary" onPress={timer.resume} />}</View>
            <Button icon="square" label="Bitir" onPress={confirmFinish} />
          </View>}
      </View>
      <PickerSheet visible={projectPickerOpen} title="Proje seç" options={projectOptions} selectedKey={timer.pendingProjectId ?? NO_PROJECT_KEY} onSelect={selectProject} onClose={() => setProjectPickerOpen(false)} />
      <PickerSheet visible={taskPickerOpen} title="Görev seç" options={taskOptions} selectedKey={pendingTask?.id ?? NO_TASK_KEY} onSelect={selectTask} onClose={() => setTaskPickerOpen(false)} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: L.surface },
  flex: { flex: 1, minWidth: 0 },
  today: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.hairline },
  todayLabel: { fontFamily: F.uiMed, fontSize: 10, letterSpacing: 0.5, color: L.tertiary },
  todayValue: { fontFamily: F.uiSemi, fontSize: 12, color: L.ink },
  muted: { fontFamily: F.ui, color: L.tertiary },
  page: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  selection: { paddingTop: 4 },
  timerArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 8, minHeight: 220 },
  phases: { flexDirection: 'row', width: '100%', maxWidth: 340, borderBottomWidth: 1, borderBottomColor: L.hairline, marginBottom: 12 },
  phase: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  phaseOn: { borderBottomColor: L.accent },
  phaseText: { fontFamily: F.uiMed, fontSize: 12, color: L.tertiary },
  phaseTextOn: { color: L.accent },
  state: { fontFamily: F.uiMed, fontSize: 12, color: L.tertiary },
  time: { fontFamily: F.mono, color: L.ink, fontVariant: ['tabular-nums'], letterSpacing: -3, maxWidth: '100%' },
  date: { fontFamily: F.ui, fontSize: 12, color: L.tertiary, textAlign: 'center' },
  preset: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  presetName: { fontFamily: F.uiMed, color: L.ink2, fontSize: 12 },
  presetDetail: { fontFamily: F.ui, fontSize: 11, color: L.tertiary, textAlign: 'center' },
  actions: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.hairline },
  actionRow: { flexDirection: 'row', gap: 8 },
  saved: { fontFamily: F.uiMed, color: L.success, textAlign: 'center', fontSize: 12, paddingVertical: 6 },
  info: { fontFamily: F.ui, color: L.tertiary, textAlign: 'center', fontSize: 12, paddingVertical: 4 },
  warning: { fontFamily: F.ui, color: L.warning, textAlign: 'center', fontSize: 12, paddingVertical: 4 },
});
