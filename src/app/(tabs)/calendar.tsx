import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
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
import { Checkbox, ScreenHeader } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

type Mode = 'gun' | 'hafta' | 'ay';

const MODES: { key: Mode; label: string }[] = [
  { key: 'gun', label: 'Gün' },
  { key: 'hafta', label: 'Hafta' },
  { key: 'ay', label: 'Ay' },
];

type DatedTask = { project: Project; task: Task };

export default function CalendarScreen() {
  const { projects, addTask, updateTask } = useProjects();
  const [mode, setMode] = useState<Mode>('hafta');
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const [newTask, setNewTask] = useState('');

  const selected = parseDateKey(selectedKey);
  const todayKey = dateKey(new Date());

  // Tarihli görevler: 'YYYY-MM-DD' → görev listesi.
  const tasksByDate = useMemo(() => {
    const map = new Map<string, DatedTask[]>();
    for (const project of projects) {
      for (const task of project.tasks) {
        if (!task.dueDate) continue;
        const list = map.get(task.dueDate) ?? [];
        list.push({ project, task });
        map.set(task.dueDate, list);
      }
    }
    return map;
  }, [projects]);

  const dayTasks = tasksByDate.get(selectedKey) ?? [];

  const shift = (n: number) => {
    if (mode === 'ay') {
      const d = new Date(selected.getFullYear(), selected.getMonth() + n, 1);
      setSelectedKey(dateKey(d));
    } else {
      setSelectedKey(dateKey(addDays(selected, mode === 'hafta' ? 7 * n : n)));
    }
  };

  const submitTask = () => {
    const title = newTask.trim();
    if (!title || projects.length === 0) return;
    addTask(projects[0].id, title, selectedKey);
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Takvim" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Görünüm seçici — 36dp segment, kayan yok */}
            <View style={styles.segment}>
              {MODES.map((m, i) => (
                <Pressable
                  key={m.key}
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
                onPress={() => shift(-1)}
                hitSlop={8}
                style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
              >
                <Feather name="chevron-left" size={20} color={L.ink2} />
              </Pressable>
              <Text style={styles.periodTitle} maxFontSizeMultiplier={1.2}>
                {periodTitle}
              </Text>
              <Pressable
                onPress={() => shift(1)}
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
                        onPress={() => setSelectedKey(key)}
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
                      onPress={() => setSelectedKey(key)}
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
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Bu güne atanmış görev yok.
              </Text>
            )}

            {dayTasks.length > 0 && (
              <View style={styles.card}>
                {dayTasks.map(({ project, task }, i) => (
                  <View key={task.id} style={[styles.taskRow, i > 0 && styles.rowSeparator]}>
                    <Checkbox
                      checked={task.done}
                      onPress={() => updateTask(project.id, task.id, { done: !task.done })}
                    />
                    <View style={styles.flex}>
                      <Text
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
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Seçili güne hızlı görev ekleme (ilk projeye) */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newTask}
                onChangeText={setNewTask}
                placeholder={`Bu güne görev ekle (${projects[0]?.name ?? ''})`}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const CELL = `${100 / 7}%` as const;

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
    padding: 16,
    gap: 14,
    maxWidth: 560,
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
    marginTop: 8,
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
  addRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
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
