import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { taskPathLabel, useProjects } from '@/features/projects/projects-context';
import { formatClock, formatDate, formatDuration, formatTime } from '@/features/timer/format';
import { DISPLAY_SIZE_SCALE, PHASE_LABELS, PHASE_ORDER } from '@/features/timer/settings';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import {
  Button,
  HeaderIconButton,
  PickerSheet,
  ScreenHeader,
  type PickerOption,
} from '@/features/ui/components';
import { F, L } from '@/features/ui/theme';

const NO_PROJECT_KEY = '__none__';
const NO_TASK_KEY = '__no_task__';

export default function TimerTabScreen() {
  const router = useRouter();
  const timer = useTimer();
  const { settings } = useTimerSettings();
  const { projects, tasks } = useProjects();
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
    return PHASE_LABELS[timer.phase];
  })();

  // Proje seçici: üst projeler + altında girintili alt projeler + "Projesiz".
  const projectOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: NO_PROJECT_KEY, label: 'Projesiz' }];
    for (const parent of projects.filter((p) => !p.parentId)) {
      options.push({ key: parent.id, label: parent.name, color: parent.color });
      for (const child of projects.filter((p) => p.parentId === parent.id)) {
        options.push({ key: child.id, label: child.name, color: child.color, indent: true });
      }
    }
    return options;
  }, [projects]);

  const findProject = (id: string | null) => projects.find((p) => p.id === id) ?? null;
  const pendingProject = findProject(timer.pendingProjectId);
  const lockedProject = findProject(timer.sessionProjectId);
  const lastSavedProject = timer.lastSaved ? findProject(timer.lastSaved.projectId) : null;

  // Görev seçici: seçili projenin tamamlanmamış görevleri; alt görevler girintili.
  const projectTasks = useMemo(
    () =>
      pendingProject
        ? tasks
            .filter((t) => t.projectId === pendingProject.id && !t.done)
            .sort((a, b) => a.orderIndex - b.orderIndex)
        : [],
    [tasks, pendingProject],
  );
  const taskOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: NO_TASK_KEY, label: 'Görevsiz' }];
    const ids = new Set(projectTasks.map((t) => t.id));
    const tops = projectTasks.filter((t) => !t.parentTaskId || !ids.has(t.parentTaskId));
    for (const top of tops) {
      options.push({ key: top.id, label: top.title });
      const stack = [top.id];
      while (stack.length > 0) {
        const parentId = stack.pop()!;
        for (const child of projectTasks.filter((t) => t.parentTaskId === parentId)) {
          options.push({ key: child.id, label: child.title, indent: true });
          stack.push(child.id);
        }
      }
    }
    return options;
  }, [projectTasks]);

  const pendingTask = projectTasks.find((t) => t.id === timer.pendingTaskId) ?? null;
  const lockedTaskLabel = timer.sessionTaskId ? taskPathLabel(tasks, timer.sessionTaskId) : null;
  const lastSavedTaskLabel = timer.lastSaved?.taskId
    ? taskPathLabel(tasks, timer.lastSaved.taskId)
    : null;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Zamanlayıcı"
          right={<HeaderIconButton icon="maximize" onPress={() => router.push('/timer')} />}
        />

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
                <Text style={styles.lockedProjectText} maxFontSizeMultiplier={1.2}>
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
                <View
                  key={p}
                  style={[
                    styles.dot,
                    p === 'breathe' && styles.dotBreathe,
                    !idle && p === timer.phase && styles.dotActive,
                  ]}
                />
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
                    Kaydedildi: {lastSavedProject ? lastSavedProject.name : 'Projesiz'}
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
                  <Text style={styles.projectChipText} maxFontSizeMultiplier={1.2}>
                    {pendingProject ? pendingProject.name : 'Projesiz'}
                  </Text>
                  <Feather name="chevron-down" size={15} color={L.tertiary} />
                </Pressable>
                {/* Görev seçimi — projenin açık görevi varsa */}
                {pendingProject && projectTasks.length > 0 && (
                  <Pressable
                    style={({ pressed }) => [styles.projectChip, pressed && styles.chipPressed]}
                    onPress={() => setTaskPickerOpen(true)}
                  >
                    <Feather name="check-square" size={14} color={L.ink2} />
                    <Text style={styles.projectChipText} maxFontSizeMultiplier={1.2}>
                      {pendingTask ? pendingTask.title : 'Görevsiz'}
                    </Text>
                    <Feather name="chevron-down" size={15} color={L.tertiary} />
                  </Pressable>
                )}
                <Text style={styles.presetCaption} maxFontSizeMultiplier={1.2}>
                  {timer.pendingPresetName} · {timer.pendingPreset.focusMinutes}+
                  {timer.pendingPreset.reviewMinutes}+{timer.pendingPreset.breatheMinutes} dk
                </Text>
                <Button icon="play" label="Başlat" onPress={timer.start} variant="primary" />
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
                <Button icon="square" label="Bitir" onPress={timer.finish} />
              </View>
            )}
          </View>
        </Pressable>
      </SafeAreaView>

      <PickerSheet
        visible={projectPickerOpen}
        title="Proje seç"
        options={projectOptions}
        selectedKey={timer.pendingProjectId ?? NO_PROJECT_KEY}
        onSelect={(key) => timer.setPendingProject(key === NO_PROJECT_KEY ? null : key)}
        onClose={() => setProjectPickerOpen(false)}
      />
      <PickerSheet
        visible={taskPickerOpen}
        title="Görev seç"
        options={taskOptions}
        selectedKey={pendingTask?.id ?? NO_TASK_KEY}
        onSelect={(key) => timer.setPendingTask(key === NO_TASK_KEY ? null : key)}
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
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockedProjectText: {
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
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    fontFamily: F.monoMed,
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
    alignItems: 'center',
    gap: 12,
    minHeight: 132,
    justifyContent: 'center',
  },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 12,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: 4,
  },
  chipPressed: {
    backgroundColor: L.pressed,
  },
  projectChipText: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 13,
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
    gap: 12,
  },
});
