import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GOAL_PERIOD_LABELS, useProjects, type Goal, type GoalPeriod } from '@/features/projects/projects-context';
import { useSessions } from '@/features/sessions/sessions-context';
import { formatDuration, formatShortDate, parseDateKey } from '@/features/timer/format';
import { useTimerSettings } from '@/features/timer/settings-context';
import { useTimer } from '@/features/timer/timer-context';
import { Button, Checkbox, HeaderIconButton, PickerSheet, ScreenHeader } from '@/features/ui/components';
import { AddRow, FieldRow, SectionTitle } from '@/features/ui/compact';
import { Pagination, TaskFilters, useTaskCollection } from '@/features/ui/collection';
import { pageWindow } from '@/features/ui/collection-utils';
import { FormSheet } from '@/features/ui/form-sheet';
import { RowActions } from '@/features/ui/row-actions';
import { confirmAction } from '@/features/ui/dialogs';
import { F, L, PROJECT_COLORS, R } from '@/features/ui/theme';

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { projects, tasks, addTask, updateTask, deleteProject, addProject, renameProject, setProjectColor, setProjectGoal, setProjectPreset, moveTaskOrder } = useProjects();
  const { sessions } = useSessions();
  const { presets } = useTimerSettings();
  const timer = useTimer();
  const project = projects.find((p) => p.id === id);
  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === id).sort((a, b) => a.orderIndex - b.orderIndex), [tasks, id]);
  const children = useMemo(() => projects.filter((p) => p.parentId === id).sort((a, b) => a.orderIndex - b.orderIndex), [projects, id]);
  const collection = useTaskCollection(projectTasks, id);
  const [newTask, setNewTask] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [presetOpen, setPresetOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [metric, setMetric] = useState<Goal['metric']>('hours');
  const [target, setTarget] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('weekly');
  const [childOpen, setChildOpen] = useState(false);
  const [childName, setChildName] = useState('');
  const [childPage, setChildPage] = useState(0);
  const childWindow = pageWindow(children.length, childPage, 5);
  const completed = projectTasks.filter((t) => t.done).length;
  const totalSeconds = useMemo(() => {
    const ids = new Set([id, ...children.map((p) => p.id)]);
    return sessions.reduce((sum, s) => s.projectId && ids.has(s.projectId) ? sum + s.workSeconds : sum, 0);
  }, [sessions, children, id]);
  const goalNumber = Number(target.replace(',', '.'));
  const validGoal = target.trim() !== '' && Number.isFinite(goalNumber) && goalNumber > 0 && (metric === 'hours' || Number.isInteger(goalNumber));

  if (!project) return <SafeAreaView style={styles.screen}><ScreenHeader title="Proje bulunamadı" left={<HeaderIconButton icon="arrow-left" label="Geri" onPress={() => router.back()} />} /></SafeAreaView>;
  const startFocus = (taskId?: string) => {
    if (timer.status === 'idle') { timer.setPendingProject(project.id); timer.setPendingTask(taskId ?? null); }
    router.push('/');
  };
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <ScreenHeader title={project.name} left={<HeaderIconButton icon="arrow-left" label="Geri" onPress={() => router.back()} />} right={<HeaderIconButton icon="more-horizontal" label="Proje işlemleri" onPress={() => setMenuOpen(true)} />} />
    <View style={styles.summary}>
      <View style={styles.flex}><Text style={styles.summaryText}>{projectTasks.length - completed} açık · {completed} tamamlanan</Text><Text style={styles.muted}>{formatDuration(totalSeconds)} çalışma</Text></View>
      <Button icon="play" label={timer.status === 'idle' ? 'Odaklan' : 'Sayaca dön'} onPress={() => startFocus()} variant="primary" />
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {children.length > 0 && <View>
          <SectionTitle title="Alt projeler" detail={String(children.length)} />
          {children.slice(childWindow.start, childWindow.end).map((child) => <FieldRow key={child.id} icon="folder" label="" value={child.name} onPress={() => router.push(`/project/${child.id}`)} />)}
          <Pagination total={children.length} page={childWindow.page} onChange={setChildPage} size={5} />
        </View>}
        <View>
          <SectionTitle title="Görevler" detail={`${collection.total}`} />
          {projectTasks.length > 0 && <TaskFilters collection={collection} />}
          {collection.items.map((task) => <View key={task.id} style={styles.taskRow}>
            <Checkbox checked={task.done} label={task.title} onPress={() => updateTask(task.id, { done: !task.done })} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${task.title} görevini aç`} style={styles.flex} onPress={() => router.push(`/task/${task.id}`)}>
              <Text numberOfLines={2} style={[styles.taskTitle, task.done && styles.done]}>{task.title}</Text>
              {(task.checklist.length > 0 || task.dueDate) && <Text style={styles.muted}>{task.checklist.length > 0 ? `${task.checklist.filter((i) => i.done).length}/${task.checklist.length} madde` : ''}{task.checklist.length > 0 && task.dueDate ? ' · ' : ''}{task.dueDate ? formatShortDate(parseDateKey(task.dueDate)) : ''}</Text>}
            </Pressable>
            <RowActions label={task.title} first={projectTasks[0]?.id === task.id} last={projectTasks[projectTasks.length - 1]?.id === task.id} onMove={(direction) => moveTaskOrder(task.id, direction)} onStart={() => startFocus(task.id)} />
          </View>)}
          {!collection.total && <Text style={styles.empty}>{projectTasks.length ? 'Bu filtreyle eşleşen görev yok.' : 'İlk görevini aşağıdan ekle.'}</Text>}
          <Pagination total={collection.total} page={collection.page} onChange={collection.setPage} />
        </View>
      </ScrollView>
      <View style={styles.composer}><AddRow value={newTask} onChange={setNewTask} placeholder="Yeni görev ekle" onSubmit={() => {
        if (!newTask.trim()) return;
        addTask(project.id, newTask); setNewTask(''); collection.setQuery(''); collection.setStatus('all'); collection.setPage(Math.floor(projectTasks.length / 30));
      }} /></View>
    </KeyboardAvoidingView>
    <PickerSheet visible={menuOpen} title="Proje işlemleri" onClose={() => setMenuOpen(false)} options={[
      { key: 'settings', label: 'Ad ve renk' }, { key: 'notes', label: 'Proje notu' }, { key: 'preset', label: 'Çalışma süresi' }, { key: 'goal', label: 'Hedef' },
      ...(!project.parentId ? [{ key: 'child', label: 'Alt proje ekle' }] : []),
      ...(projects.length > children.length + 1 ? [{ key: 'delete', label: 'Projeyi sil' }] : []),
    ]} onSelect={(key) => {
      if (key === 'settings') { setName(project.name); setColor(project.color); setSettingsOpen(true); }
      if (key === 'notes') router.push(`/project/${project.id}/notes`);
      if (key === 'preset') setPresetOpen(true);
      if (key === 'child') setChildOpen(true);
      if (key === 'goal') { setMetric(project.goal?.metric ?? 'hours'); setTarget(project.goal ? String(project.goal.target) : ''); setPeriod(project.goal?.period ?? 'weekly'); setGoalOpen(true); }
      if (key === 'delete') confirmAction({ title: 'Projeyi sil', message: 'Bu proje, alt projeleri ve görevleri silinecek. Çalışma kayıtların korunur.', onConfirm: () => { deleteProject(project.id); router.back(); } });
    }} />
    <FormSheet visible={settingsOpen} title="Proje bilgileri" onClose={() => setSettingsOpen(false)}>
      <TextInput accessibilityLabel="Proje adı" style={styles.input} value={name} onChangeText={setName} maxLength={80} />
      <View style={styles.colors}>{PROJECT_COLORS.map((value) => <Pressable accessibilityRole="radio" accessibilityLabel={`Renk ${PROJECT_COLORS.indexOf(value) + 1}`} accessibilityState={{ checked: color === value }} key={value} style={styles.swatchButton} onPress={() => setColor(value)}>
        <View style={[styles.swatch, { backgroundColor: value }]}>{color === value && <Feather name="check" size={16} color="#fff" />}</View>
      </Pressable>)}</View>
      <Button label="Kaydet" variant="primary" disabled={!name.trim()} onPress={() => { renameProject(project.id, name); setProjectColor(project.id, color); setSettingsOpen(false); }} />
    </FormSheet>
    <FormSheet visible={childOpen} title="Alt proje ekle" onClose={() => setChildOpen(false)}>
      <AddRow value={childName} onChange={setChildName} placeholder="Alt proje adı" onSubmit={() => { if (!childName.trim()) return; addProject(childName, project.id); setChildName(''); setChildOpen(false); }} />
    </FormSheet>
    <PickerSheet visible={presetOpen} title="Çalışma süresi" options={[{ key: '__global__', label: 'Genel varsayılan' }, ...presets.map((p) => ({ key: p.id, label: p.name, caption: `${p.focusMinutes} dk odak · ${p.reviewMinutes} dk tekrar · ${p.breatheMinutes} dk mola` }))]} selectedKey={project.defaultPresetId ?? '__global__'} onClose={() => setPresetOpen(false)} onSelect={(key) => setProjectPreset(project.id, key === '__global__' ? null : key)} />
    <FormSheet visible={goalOpen} title="Proje hedefi" onClose={() => setGoalOpen(false)}>
      <View style={styles.goalOptions}>{(['hours', 'rounds'] as const).map((value) => <Button key={value} label={value === 'hours' ? 'Saat' : 'Tur'} variant={metric === value ? 'primary' : 'secondary'} onPress={() => setMetric(value)} />)}</View>
      <TextInput accessibilityLabel="Hedef miktarı" style={styles.input} placeholder="Hedef miktarı" keyboardType="decimal-pad" value={target} onChangeText={setTarget} maxLength={6} />
      <View style={styles.goalOptions}>{(Object.keys(GOAL_PERIOD_LABELS) as GoalPeriod[]).map((value) => <Button key={value} label={GOAL_PERIOD_LABELS[value]} variant={period === value ? 'primary' : 'secondary'} onPress={() => setPeriod(value)} />)}</View>
      {!validGoal && !!target && <Text style={styles.error}>Sıfırdan büyük {metric === 'rounds' ? 'bir tam sayı' : 'bir değer'} gir.</Text>}
      <Button label="Hedefi kaydet" variant="primary" disabled={!validGoal} onPress={() => { setProjectGoal(project.id, { metric, target: goalNumber, period }); setGoalOpen(false); }} />
      {project.goal && <Button label="Hedefi kaldır" variant="danger" onPress={() => { setProjectGoal(project.id, null); setGoalOpen(false); }} />}
    </FormSheet>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: L.surface }, flex: { flex: 1, minWidth: 0 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: L.hairline },
  summaryText: { fontFamily: F.uiMed, fontSize: 12, color: L.ink, marginBottom: 3 },
  muted: { fontFamily: F.ui, fontSize: 11, color: L.tertiary, marginTop: 3 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 12, paddingBottom: 20, gap: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.hairline },
  taskTitle: { fontFamily: F.uiMed, fontSize: 14, lineHeight: 20, color: L.ink, paddingVertical: 3 },
  done: { color: L.tertiary, textDecorationLine: 'line-through' },
  empty: { fontFamily: F.ui, fontSize: 13, color: L.tertiary, paddingVertical: 24, textAlign: 'center' },
  composer: { padding: 12, borderTopWidth: 1, borderTopColor: L.hairline },
  input: { minHeight: 44, borderWidth: 1, borderColor: L.border, borderRadius: R.md, padding: 10, color: L.ink, fontFamily: F.ui, fontSize: 14 },
  colors: { flexDirection: 'row', flexWrap: 'wrap' },
  swatchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 26, height: 26, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },
  goalOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { fontFamily: F.ui, fontSize: 12, color: L.danger },
});
