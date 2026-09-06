import { DateSheet } from '@/features/ui/date-sheet';
import { Pagination, TaskFilters, useTaskCollection } from '@/features/ui/collection';
import { FormScrollView } from '@/features/ui/form-scroll-view';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects, type Project, type Task } from '@/features/projects/projects-context';
import {
  addDays,
  dateKey,
  formatDate,
  MONTHS,
  parseDateKey,
  startOfWeek,
  WEEKDAYS_SHORT,
} from '@/features/timer/format';
import {
  Button,
  EmptyState,
  HeaderIconButton,
  Checkbox,
  PickerSheet,
  ScreenHeader,
  type PickerOption,
} from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

type Mode = 'gun' | 'hafta' | 'ay';

const MODES: { key: Mode; label: string }[] = [
  { key: 'gun', label: 'Gün' },
  { key: 'hafta', label: 'Hafta' },
  { key: 'ay', label: 'Ay' },
];

type DatedTask = { project: Project; task: Task };

export default function CalendarScreen() {
  const router = useRouter();
  const { projects, tasks, addTask, updateTask } = useProjects();
  const [mode, setMode] = useState<Mode>('hafta');
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const [newTask, setNewTask] = useState('');
  // Hızlı eklemenin hedef projesi: varsayılan olarak sıradaki ilk üst proje.
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  // Takvimden görevin gününü değiştirme (satıra basılı tut).
  const [dateTaskId, setDateTaskId] = useState<string | null>(null);

  const selected = parseDateKey(selectedKey);
  const todayKey = dateKey(new Date());

  // Tarihli görevler: 'YYYY-MM-DD' → görev listesi (kontrol maddeleri ayrı görev değildir).
  const tasksByDate = useMemo(() => {
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const map = new Map<string, DatedTask[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const project = projectById.get(task.projectId);
      if (!project) continue;
      const list = map.get(task.dueDate) ?? [];
      list.push({ project, task });
      map.set(task.dueDate, list);
    }
    return map;
  }, [projects, tasks]);

  const dayTasks = useMemo(() => tasksByDate.get(selectedKey) ?? [], [tasksByDate, selectedKey]);
  const dayItems = useMemo(() => dayTasks.map(({ task, project }) => ({ ...task, project })), [dayTasks]);
  const dayCollection = useTaskCollection(dayItems, selectedKey);

  const shift = (n: number) => {
    if (mode === 'ay') {
      const d = new Date(selected.getFullYear(), selected.getMonth() + n, 1);
      setSelectedKey(dateKey(d));
    } else {
      setSelectedKey(dateKey(addDays(selected, mode === 'hafta' ? 7 * n : n)));
    }
  };

  // Sıralı liste: ham depolama sırası yerine kullanıcıya görünen sıra.
  const orderedProjects = useMemo(
    () => [...projects].sort((a, b) => a.orderIndex - b.orderIndex),
    [projects],
  );
  const targetProject =
    orderedProjects.find((p) => p.id === targetProjectId) ?? orderedProjects[0] ?? null;

  const projectOptions: PickerOption[] = useMemo(
    () =>
      orderedProjects.map((p) => ({
        key: p.id,
        label: p.name,
        color: p.color,
        indent: !!p.parentId,
      })),
    [orderedProjects],
  );

  const submitTask = () => {
    const title = newTask.trim();
    if (!title || !targetProject) return;
    addTask(targetProject.id, title, selectedKey);
    setNewTask('');
  };

  // Ay ızgarası: pazartesi başlangıçlı 6 hafta.
  const monthGrid = useMemo(() => {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekDays = useMemo(() => {
    const start = startOfWeek(selected);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodTitle =
    mode === 'ay'
      ? `${MONTHS[selected.getMonth()]} ${selected.getFullYear()}`
      : mode === 'hafta'
        ? `${weekDays[0].getDate()} ${MONTHS[weekDays[0].getMonth()]} – ${weekDays[6].getDate()} ${MONTHS[weekDays[6].getMonth()]}`
        : formatDate(selected);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Takvim" right={<HeaderIconButton icon="corner-down-left" label="Bugüne dön" onPress={() => setSelectedKey(dateKey(new Date()))} />} />
        <View style={styles.flex}>
          <FormScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Görünüm seçici — 36dp segment, kayan yok */}
            <View style={styles.segment}>
              {MODES.map((m, i) => (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === m.key }}
                  style={[
                    styles.segmentItem,
                    i > 0 && styles.segmentDivider,
                    mode === m.key && styles.segmentItemOn,
                  ]}
                  onPress={() => setMode(m.key)}
                >
                  <Text
                    style={[styles.segmentText, mode === m.key && styles.segmentTextOn]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Dönem başlığı + gezinme */}
            <View style={styles.periodRow}>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Önceki dönem" onPress={() => shift(-1)}
                hitSlop={8}
                style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
              >
                <Feather name="chevron-left" size={20} color={L.ink2} />
              </Pressable>
              <Text style={styles.periodTitle} maxFontSizeMultiplier={1.2}>
                {periodTitle}
              </Text>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Sonraki dönem" onPress={() => shift(1)}
                hitSlop={8}
                style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
              >
                <Feather name="chevron-right" size={20} color={L.ink2} />
              </Pressable>
            </View>

            {/* Ay görünümü */}
            {mode === 'ay' && (
              <View style={styles.monthCard}>
                <View style={styles.monthGrid}>
                  {WEEKDAYS_SHORT.map((_, i) => (
                    <Text key={i} style={styles.weekdayLabel} maxFontSizeMultiplier={1.2}>
                      {WEEKDAYS_SHORT[(i + 1) % 7]}
                    </Text>
                  ))}
                  {monthGrid.map((d) => {
                    const key = dateKey(d);
                    const inMonth = d.getMonth() === selected.getMonth();
                    const isSelected = key === selectedKey;
                    const isToday = key === todayKey;
                    const dots = (tasksByDate.get(key) ?? []).slice(0, 3);
                    return (
                      <Pressable
                        key={key}
                        style={[
                          styles.dayCell,
                          isToday && !isSelected && styles.dayCellToday,
                          isSelected && styles.dayCellSelected,
                        ]}
                        accessibilityRole="button" accessibilityLabel={formatDate(d)} accessibilityState={{ selected: isSelected }} onPress={() => setSelectedKey(key)}
                      >
                        <Text
                          style={[
                            styles.dayNum,
                            !inMonth && styles.dayNumMuted,
                            isToday && !isSelected && styles.dayNumToday,
                            isSelected && styles.dayNumSelected,
                          ]}
                          maxFontSizeMultiplier={1.1}
                        >
                          {d.getDate()}
                        </Text>
                        <View style={styles.dotRow}>
                          {dots.map(({ project }, i) => (
                            <View
                              key={i}
                              style={[
                                styles.taskDot,
                                { backgroundColor: isSelected ? '#FFFFFF' : project.color },
                              ]}
                            />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Hafta görünümü */}
            {mode === 'hafta' && (
              <View style={styles.weekRow}>
                {weekDays.map((d) => {
                  const key = dateKey(d);
                  const isSelected = key === selectedKey;
                  const isToday = key === todayKey;
                  const hasTasks = (tasksByDate.get(key) ?? []).length > 0;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.weekDay,
                        isToday && !isSelected && styles.weekDayToday,
                        isSelected && styles.weekDaySelected,
                      ]}
                      accessibilityRole="button" accessibilityLabel={formatDate(d)} accessibilityState={{ selected: isSelected }} onPress={() => setSelectedKey(key)}
                    >
                      <Text
                        style={[styles.weekDayName, isSelected && styles.weekDayNameSelected]}
                        maxFontSizeMultiplier={1.1}
                      >
                        {WEEKDAYS_SHORT[d.getDay()]}
                      </Text>
                      <Text
                        style={[
                          styles.weekDayNum,
                          isToday && !isSelected && styles.weekDayNumToday,
                          isSelected && styles.weekDayNumSelected,
                        ]}
                        maxFontSizeMultiplier={1.1}
                      >
                        {d.getDate()}
                      </Text>
                      <View
                        style={[
                          styles.taskDot,
                          {
                            opacity: hasTasks ? 1 : 0,
                            backgroundColor: isSelected ? '#FFFFFF' : L.accent,
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Seçili günün görevleri (tüm görünümlerde) */}
            <Text style={styles.dayTitle} maxFontSizeMultiplier={1.3}>
              {formatDate(selected).toUpperCase()}
              {selectedKey === todayKey ? ' · BUGÜN' : ''}
            </Text>

            {dayTasks.length === 0 && (
              <EmptyState icon="calendar" title="Planlanmış görev yok" description={targetProject ? 'Seçili güne bir görev ekle.' : 'Takvimine görev eklemek için önce bir proje oluştur.'} action={!targetProject ? <Button label="Proje oluştur" icon="plus" variant="primary" onPress={() => router.push('/projects')} /> : undefined} />
            )}

            {dayTasks.length > 0 && <TaskFilters collection={dayCollection} />}
            {dayTasks.length > 0 && dayCollection.total === 0 && <Text style={styles.emptyText}>Bu filtrelerle eşleşen görev yok.</Text>}
            {dayTasks.length > 0 && (
              <View style={styles.card}>
                {dayCollection.items.map(({ project, ...task }, i) => (
                  <View key={task.id} style={[styles.taskRow, i > 0 && styles.rowSeparator]}>
                    <Checkbox
                      checked={task.done}
                      onPress={() => updateTask(task.id, { done: !task.done })}
                    />
                    {/* Satıra dokunmak görev detayına götürür: takvim, çalışma
                        akışının girişi olduğu için çıkmaz sokak olmamalı. */}
                    <Pressable
                      style={styles.flex}
                      onPress={() => router.push(`/task/${task.id}`)}
                      onLongPress={() => setDateTaskId(task.id)}
                      delayLongPress={400}
                    >
                      <Text
                        numberOfLines={2}
                        style={[styles.taskTitle, task.done && styles.taskTitleDone]}
                        maxFontSizeMultiplier={1.3}
                      >
                        {task.title}
                      </Text>
                      <View style={styles.taskProjectRow}>
                        <View style={[styles.projectDot, { backgroundColor: project.color }]} />
                        <Text style={styles.taskProject} maxFontSizeMultiplier={1.2}>
                          {project.name}
                        </Text>
                      </View>
                    </Pressable>
                    <HeaderIconButton icon="calendar" label={`${task.title} tarihini değiştir`} onPress={() => setDateTaskId(task.id)} />
                  </View>
                ))}
              </View>
            )}

            <Pagination total={dayCollection.total} page={dayCollection.page} onChange={dayCollection.setPage} />
            {/* Seçili güne hızlı görev ekleme — hedef proje seçilebilir */}
            {targetProject && (
              <Pressable
                style={({ pressed }) => [styles.targetChip, pressed && styles.chipPressed]}
                onPress={() => setProjectPickerOpen(true)}
              >
                <View style={[styles.projectDot, { backgroundColor: targetProject.color }]} />
                <Text style={styles.targetChipText} maxFontSizeMultiplier={1.2}>
                  {targetProject.name}
                </Text>
                <Feather name="chevron-down" size={14} color={L.tertiary} />
              </Pressable>
            )}
            {targetProject && <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                accessibilityLabel="Seçili güne yeni görev"
                value={newTask}
                onChangeText={setNewTask}
                placeholder="Bu güne görev ekle"
                placeholderTextColor={L.tertiary}
                onSubmitEditing={submitTask}
                returnKeyType="done"
                maxLength={80}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Görev ekle"
                disabled={!newTask.trim()}
                accessibilityState={{ disabled: !newTask.trim() }}
                style={({ pressed }) => [styles.addButton, !newTask.trim() && { backgroundColor: L.borderActive }, pressed && styles.addButtonPressed]}
                onPress={submitTask}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>}
          </FormScrollView>
        </View>
      </SafeAreaView>

      <DateSheet visible={dateTaskId != null} value={tasks.find((t) => t.id === dateTaskId)?.dueDate ?? null}
        onSelect={(value) => { if (dateTaskId) updateTask(dateTaskId, { dueDate: value }); }} onClose={() => setDateTaskId(null)} />

      <PickerSheet
        visible={projectPickerOpen}
        title="Görev hangi projeye eklensin?"
        options={projectOptions}
        selectedKey={targetProject?.id ?? ''}
        onSelect={(key) => setTargetProjectId(key)}
        onClose={() => setProjectPickerOpen(false)}
      />
    </View>
  );
}

const CELL = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: L.surface,
  },
  safeArea: {
    flex: 1,
    minWidth: 0,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    padding: 16,
    gap: 14,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
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
    minWidth: 0,
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
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
  },
  navPressed: {
    backgroundColor: L.pressed,
  },
  periodTitle: {
    flexShrink: 1,
    textAlign: 'center',
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 15,
  },
  monthCard: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    padding: 8,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekdayLabel: {
    width: CELL,
    textAlign: 'center',
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    paddingVertical: 6,
  },
  dayCell: {
    width: CELL,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
    gap: 3,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: L.accent,
  },
  dayCellSelected: {
    backgroundColor: L.accent,
  },
  dayNum: {
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 14,
  },
  dayNumMuted: {
    color: L.borderActive,
  },
  dayNumToday: {
    color: L.accent,
    fontFamily: F.uiSemi,
  },
  dayNumSelected: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 4,
  },
  taskDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekDay: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: R.md,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
  },
  weekDayToday: {
    borderColor: L.accent,
  },
  weekDaySelected: {
    backgroundColor: L.accent,
    borderColor: L.accent,
  },
  weekDayName: {
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 11,
  },
  weekDayNameSelected: {
    color: '#D3E5FF',
  },
  weekDayNum: {
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 16,
  },
  weekDayNumToday: {
    color: L.accent,
    fontFamily: F.uiSemi,
  },
  weekDayNumSelected: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
  },
  dayTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 13,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  emptyText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
    paddingVertical: 4,
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
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    paddingVertical: 10,
  },
  taskTitle: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 15,
  },
  taskTitleDone: {
    color: L.tertiary,
    textDecorationLine: 'line-through',
  },
  taskProjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  projectDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  taskProject: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 12,
  },
  chipPressed: {
    backgroundColor: L.pressed,
  },
  targetChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  targetChipText: {
    flexShrink: 1,
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  addRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 14,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: R.md,
    backgroundColor: L.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: {
    backgroundColor: L.accentPressed,
  },
});
