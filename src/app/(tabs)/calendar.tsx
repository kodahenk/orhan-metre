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
import { ScreenHeader } from '@/features/ui/components';
import { C, F } from '@/features/ui/theme';

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
    const step = mode === 'ay' ? 0 : mode === 'hafta' ? 7 * n : n;
    if (mode === 'ay') {
      const d = new Date(selected.getFullYear(), selected.getMonth() + n, 1);
      setSelectedKey(dateKey(d));
    } else {
      setSelectedKey(dateKey(addDays(selected, step)));
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
            {/* Görünüm seçici */}
            <View style={styles.segment}>
              {MODES.map((m) => (
                <Pressable
                  key={m.key}
                  style={[styles.segmentItem, mode === m.key && styles.segmentItemOn]}
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
              <Pressable onPress={() => shift(-1)} hitSlop={12} style={styles.navButton}>
                <Feather name="chevron-left" size={20} color={C.text2} />
              </Pressable>
              <Text style={styles.periodTitle} maxFontSizeMultiplier={1.2}>
                {periodTitle}
              </Text>
              <Pressable onPress={() => shift(1)} hitSlop={12} style={styles.navButton}>
                <Feather name="chevron-right" size={20} color={C.text2} />
              </Pressable>
            </View>

            {/* Ay görünümü */}
            {mode === 'ay' && (
              <View style={styles.monthGrid}>
                {WEEKDAYS_SHORT.map((_, i) => {
                  // Pazartesi başlangıçlı sıralama
                  const label = WEEKDAYS_SHORT[(i + 1) % 7];
                  return (
                    <Text key={i} style={styles.weekdayLabel} maxFontSizeMultiplier={1.2}>
                      {label}
                    </Text>
                  );
                })}
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
                        isSelected && styles.dayCellSelected,
                        isToday && !isSelected && styles.dayCellToday,
                      ]}
                      onPress={() => setSelectedKey(key)}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          !inMonth && styles.dayNumMuted,
                          isSelected && styles.dayNumSelected,
                        ]}
                        maxFontSizeMultiplier={1.1}
                      >
                        {d.getDate()}
                      </Text>
                      <View style={styles.dotRow}>
                        {dots.map(({ project }, i) => (
                          <View key={i} style={[styles.taskDot, { backgroundColor: project.color }]} />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
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
                      style={[styles.weekDay, isSelected && styles.weekDaySelected]}
                      onPress={() => setSelectedKey(key)}
                    >
                      <Text style={styles.weekDayName} maxFontSizeMultiplier={1.1}>
                        {WEEKDAYS_SHORT[d.getDay()]}
                      </Text>
                      <Text
                        style={[
                          styles.weekDayNum,
                          isToday && styles.weekDayNumToday,
                          isSelected && styles.weekDayNumSelected,
                        ]}
                        maxFontSizeMultiplier={1.1}
                      >
                        {d.getDate()}
                      </Text>
                      <View
                        style={[styles.taskDot, { opacity: hasTasks ? 1 : 0, backgroundColor: C.blue }]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Seçili günün görevleri (tüm görünümlerde) */}
            <Text style={styles.dayTitle} maxFontSizeMultiplier={1.3}>
              {formatDate(selected)}
              {selectedKey === todayKey ? ' · Bugün' : ''}
            </Text>

            {dayTasks.length === 0 && (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Bu güne atanmış görev yok.
              </Text>
            )}

            {dayTasks.map(({ project, task }) => (
              <View key={task.id} style={styles.taskRow}>
                <Pressable
                  onPress={() => updateTask(project.id, task.id, { done: !task.done })}
                  hitSlop={8}
                >
                  <Feather
                    name={task.done ? 'check-circle' : 'circle'}
                    size={20}
                    color={task.done ? C.green : C.text3}
                  />
                </Pressable>
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

            {/* Seçili güne hızlı görev ekleme (ilk projeye) */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newTask}
                onChangeText={setNewTask}
                placeholder={`Bu güne görev ekle (${projects[0]?.name ?? ''})`}
                placeholderTextColor={C.faint}
                onSubmitEditing={submitTask}
                returnKeyType="done"
                maxLength={80}
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
                onPress={submitTask}
              >
                <Feather name="plus" size={20} color={C.text} />
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
    backgroundColor: C.bg,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 14,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
  },
  segmentItemOn: {
    backgroundColor: '#1C1E22',
  },
  segmentText: {
    color: C.text2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  segmentTextOn: {
    color: C.text,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTitle: {
    color: C.text,
    fontFamily: F.uiSemi,
    fontSize: 15,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekdayLabel: {
    width: CELL,
    textAlign: 'center',
    color: C.text3,
    fontFamily: F.uiMed,
    fontSize: 11,
    paddingVertical: 6,
  },
  dayCell: {
    width: CELL,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 3,
  },
  dayCellSelected: {
    backgroundColor: '#1C1E22',
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: C.border2,
  },
  dayNum: {
    color: C.text,
    fontFamily: F.ui,
    fontSize: 14,
  },
  dayNumMuted: {
    color: C.faint,
  },
  dayNumSelected: {
    fontFamily: F.uiSemi,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
  },
  taskDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  weekDaySelected: {
    backgroundColor: '#1C1E22',
  },
  weekDayName: {
    color: C.text3,
    fontFamily: F.uiMed,
    fontSize: 11,
  },
  weekDayNum: {
    color: C.text,
    fontFamily: F.ui,
    fontSize: 16,
  },
  weekDayNumToday: {
    color: C.blue,
  },
  weekDayNumSelected: {
    fontFamily: F.uiSemi,
  },
  dayTitle: {
    color: C.text2,
    fontFamily: F.uiSemi,
    fontSize: 13,
    marginTop: 6,
  },
  emptyText: {
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 13,
    paddingVertical: 8,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  taskTitle: {
    color: C.text,
    fontFamily: F.uiMed,
    fontSize: 14.5,
  },
  taskTitleDone: {
    color: C.text3,
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
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 11.5,
  },
  addRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    color: C.text,
    fontFamily: F.ui,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  addButton: {
    width: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
