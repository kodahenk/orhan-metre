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

import { useProjects, type Task } from '@/features/projects/projects-context';
import { addDays, dateKey } from '@/features/timer/format';
import { Checkbox } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

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
    deleteProject,
    addTask,
    updateTask,
    deleteTask,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
  } = useProjects();

  const project = projects.find((p) => p.id === id);

  const [newTask, setNewTask] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubtask, setNewSubtask] = useState('');

  if (!project) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Text style={styles.emptyText}>Proje bulunamadı.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const submitTask = () => {
    const title = newTask.trim();
    if (!title) return;
    addTask(project.id, title);
    setNewTask('');
  };

  const submitSubtask = (task: Task) => {
    const title = newSubtask.trim();
    if (!title) return;
    addSubtask(project.id, task.id, title);
    setNewSubtask('');
  };

  const confirmDeleteProject = () => {
    Alert.alert('Projeyi sil', `"${project.name}" ve tüm görevleri silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          deleteProject(project.id);
          router.back();
        },
      },
    ]);
  };

  const setDue = (task: Task, due: string | null) =>
    updateTask(project.id, task.id, { dueDate: due });

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Başlık: geri + proje adı + sil */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          >
            <Feather name="chevron-left" size={24} color={L.ink} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={[styles.colorDot, { backgroundColor: project.color }]} />
            <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {project.name}
            </Text>
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
            {/* Yeni görev */}
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

            {project.tasks.length === 0 && (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Henüz görev yok — yukarıdan ekleyin.
              </Text>
            )}

            {project.tasks.length > 0 && (
              <View style={styles.card}>
                {project.tasks.map((task, i) => {
                  const expanded = expandedId === task.id;
                  const due = dueLabel(task.dueDate);
                  const subDone = task.subtasks.filter((s) => s.done).length;
                  return (
                    <View key={task.id} style={i > 0 && styles.rowSeparator}>
                      <View style={styles.taskRow}>
                        <Checkbox
                          checked={task.done}
                          onPress={() => updateTask(project.id, task.id, { done: !task.done })}
                        />
                        <Pressable
                          style={styles.taskTitleWrap}
                          onPress={() => {
                            setExpandedId(expanded ? null : task.id);
                            setNewSubtask('');
                          }}
                        >
                          <Text
                            style={[styles.taskTitle, task.done && styles.taskTitleDone]}
                            maxFontSizeMultiplier={1.3}
                          >
                            {task.title}
                          </Text>
                          {(due || task.subtasks.length > 0) && (
                            <View style={styles.taskMetaRow}>
                              {due && (
                                <View style={styles.dueBadge}>
                                  <Feather name="calendar" size={11} color={L.accent} />
                                  <Text style={styles.dueText} maxFontSizeMultiplier={1.2}>
                                    {due}
                                  </Text>
                                </View>
                              )}
                              {task.subtasks.length > 0 && (
                                <Text style={styles.taskMeta} maxFontSizeMultiplier={1.2}>
                                  {subDone}/{task.subtasks.length} alt görev
                                </Text>
                              )}
                            </View>
                          )}
                        </Pressable>
                        <Feather
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={L.tertiary}
                        />
                      </View>

                      {expanded && (
                        <View style={styles.expandArea}>
                          {/* Alt görevler */}
                          {task.subtasks.map((sub) => (
                            <View key={sub.id} style={styles.subtaskRow}>
                              <Checkbox
                                checked={sub.done}
                                onPress={() => toggleSubtask(project.id, task.id, sub.id)}
                              />
                              <Text
                                style={[styles.subtaskTitle, sub.done && styles.taskTitleDone]}
                                maxFontSizeMultiplier={1.3}
                              >
                                {sub.title}
                              </Text>
                              <Pressable
                                onPress={() => deleteSubtask(project.id, task.id, sub.id)}
                                hitSlop={10}
                              >
                                <Feather name="x" size={16} color={L.tertiary} />
                              </Pressable>
                            </View>
                          ))}

                          {/* Alt görev ekle */}
                          <View style={styles.addRow}>
                            <TextInput
                              style={[styles.input, styles.inputSmall]}
                              value={newSubtask}
                              onChangeText={setNewSubtask}
                              placeholder="Alt görev ekle"
                              placeholderTextColor={L.tertiary}
                              onSubmitEditing={() => submitSubtask(task)}
                              returnKeyType="done"
                              maxLength={80}
                            />
                            <Pressable
                              style={({ pressed }) => [
                                styles.addButton,
                                styles.addButtonSmall,
                                pressed && styles.addButtonPressed,
                              ]}
                              onPress={() => submitSubtask(task)}
                            >
                              <Feather name="plus" size={16} color="#FFFFFF" />
                            </Pressable>
                          </View>

                          {/* Tarih + sil */}
                          <View style={styles.chipRow}>
                            <Pressable
                              style={[
                                styles.chip,
                                task.dueDate === dateKey(new Date()) && styles.chipOn,
                              ]}
                              onPress={() => setDue(task, dateKey(new Date()))}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  task.dueDate === dateKey(new Date()) && styles.chipTextOn,
                                ]}
                                maxFontSizeMultiplier={1.2}
                              >
                                Bugün
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.chip,
                                task.dueDate === dateKey(addDays(new Date(), 1)) && styles.chipOn,
                              ]}
                              onPress={() => setDue(task, dateKey(addDays(new Date(), 1)))}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  task.dueDate === dateKey(addDays(new Date(), 1)) &&
                                    styles.chipTextOn,
                                ]}
                                maxFontSizeMultiplier={1.2}
                              >
                                Yarın
                              </Text>
                            </Pressable>
                            {task.dueDate && (
                              <Pressable style={styles.chip} onPress={() => setDue(task, null)}>
                                <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                                  Tarihi kaldır
                                </Text>
                              </Pressable>
                            )}
                            <View style={styles.flex} />
                            <Pressable
                              onPress={() => deleteTask(project.id, task.id)}
                              hitSlop={10}
                              style={styles.deleteTask}
                            >
                              <Feather name="trash-2" size={16} color={L.danger} />
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
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
    paddingHorizontal: 8,
    height: 56,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: 16,
    gap: 16,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
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
    fontSize: 15,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
  },
  inputSmall: {
    height: 40,
    fontSize: 13,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: R.md,
    backgroundColor: L.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonSmall: {
    width: 40,
    height: 40,
  },
  addButtonPressed: {
    backgroundColor: L.accentPressed,
  },
  emptyText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
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
  taskTitleWrap: {
    flex: 1,
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
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  taskMeta: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 13,
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
  expandArea: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 32,
  },
  subtaskTitle: {
    flex: 1,
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    height: 28,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 10,
    backgroundColor: L.surface,
  },
  chipOn: {
    backgroundColor: L.selected,
    borderColor: L.accent,
  },
  chipText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  chipTextOn: {
    color: L.accent,
  },
  deleteTask: {
    padding: 6,
  },
  pressed: {
    opacity: 0.6,
  },
});
