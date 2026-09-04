import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  GOAL_PERIOD_LABELS,
  useProjects,
  type Goal,
  type GoalPeriod,
} from '@/features/projects/projects-context';
import { useSessions } from '@/features/sessions/sessions-context';
import { addDays, dateKey, formatDuration } from '@/features/timer/format';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import { Checkbox, PickerSheet, type PickerOption } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

const GLOBAL_PRESET_KEY = '__global__';

function dueLabel(due: string | null) {
  if (!due) return null;
  const today = dateKey(new Date());
  const tomorrow = dateKey(addDays(new Date(), 1));
  if (due === today) return 'Bugün';
  if (due === tomorrow) return 'Yarın';
  const [, m, d] = due.split('-');
  return `${Number(d)}.${Number(m)}`;
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    projects,
    tasks,
    deleteProject,
    addProject,
    setProjectGoal,
    setProjectPreset,
    addTask,
    updateTask,
  } = useProjects();
  const { sessions } = useSessions();
  const { presets, settings } = useTimerSettings();
  const timer = useTimer();

  const project = projects.find((p) => p.id === id);
  const parent = project?.parentId ? projects.find((p) => p.id === project.parentId) : null;
  const children = useMemo(
    () => projects.filter((p) => p.parentId === id).sort((a, b) => a.orderIndex - b.orderIndex),
    [projects, id],
  );

  const [newTask, setNewTask] = useState('');
  const [newChild, setNewChild] = useState('');
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalMetric, setGoalMetric] = useState<Goal['metric']>('hours');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('weekly');

  // Tüm zamanlar toplam süre (üst proje = kendi + altları).
  const totalSeconds = useMemo(() => {
    if (!project) return 0;
    const ids = new Set([project.id, ...children.map((c) => c.id)]);
    return sessions
      .filter((s) => s.projectId && ids.has(s.projectId))
      .reduce((sum, s) => sum + s.workSeconds, 0);
  }, [sessions, project, children]);

  const topTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.projectId === id && !t.parentTaskId)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [tasks, id],
  );
  const childTaskCount = (taskId: string) => {
    const kids = tasks.filter((t) => t.parentTaskId === taskId);
    return { done: kids.filter((t) => t.done).length, total: kids.length };
  };

  if (!project) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Text style={styles.emptyText}>Proje bulunamadı.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const presetName = project.defaultPresetId
    ? (presets.find((p) => p.id === project.defaultPresetId)?.name ?? 'Varsayılan (genel)')
    : 'Varsayılan (genel)';

  const presetOptions: PickerOption[] = [
    { key: GLOBAL_PRESET_KEY, label: 'Varsayılan (genel)', caption: presets.find((p) => p.id === settings.activePresetId)?.name },
    ...presets.map((p) => ({
      key: p.id,
      label: p.name,
      caption: `Odak ${p.focusMinutes} · Tekrar ${p.reviewMinutes} · Nefes ${p.breatheMinutes} dk`,
    })),
  ];

  const openGoalModal = () => {
    setGoalMetric(project.goal?.metric ?? 'hours');
    setGoalTarget(project.goal ? String(project.goal.target) : '');
    setGoalPeriod(project.goal?.period ?? 'weekly');
    setGoalModalOpen(true);
  };

  const saveGoal = () => {
    const target = Number(goalTarget.replace(',', '.'));
    if (Number.isFinite(target) && target > 0) {
      setProjectGoal(project.id, { metric: goalMetric, target, period: goalPeriod });
    }
    setGoalModalOpen(false);
  };

  const confirmDeleteProject = () => {
    Alert.alert(
      'Projeyi sil',
      `"${project.name}"${children.length > 0 ? ', alt projeleri' : ''} ve tüm görevleri silinecek. Zaman kayıtları Rapor'da kalır.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            deleteProject(project.id);
            router.back();
          },
        },
      ],
    );
  };

  const startTimerHere = () => {
    timer.setPendingProject(project.id);
    router.push('/');
  };

  const submitTask = () => {
    const title = newTask.trim();
    if (!title) return;
    addTask(project.id, null, title);
    setNewTask('');
  };

  const submitChild = () => {
    const name = newChild.trim();
    if (!name) return;
    addProject(name, project.id);
    setNewChild('');
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Başlık */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          >
            <Feather name="chevron-left" size={24} color={L.ink} />
          </Pressable>
          <View style={styles.headerCenter}>
            {parent && (
              <Pressable onPress={() => router.push(`/project/${parent.id}`)} hitSlop={6}>
                <Text style={styles.breadcrumb} maxFontSizeMultiplier={1.2}>
                  ‹ {parent.name}
                </Text>
              </Pressable>
            )}
            <View style={styles.titleRow}>
              <View style={[styles.colorDot, { backgroundColor: project.color }]} />
              <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {project.name}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={confirmDeleteProject}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          >
            <Feather name="trash-2" size={20} color={L.ink2} />
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
            {/* Meta çipleri */}
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Feather name="clock" size={12} color={L.ink2} />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                  Toplam {formatDuration(totalSeconds)}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                onPress={() => setPresetPickerOpen(true)}
              >
                <Feather name="play" size={12} color={L.ink2} />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                  {presetName}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  project.goal && styles.chipAccent,
                  pressed && styles.chipPressed,
                ]}
                onPress={openGoalModal}
              >
                <Feather
                  name="target"
                  size={12}
                  color={project.goal ? L.accent : L.ink2}
                />
                <Text
                  style={[styles.chipText, project.goal && styles.chipTextAccent]}
                  maxFontSizeMultiplier={1.2}
                >
                  {project.goal
                    ? `${GOAL_PERIOD_LABELS[project.goal.period]} ${
                        project.goal.metric === 'hours'
                          ? `${project.goal.target}s`
                          : `${project.goal.target} seans`
                      }`
                    : 'Hedef ekle'}
                </Text>
              </Pressable>
            </View>

            {/* Zamanlayıcı başlat */}
            <Pressable
              style={({ pressed }) => [styles.timerButton, pressed && styles.timerButtonPressed]}
              onPress={startTimerHere}
            >
              <Feather name="clock" size={16} color="#FFFFFF" />
              <Text style={styles.timerButtonText} maxFontSizeMultiplier={1.2}>
                Bu projede çalış
              </Text>
            </Pressable>

            {/* Notlar */}
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              NOTLAR
            </Text>
            <Pressable
              style={({ pressed }) => [styles.noteCard, pressed && styles.rowPressed]}
              onPress={() => router.push(`/project/${project.id}/notes`)}
            >
              <Feather name="file-text" size={16} color={L.tertiary} />
              <Text
                style={[styles.notePreview, !project.noteBody && styles.notePlaceholder]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}
              >
                {project.noteBody ? project.noteBody : 'Not ekle — dokümantasyon, kaynaklar, fikirler…'}
              </Text>
              <Feather name="chevron-right" size={18} color={L.tertiary} />
            </Pressable>

            {/* Alt projeler (yalnızca üst düzey projede) */}
            {!project.parentId && (
              <>
                <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
                  ALT PROJELER
                </Text>
                {children.length > 0 && (
                  <View style={styles.card}>
                    {children.map((child, i) => {
                      const childSeconds = sessions
                        .filter((s) => s.projectId === child.id)
                        .reduce((sum, s) => sum + s.workSeconds, 0);
                      return (
                        <Pressable
                          key={child.id}
                          style={({ pressed }) => [
                            styles.childRow,
                            i > 0 && styles.rowSeparator,
                            pressed && styles.rowPressed,
                          ]}
                          onPress={() => router.push(`/project/${child.id}`)}
                        >
                          <View style={[styles.colorDot, { backgroundColor: child.color }]} />
                          <Text style={styles.childName} maxFontSizeMultiplier={1.3}>
                            {child.name}
                          </Text>
                          {childSeconds > 0 && (
                            <Text style={styles.childMeta} maxFontSizeMultiplier={1.2}>
                              {formatDuration(childSeconds)}
                            </Text>
                          )}
                          <Feather name="chevron-right" size={18} color={L.tertiary} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={newChild}
                    onChangeText={setNewChild}
                    placeholder="Alt proje ekle (ör. Dökümantasyon)"
                    placeholderTextColor={L.tertiary}
                    onSubmitEditing={submitChild}
                    returnKeyType="done"
                    maxLength={40}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.addButton,
                      styles.addButtonSmall,
                      pressed && styles.addButtonPressed,
                    ]}
                    onPress={submitChild}
                  >
                    <Feather name="plus" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              </>
            )}

            {/* Görevler */}
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              GÖREVLER
            </Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newTask}
                onChangeText={setNewTask}
                placeholder="Yeni görev"
                placeholderTextColor={L.tertiary}
                onSubmitEditing={submitTask}
                returnKeyType="done"
                maxLength={80}
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                onPress={submitTask}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {topTasks.length === 0 && (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Henüz görev yok.
              </Text>
            )}

            {topTasks.length > 0 && (
              <View style={styles.card}>
                {topTasks.map((task, i) => {
                  const due = dueLabel(task.dueDate);
                  const kids = childTaskCount(task.id);
                  return (
                    <View
                      key={task.id}
                      style={[styles.taskRow, i > 0 && styles.rowSeparator]}
                    >
                      <Checkbox
                        checked={task.done}
                        onPress={() => updateTask(task.id, { done: !task.done })}
                      />
                      <Pressable
                        style={styles.taskBody}
                        onPress={() => router.push(`/task/${task.id}`)}
                      >
                        <Text
                          style={[styles.taskTitle, task.done && styles.taskTitleDone]}
                          maxFontSizeMultiplier={1.3}
                        >
                          {task.title}
                        </Text>
                        {!!task.note && (
                          <Text
                            style={styles.taskDesc}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.2}
                          >
                            {task.note}
                          </Text>
                        )}
                        {(due || kids.total > 0) && (
                          <View style={styles.taskMetaRow}>
                            {due && (
                              <View style={styles.dueBadge}>
                                <Feather name="calendar" size={11} color={L.accent} />
                                <Text style={styles.dueText} maxFontSizeMultiplier={1.2}>
                                  {due}
                                </Text>
                              </View>
                            )}
                            {kids.total > 0 && (
                              <Text style={styles.taskMeta} maxFontSizeMultiplier={1.2}>
                                {kids.done}/{kids.total} alt görev
                              </Text>
                            )}
                          </View>
                        )}
                      </Pressable>
                      <Feather name="chevron-right" size={18} color={L.tertiary} />
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Önayar seçici */}
      <PickerSheet
        visible={presetPickerOpen}
        title="Zamanlayıcı önayarı"
        options={presetOptions}
        selectedKey={project.defaultPresetId ?? GLOBAL_PRESET_KEY}
        onSelect={(key) =>
          setProjectPreset(project.id, key === GLOBAL_PRESET_KEY ? null : key)
        }
        onClose={() => setPresetPickerOpen(false)}
      />

      {/* Hedef düzenleyici */}
      <Modal
        visible={goalModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setGoalModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle} maxFontSizeMultiplier={1.2}>
              ÇALIŞMA HEDEFİ
            </Text>

            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.2}>
              Ölçüt
            </Text>
            <View style={styles.segment}>
              {(
                [
                  { key: 'hours', label: 'Saat' },
                  { key: 'sessions', label: 'Seans' },
                ] as const
              ).map((opt, i) => (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.segmentItem,
                    i > 0 && styles.segmentDivider,
                    goalMetric === opt.key && styles.segmentItemOn,
                  ]}
                  onPress={() => setGoalMetric(opt.key)}
                >
                  <Text
                    style={[styles.segmentText, goalMetric === opt.key && styles.segmentTextOn]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.2}>
              Hedef ({goalMetric === 'hours' ? 'saat' : 'seans sayısı'})
            </Text>
            <TextInput
              style={styles.input}
              value={goalTarget}
              onChangeText={setGoalTarget}
              keyboardType="decimal-pad"
              placeholder={goalMetric === 'hours' ? 'ör. 20' : 'ör. 12'}
              placeholderTextColor={L.tertiary}
              maxLength={6}
            />

            <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.2}>
              Dönem
            </Text>
            <View style={styles.segment}>
              {(Object.keys(GOAL_PERIOD_LABELS) as GoalPeriod[]).map((period, i) => (
                <Pressable
                  key={period}
                  style={[
                    styles.segmentItem,
                    i > 0 && styles.segmentDivider,
                    goalPeriod === period && styles.segmentItemOn,
                  ]}
                  onPress={() => setGoalPeriod(period)}
                >
                  <Text
                    style={[styles.segmentText, goalPeriod === period && styles.segmentTextOn]}
                    maxFontSizeMultiplier={1.1}
                  >
                    {GOAL_PERIOD_LABELS[period]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalButtons}>
              {project.goal && (
                <Pressable
                  style={({ pressed }) => [styles.modalRemove, pressed && styles.rowPressed]}
                  onPress={() => {
                    setProjectGoal(project.id, null);
                    setGoalModalOpen(false);
                  }}
                >
                  <Text style={styles.modalRemoveText} maxFontSizeMultiplier={1.2}>
                    Hedefi kaldır
                  </Text>
                </Pressable>
              )}
              <View style={styles.flex} />
              <Pressable
                style={({ pressed }) => [styles.modalSave, pressed && styles.timerButtonPressed]}
                onPress={saveGoal}
              >
                <Text style={styles.modalSaveText} maxFontSizeMultiplier={1.2}>
                  Kaydet
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingHorizontal: 8,
    minHeight: 56,
    backgroundColor: L.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.hairline,
    gap: 4,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
  },
  headerButtonPressed: {
    backgroundColor: L.pressed,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  breadcrumb: {
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 17,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  chipAccent: {
    borderColor: L.accent,
    backgroundColor: L.selected,
  },
  chipPressed: {
    backgroundColor: L.pressed,
  },
  chipText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  chipTextAccent: {
    color: L.accent,
  },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    backgroundColor: L.accent,
    borderRadius: R.md,
  },
  timerButtonPressed: {
    backgroundColor: L.accentPressed,
  },
  timerButtonText: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
    fontSize: 14,
  },
  sectionTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 8,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  notePreview: {
    flex: 1,
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  notePlaceholder: {
    color: L.tertiary,
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
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    minHeight: 42,
    paddingVertical: 6,
  },
  childName: {
    flex: 1,
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  childMeta: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 42,
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 15,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
  },
  inputSmall: {
    height: 36,
    fontSize: 13,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: R.md,
    backgroundColor: L.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonSmall: {
    width: 36,
    height: 36,
  },
  addButtonPressed: {
    backgroundColor: L.accentPressed,
  },
  emptyText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    minHeight: 42,
    paddingVertical: 6,
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  taskDesc: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 1,
  },
  taskTitleDone: {
    color: L.tertiary,
    textDecorationLine: 'line-through',
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  taskMeta: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 12,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueText: {
    color: L.accent,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: L.surface,
    borderRadius: R.lg,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 13,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  fieldLabel: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
    marginTop: 6,
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
    fontSize: 12,
  },
  segmentTextOn: {
    color: L.accent,
    fontFamily: F.uiSemi,
  },
  modalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  modalRemove: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: R.md,
  },
  modalRemoveText: {
    color: L.danger,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  modalSave: {
    backgroundColor: L.accent,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
    fontSize: 14,
  },
});
