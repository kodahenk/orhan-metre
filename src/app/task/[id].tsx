import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects, type Task } from '@/features/projects/projects-context';
import { useSessions } from '@/features/sessions/sessions-context';
import { addDays, dateKey, formatDate, formatDuration } from '@/features/timer/format';
import { useTimer } from '@/features/timer/timer-context';
import { Checkbox, PickerSheet, type PickerOption } from '@/features/ui/components';
import { confirmAction } from '@/features/ui/dialogs';
import { Pagination, TaskFilters, useTaskCollection } from '@/features/ui/collection';
import { groupBy } from '@/features/ui/collection-utils';
import { FormScrollView } from '@/features/ui/form-scroll-view';
import { F, L, R } from '@/features/ui/theme';

/**
 * Görev detayı: görev + yalnızca DOĞRUDAN alt görevleri (her ekranda en fazla
 * 2 seviye). Alt görevin kendi altları varsa satırına dokununca ONUN detayına
 * inilir — sınırsız derinlik, üstte kırıntı ile geri sıçranır.
 */
export default function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, tasks, addTask, updateTask, deleteTask, moveTask, moveTaskOrder } =
    useProjects();
  const timer = useTimer();

  const task = tasks.find((t) => t.id === id);
  const project = task ? projects.find((p) => p.id === task.projectId) : null;

  const [newSubtask, setNewSubtask] = useState('');

  // Başlık taslağı: görev değişince tazelenir, yazarken 500 ms'de bir kaydedilir
  // (açıklama alanıyla aynı desen). Boş başlık kaydedilmez.
  const [titleDraft, setTitleDraft] = useState(task?.title ?? '');
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Açıklama taslağı: görev değişince tazelenir, yazarken 500 ms'de bir kaydedilir.
  const [noteDraft, setNoteDraft] = useState(task?.note ?? '');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskId = task?.id;
  const taskNote = task?.note ?? '';
  const taskTitle = task?.title ?? '';
  const [draftTaskId, setDraftTaskId] = useState(taskId);
  if (draftTaskId !== taskId) {
    setDraftTaskId(taskId);
    setNoteDraft(taskNote);
    setTitleDraft(taskTitle);
  }
  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, []);

  const onTitleChange = (text: string) => {
    setTitleDraft(text);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      const clean = text.trim();
      if (taskId && clean) updateTask(taskId, { title: clean });
    }, 500);
  };
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

  // Bu göreve + tüm alt ağacına yazılmış oturumların toplam çalışma süresi.
  // Rapor felsefesiyle aynı: okuma anında hesaplanır, sayaç saklanmaz.
  const { sessions } = useSessions();
  const totalWorkSeconds = useMemo(() => {
    if (!id) return 0;
    const subtree = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of tasks) {
        if (t.parentTaskId && subtree.has(t.parentTaskId) && !subtree.has(t.id)) {
          subtree.add(t.id);
          grew = true;
        }
      }
    }
    return sessions.reduce(
      (sum, s) => (s.taskId && subtree.has(s.taskId) ? sum + s.workSeconds : sum),
      0,
    );
  }, [sessions, tasks, id]);
  const taskChildren = useMemo(() => groupBy(tasks, (t) => t.parentTaskId), [tasks]);
  const grandChildCount = (taskId: string) => taskChildren.get(taskId)?.length ?? 0;

  // Görevi başka projeye taşıma: alt ağacı da birlikte taşınır (moveTask).
  const projectOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [];
    for (const parent of projects.filter((pr) => !pr.parentId)) {
      options.push({ key: parent.id, label: parent.name, color: parent.color });
      for (const child of projects.filter((pr) => pr.parentId === parent.id)) {
        options.push({ key: child.id, label: child.name, color: child.color, indent: true });
      }
    }
    return options;
  }, [projects]);

  // Rasgele tarih: yeni bağımlılık yerine önümüzdeki 3 haftadan seçim.
  const dateOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: '__none__', label: 'Tarihsiz' }];
    for (let i = 0; i < 21; i++) {
      const d = addDays(new Date(), i);
      options.push({
        key: dateKey(d),
        label: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : formatDate(d),
        caption: i > 1 ? undefined : formatDate(d),
      });
    }
    return options;
  }, []);

  const taskList = useTaskCollection(children, id);

  if (!task || !project) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Text style={styles.emptyText}>Görev bulunamadı.</Text>
          <Pressable
            style={({ pressed }) => [styles.backHome, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
          >
            <Feather name="chevron-left" size={16} color={L.ink2} />
            <Text style={styles.backHomeText}>Geri dön</Text>
          </Pressable>
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
    confirmAction({
      title: 'Görevi sil',
      message: `"${task.title}" ve tüm alt görevleri silinecek.`,
      onConfirm: () => {
        deleteTask(task.id);
        router.back();
      },
    });
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

        <View style={styles.flex}>
          <FormScrollView
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
              <TextInput
                style={[styles.title, styles.titleInput, task.done && styles.titleDone]}
                value={titleDraft}
                onChangeText={onTitleChange}
                placeholder="Görev adı"
                placeholderTextColor={L.tertiary}
                maxLength={120}
                multiline
                maxFontSizeMultiplier={1.3}
              />
            </View>

            {/* Görevin projesi — dokunarak başka projeye taşınır */}
            <Pressable
              style={({ pressed }) => [styles.metaRow, pressed && styles.pressedRow]}
              onPress={() => setProjectPickerOpen(true)}
            >
              <View style={[styles.projectDot, { backgroundColor: project.color }]} />
              <Text style={styles.metaText} maxFontSizeMultiplier={1.2}>
                {project.name}
              </Text>
              <Feather name="chevron-down" size={14} color={L.tertiary} />
            </Pressable>

            {/* Zamanlayıcıdan bu göreve yazılan toplam çalışma süresi */}
            {totalWorkSeconds > 0 && (
              <View style={styles.timeRow}>
                <Feather name="clock" size={13} color={L.tertiary} />
                <Text style={styles.timeText} maxFontSizeMultiplier={1.2}>
                  Çalışılan süre: {formatDuration(totalWorkSeconds)}
                  {children.length > 0 ? ' · alt görevler dahil' : ''}
                </Text>
              </View>
            )}

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

            {/* Bu görevle çalış: proje + görev seçimini yapıp zamanlayıcıya götürür.
                Oturum sürerken gizlidir — görev oturum boyunca kilitlidir. */}
            {timer.status === 'idle' && !task.done && (
              <Pressable
                style={({ pressed }) => [styles.workButton, pressed && styles.workButtonPressed]}
                onPress={() => {
                  timer.setPendingProject(project.id);
                  timer.setPendingTask(task.id);
                  router.push('/');
                }}
              >
                <Feather name="play" size={16} color="#FFFFFF" />
                <Text style={styles.workButtonText} maxFontSizeMultiplier={1.2}>
                  Bu görevle çalış
                </Text>
              </Pressable>
            )}

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
              <Pressable style={styles.chip} onPress={() => setDatePickerOpen(true)}>
                <Feather name="calendar" size={12} color={L.ink2} />
                <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                  {task.dueDate && task.dueDate !== todayKey && task.dueDate !== tomorrowKey
                    ? formatDate(new Date(task.dueDate))
                    : 'Tarih seç'}
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
                accessibilityRole="button" accessibilityLabel="Görev ekle" disabled={!newSubtask.trim()} accessibilityState={{ disabled: !newSubtask.trim() }}
                style={({ pressed }) => [styles.addButton, !newSubtask.trim() && { opacity: 0.4 }, pressed && styles.addButtonPressed]}
                onPress={submitSubtask}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {children.length > 0 && <TaskFilters collection={taskList} />}
            {children.length > 0 && taskList.total === 0 && <Text style={styles.emptyText}>Bu filtrelerle eşleşen görev yok.</Text>}
            {children.length === 0 && (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Alt görev yok.
              </Text>
            )}

            {children.length > 0 && (
              <View style={styles.card}>
                {taskList.items.map((child, i) => {
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
                          numberOfLines={2}
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
                      <View style={styles.orderCol}>
                        <Pressable
                          hitSlop={6}
                          onPress={() => moveTaskOrder(child.id, -1)}
                          disabled={children[0]?.id === child.id}
                        >
                          <Feather
                            name="chevron-up"
                            size={16}
                            color={children[0]?.id === child.id ? L.hairline : L.tertiary}
                          />
                        </Pressable>
                        <Pressable
                          hitSlop={6}
                          onPress={() => moveTaskOrder(child.id, 1)}
                          disabled={children[children.length - 1]?.id === child.id}
                        >
                          <Feather
                            name="chevron-down"
                            size={16}
                            color={children[children.length - 1]?.id === child.id ? L.hairline : L.tertiary}
                          />
                        </Pressable>
                      </View>
                      <Feather name="chevron-right" size={18} color={L.tertiary} />
                    </View>
                  );
                })}
              </View>
            )}
            <Pagination total={taskList.total} page={taskList.page} onChange={taskList.setPage} />
          </FormScrollView>
        </View>
      </SafeAreaView>

      <PickerSheet
        visible={projectPickerOpen}
        title="Görevi taşı"
        options={projectOptions}
        selectedKey={task.projectId}
        onSelect={(key) => moveTask(task.id, key, task.parentTaskId)}
        onClose={() => setProjectPickerOpen(false)}
      />
      <PickerSheet
        visible={datePickerOpen}
        title="Tarih seç"
        options={dateOptions}
        selectedKey={task.dueDate ?? '__none__'}
        onSelect={(key) => setDue(key === '__none__' ? null : key)}
        onClose={() => setDatePickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: L.canvas,
  },
  workButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    backgroundColor: L.accent,
    borderRadius: R.md,
  },
  workButtonPressed: {
    backgroundColor: L.accentPressed,
  },
  workButtonText: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
    fontSize: 13,
  },
  metaRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    backgroundColor: L.surface,
  },
  pressedRow: {
    backgroundColor: L.pressed,
  },
  metaText: {
    flexShrink: 1,
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  projectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  orderCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  safeArea: {
    flex: 1,
    minWidth: 0,
  },
  flex: {
    flex: 1,
    minWidth: 0,
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    gap: 14,
    maxWidth: 720,
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
    minWidth: 0,
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 16,
    lineHeight: 22,
  },
  titleInput: {
    padding: 0,
  },
  titleDone: {
    color: L.tertiary,
    textDecorationLine: 'line-through',
  },
  chipRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    maxWidth: '100%',
    minHeight: 44,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    flexShrink: 1,
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
    minWidth: 0,
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
  backHome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    height: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  backHomeText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
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
    minWidth: 0,
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
