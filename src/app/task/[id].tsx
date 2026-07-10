import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Görev detayı: görev + yalnızca DOĞRUDAN alt görevleri (her ekranda en fazla
 * 2 seviye). Alt görevin kendi altları varsa satırına dokununca ONUN detayına
 * inilir — sınırsız derinlik, üstte kırıntı ile geri sıçranır.
 */
export default function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, tasks, addTask, updateTask, deleteTask } = useProjects();

  const task = tasks.find((t) => t.id === id);
  const project = task ? projects.find((p) => p.id === task.projectId) : null;

  const [newSubtask, setNewSubtask] = useState('');

  // Açıklama taslağı: görev değişince tazelenir, yazarken 500 ms'de bir kaydedilir.
  const [noteDraft, setNoteDraft] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskId = task?.id;
  const taskNote = task?.note ?? '';
  useEffect(() => {
    setNoteDraft(taskNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);
  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);
  const onNoteChange = (text: string) => {
    setNoteDraft(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      if (taskId) updateTask(taskId, { note: text });
    }, 500);
  };

  // Kırıntı: proje › üst görev zinciri.
  const crumbs = useMemo(() => {
    const chain: Task[] = [];
    let current = task?.parentTaskId ? tasks.find((t) => t.id === task.parentTaskId) : undefined;
    while (current) {
      chain.unshift(current);
      current = current.parentTaskId
        ? tasks.find((t) => t.id === current!.parentTaskId)
        : undefined;
    }
    return chain;
  }, [task, tasks]);

  const children = useMemo(
    () =>
      tasks
        .filter((t) => t.parentTaskId === id)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [tasks, id],
  );
  const grandChildCount = (taskId: string) => tasks.filter((t) => t.parentTaskId === taskId).length;

  if (!task || !project) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Text style={styles.emptyText}>Görev bulunamadı.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const doneChildren = children.filter((t) => t.done).length;

  const submitSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    addTask(project.id, task.id, title);
    setNewSubtask('');
  };

  const confirmDelete = () => {
    Alert.alert('Görevi sil', `"${task.title}" ve tüm alt görevleri silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          deleteTask(task.id);
          router.back();
        },
      },
    ]);
  };

  const setDue = (due: string | null) => updateTask(task.id, { dueDate: due });
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(new Date(), 1));

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={24} color={L.ink} />
          </Pressable>
          {/* Kırıntı: proje › üst görevler */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.crumbs}
            style={styles.flex}
          >
            <Pressable onPress={() => router.push(`/project/${project.id}`)} hitSlop={6}>
              <Text style={styles.crumb} maxFontSizeMultiplier={1.2}>
                {project.name}
              </Text>
            </Pressable>
            {crumbs.map((c) => (
              <View key={c.id} style={styles.crumbItem}>
                <Feather name="chevron-right" size={13} color={L.borderActive} />
                <Pressable onPress={() => router.push(`/task/${c.id}`)} hitSlop={6}>
                  <Text style={styles.crumb} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {c.title}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={confirmDelete}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
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
            {/* Görev başlığı */}
            <View style={styles.titleCard}>
              <Checkbox
                checked={task.done}
                onPress={() => updateTask(task.id, { done: !task.done })}
              />
              <Text
                style={[styles.title, task.done && styles.titleDone]}
                maxFontSizeMultiplier={1.3}
              >
                {task.title}
              </Text>
            </View>

            {/* Açıklama */}
            <TextInput
              style={styles.descInput}
              value={noteDraft}
              onChangeText={onNoteChange}
              placeholder="Açıklama ekle — detay, bağlantı, not…"
              placeholderTextColor={L.tertiary}
              multiline
              textAlignVertical="top"
              maxFontSizeMultiplier={1.2}
            />

            {/* Tarih çipleri */}
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, task.dueDate === todayKey && styles.chipOn]}
                onPress={() => setDue(todayKey)}
              >
                <Text
                  style={[styles.chipText, task.dueDate === todayKey && styles.chipTextOn]}
                  maxFontSizeMultiplier={1.2}
                >
                  Bugün
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, task.dueDate === tomorrowKey && styles.chipOn]}
                onPress={() => setDue(tomorrowKey)}
              >
                <Text
                  style={[styles.chipText, task.dueDate === tomorrowKey && styles.chipTextOn]}
                  maxFontSizeMultiplier={1.2}
                >
                  Yarın
                </Text>
              </Pressable>
              {task.dueDate && (
                <Pressable style={styles.chip} onPress={() => setDue(null)}>
                  <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                    Tarihi kaldır
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Alt görevler */}
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              ALT GÖREVLER {children.length > 0 ? `· ${doneChildren}/${children.length}` : ''}
            </Text>

            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newSubtask}
                onChangeText={setNewSubtask}
                placeholder="Alt görev ekle"
                placeholderTextColor={L.tertiary}
                onSubmitEditing={submitSubtask}
                returnKeyType="done"
                maxLength={80}
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                onPress={submitSubtask}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {children.length === 0 && (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Alt görev yok.
              </Text>
            )}

            {children.length > 0 && (
              <View style={styles.card}>
                {children.map((child, i) => {
                  const grandCount = grandChildCount(child.id);
                  return (
                    <View key={child.id} style={[styles.taskRow, i > 0 && styles.rowSeparator]}>
                      <Checkbox
                        checked={child.done}
                        onPress={() => updateTask(child.id, { done: !child.done })}
                      />
                      <Pressable
                        style={styles.taskBody}
                        onPress={() => router.push(`/task/${child.id}`)}
                      >
                        <Text
                          style={[styles.taskTitle, child.done && styles.titleDone]}
                          maxFontSizeMultiplier={1.3}
                        >
                          {child.title}
                        </Text>
                        {!!child.note && (
                          <Text
                            style={styles.taskDesc}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.2}
                          >
                            {child.note}
                          </Text>
                        )}
                        {grandCount > 0 && (
                          <Text style={styles.taskMeta} maxFontSizeMultiplier={1.2}>
                            {grandCount} alt görev
                          </Text>
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
  crumbs: {
    alignItems: 'center',
    gap: 4,
  },
  crumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  crumb: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
    maxWidth: 140,
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    flex: 1,
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 16,
    lineHeight: 22,
  },
  titleDone: {
    color: L.tertiary,
    textDecorationLine: 'line-through',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 30,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
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
  sectionTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 6,
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
  addButton: {
    width: 42,
    height: 42,
    borderRadius: R.md,
    backgroundColor: L.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
  descInput: {
    minHeight: 56,
    maxHeight: 140,
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  taskMeta: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 3,
  },
  pressed: {
    backgroundColor: L.pressed,
  },
});
