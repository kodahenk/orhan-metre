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
import { C, F } from '@/features/ui/theme';

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

  const setDue = (task: Task, due: string | null) => updateTask(project.id, task.id, { dueDate: due });

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Başlık: geri + proje adı + sil */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
            <Feather name="chevron-left" size={24} color={C.text2} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={[styles.colorDot, { backgroundColor: project.color }]} />
            <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {project.name}
            </Text>
          </View>
          <Pressable onPress={confirmDeleteProject} hitSlop={12} style={styles.headerButton}>
            <Feather name="trash-2" size={19} color={C.text3} />
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

            {project.tasks.length === 0 && (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Henüz görev yok — yukarıdan ekleyin.
              </Text>
            )}

            {project.tasks.map((task) => {
              const expanded = expandedId === task.id;
              const due = dueLabel(task.dueDate);
              const subDone = task.subtasks.filter((s) => s.done).length;
              return (
                <View key={task.id} style={[styles.taskCard, expanded && styles.taskCardExpanded]}>
                  <View style={styles.taskRow}>
                    <Pressable
                      onPress={() => updateTask(project.id, task.id, { done: !task.done })}
                      hitSlop={8}
                    >
                      <Feather
                        name={task.done ? 'check-circle' : 'circle'}
                        size={21}
                        color={task.done ? C.green : C.text3}
                      />
                    </Pressable>
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
                      <View style={styles.taskMetaRow}>
                        {due && (
                          <View style={styles.dueBadge}>
                            <Feather name="calendar" size={10} color={C.blue} />
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
                    </Pressable>
                    <Feather
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={C.text3}
                    />
                  </View>

                  {expanded && (
                    <View style={styles.expandArea}>
                      {/* Alt görevler */}
                      {task.subtasks.map((sub) => (
                        <View key={sub.id} style={styles.subtaskRow}>
                          <Pressable
                            onPress={() => toggleSubtask(project.id, task.id, sub.id)}
                            hitSlop={8}
                          >
                            <Feather
                              name={sub.done ? 'check-circle' : 'circle'}
                              size={17}
                              color={sub.done ? C.green : C.text3}
                            />
                          </Pressable>
                          <Text
                            style={[styles.subtaskTitle, sub.done && styles.taskTitleDone]}
                            maxFontSizeMultiplier={1.3}
                          >
                            {sub.title}
                          </Text>
                          <Pressable
                            onPress={() => deleteSubtask(project.id, task.id, sub.id)}
                            hitSlop={8}
                          >
                            <Feather name="x" size={15} color={C.faint} />
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
                          placeholderTextColor={C.faint}
                          onSubmitEditing={() => submitSubtask(task)}
                          returnKeyType="done"
                          maxLength={80}
                        />
                        <Pressable
                          style={({ pressed }) => [
                            styles.addButton,
                            styles.addButtonSmall,
                            pressed && styles.pressed,
                          ]}
                          onPress={() => submitSubtask(task)}
                        >
                          <Feather name="plus" size={16} color={C.text} />
                        </Pressable>
                      </View>

                      {/* Tarih + sil */}
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[styles.chip, task.dueDate === dateKey(new Date()) && styles.chipOn]}
                          onPress={() => setDue(task, dateKey(new Date()))}
                        >
                          <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
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
                          <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
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
                          hitSlop={8}
                          style={styles.deleteTask}
                        >
                          <Feather name="trash-2" size={15} color={C.red} />
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.surface2,
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    color: C.text,
    fontFamily: F.uiSemi,
    fontSize: 17,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  content: {
    padding: 20,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  addRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    color: C.text,
    fontFamily: F.ui,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  inputSmall: {
    fontSize: 13,
    paddingVertical: 8,
  },
  addButton: {
    width: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonSmall: {
    width: 38,
  },
  emptyText: {
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  taskCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  taskCardExpanded: {
    borderColor: C.border2,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskTitleWrap: {
    flex: 1,
  },
  taskTitle: {
    color: C.text,
    fontFamily: F.uiMed,
    fontSize: 15,
  },
  taskTitleDone: {
    color: C.text3,
    textDecorationLine: 'line-through',
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 3,
  },
  taskMeta: {
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 12,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueText: {
    color: C.blue,
    fontFamily: F.uiMed,
    fontSize: 11,
  },
  expandArea: {
    marginTop: 12,
    gap: 10,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
  },
  subtaskTitle: {
    flex: 1,
    color: C.text2,
    fontFamily: F.ui,
    fontSize: 13.5,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: {
    borderColor: C.blue,
  },
  chipText: {
    color: C.text2,
    fontFamily: F.uiMed,
    fontSize: 11,
  },
  deleteTask: {
    padding: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
