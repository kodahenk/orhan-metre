import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects } from '@/features/projects/projects-context';
import { useSessions } from '@/features/sessions/sessions-context';
import { formatDate, formatDuration, parseDateKey } from '@/features/timer/format';
import { useTimer } from '@/features/timer/timer-context';
import { Button, Checkbox, HeaderIconButton, PickerSheet, ScreenHeader } from '@/features/ui/components';
import { AddRow, FieldRow, SectionTitle } from '@/features/ui/compact';
import { Pagination, SearchField } from '@/features/ui/collection';
import { pageWindow, searchText } from '@/features/ui/collection-utils';
import { DateSheet } from '@/features/ui/date-sheet';
import { confirmAction } from '@/features/ui/dialogs';
import { FormScrollView } from '@/features/ui/form-scroll-view';
import { FormSheet } from '@/features/ui/form-sheet';
import { useDraftSave } from '@/features/ui/use-draft-save';
import { F, L, R } from '@/features/ui/theme';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { projects, tasks, updateTask, deleteTask, moveTask, addChecklistItem, updateChecklistItem, deleteChecklistItem, moveChecklistItem } = useProjects();
  // Old deep links resolve to the owning task after migration.
  const task = tasks.find((t) => t.id === id || t.legacyTaskIds.includes(id));
  const project = projects.find((p) => p.id === task?.projectId);
  const { sessions } = useSessions();
  const timer = useTimer();
  const [title, setTitle] = useState(task?.title ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  const [newItem, setNewItem] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [projectOpen, setProjectOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [itemMenu, setItemMenu] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [draftId, setDraftId] = useState(task?.id);
  if (draftId !== task?.id) {
    setDraftId(task?.id); setTitle(task?.title ?? ''); setNote(task?.note ?? '');
    setNewItem(''); setSearch(''); setPage(0); setItemMenu(null); setEditingItem(null);
  }
  const titleSave = useDraftSave(task?.id);
  const noteSave = useDraftSave(task?.id);
  const checklist = useMemo(() => [...(task?.checklist ?? [])].sort((a, b) => a.orderIndex - b.orderIndex), [task?.checklist]);
  const filtered = checklist.filter((item) => searchText(item.title).includes(searchText(search)));
  const window = pageWindow(filtered.length, page);
  const done = checklist.filter((i) => i.done).length;
  const totalSeconds = useMemo(() => {
    const ids = new Set([task?.id, ...(task?.legacyTaskIds ?? [])]);
    return sessions.reduce((sum, s) => ids.has(s.taskId ?? undefined) ? sum + s.workSeconds : sum, 0);
  }, [sessions, task?.id, task?.legacyTaskIds]);
  const menuItem = checklist.find((i) => i.id === itemMenu);

  if (!task || !project) return <SafeAreaView style={styles.screen}>
    <ScreenHeader title="Görev bulunamadı" left={<HeaderIconButton icon="arrow-left" label="Geri" onPress={() => router.back()} />} />
    <View style={styles.content}><Button label="Projelere dön" onPress={() => router.replace('/projects')} /></View>
  </SafeAreaView>;

  const addItem = () => {
    if (!newItem.trim()) return;
    addChecklistItem(task.id, newItem); setNewItem(''); setSearch('');
    setPage(Math.floor(checklist.length / 30));
  };
  const startFocus = () => {
    if (timer.status !== 'idle') { router.push('/'); return; }
    titleSave.flush(); noteSave.flush();
    timer.setPendingProject(project.id); timer.setPendingTask(task.id);
    router.push('/');
  };
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <ScreenHeader title="Görev" left={<HeaderIconButton icon="arrow-left" label="Geri" onPress={() => router.back()} />}
      right={<HeaderIconButton icon="trash-2" label="Görevi sil" onPress={() => confirmAction({ title: 'Görevi sil', message: 'Görev ve kontrol listesi silinecek. Çalışma kayıtların korunur.', onConfirm: () => { deleteTask(task.id); router.back(); } })} />} />
    <FormScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Checkbox checked={task.done} label="Görevi tamamla" onPress={() => updateTask(task.id, { done: !task.done })} />
        <TextInput accessibilityLabel="Görev adı" value={title} multiline maxLength={160} placeholder="Görev adı"
          style={[styles.title, task.done && styles.done]} onChangeText={(text) => { setTitle(text); titleSave.schedule(() => { if (text.trim()) updateTask(task.id, { title: text.trim() }); }); }} />
      </View>
      <View>
        <FieldRow icon="folder" label="Proje" value={project.name} onPress={() => setProjectOpen(true)} />
        <FieldRow icon="calendar" label="Tarih" value={task.dueDate ? formatDate(parseDateKey(task.dueDate)) : 'Tarih ekle'} onPress={() => setDateOpen(true)} />
      </View>
      <View>
        <SectionTitle title="Not" detail="Otomatik kaydedilir" />
        <TextInput accessibilityLabel="Görev notu" style={styles.note} multiline value={note} placeholder="Gerekli bilgileri ekle…" placeholderTextColor={L.tertiary}
          onChangeText={(text) => { setNote(text); noteSave.schedule(() => updateTask(task.id, { note: text })); }} />
      </View>
      <View>
        <SectionTitle title="Kontrol listesi" detail={`${done}/${checklist.length}`} />
        {checklist.length > 0 && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: checklist.length, now: done }} style={styles.track}><View style={[styles.progress, { width: `${done / checklist.length * 100}%` }]} /></View>}
        {checklist.length > 8 && <SearchField value={search} onChangeText={(text) => { setSearch(text); setPage(0); }} placeholder="Maddelerde ara…" />}
        {filtered.slice(window.start, window.end).map((item) => <View key={item.id} style={styles.checkRow}>
          <Checkbox checked={item.done} label={item.title} onPress={() => updateChecklistItem(task.id, item.id, { done: !item.done })} />
          <Pressable style={styles.flex} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.done ? 'tamamlandı' : 'açık'}`} onPress={() => updateChecklistItem(task.id, item.id, { done: !item.done })}>
            <Text style={[styles.itemTitle, item.done && styles.done]}>{item.title}</Text>
            {!!item.note && <Text numberOfLines={1} style={styles.itemNote}>{item.note}</Text>}
            {!!item.dueDate && <Text style={styles.itemNote}>{item.dueDate}</Text>}
          </Pressable>
          <HeaderIconButton icon="more-horizontal" label={`${item.title} işlemleri`} onPress={() => setItemMenu(item.id)} />
        </View>)}
        {!filtered.length && <Text style={styles.hint}>{search ? 'Eşleşen madde yok.' : 'Görevi bitirmek için gereken adımları ekle.'}</Text>}
        <Pagination total={filtered.length} page={window.page} onChange={setPage} />
        <AddRow value={newItem} onChange={setNewItem} onSubmit={addItem} placeholder="Kontrol maddesi ekle" />
        <Text style={styles.hint}>Maddeleri işaretlemek görevi otomatik tamamlamaz.</Text>
      </View>
    </FormScrollView>
    <View style={styles.footer}>
      <Text style={styles.footnote}>{formatDuration(totalSeconds)} çalışma</Text>
      <Button icon="play" label={timer.status === 'idle' ? 'Bu göreve odaklan' : 'Sayaca dön'} variant="primary" onPress={startFocus} />
    </View>
    <DateSheet visible={dateOpen} value={task.dueDate} onClose={() => setDateOpen(false)} onSelect={(dueDate) => updateTask(task.id, { dueDate })} />
    <PickerSheet visible={projectOpen} title="Projeyi değiştir" options={projects.map((p) => ({ key: p.id, label: p.name, color: p.color }))} selectedKey={project.id} onClose={() => setProjectOpen(false)} onSelect={(projectId) => moveTask(task.id, projectId)} />
    <PickerSheet visible={!!menuItem} title={menuItem?.title ?? 'Kontrol maddesi'} onClose={() => setItemMenu(null)} options={[
      { key: 'edit', label: 'Düzenle' },
      ...(menuItem?.id !== checklist[0]?.id ? [{ key: 'up', label: 'Yukarı taşı' }] : []),
      ...(menuItem?.id !== checklist[checklist.length - 1]?.id ? [{ key: 'down', label: 'Aşağı taşı' }] : []),
      { key: 'delete', label: 'Maddeyi sil' },
    ]} onSelect={(key) => {
      if (!menuItem) return;
      if (key === 'edit') { setItemTitle(menuItem.title); setItemNote(menuItem.note); setEditingItem(menuItem.id); }
      else if (key === 'delete') confirmAction({ title: 'Maddeyi sil', message: menuItem.title, onConfirm: () => deleteChecklistItem(task.id, menuItem.id) });
      else moveChecklistItem(task.id, menuItem.id, key === 'up' ? -1 : 1);
    }} />
    <FormSheet visible={!!editingItem} title="Maddeyi düzenle" onClose={() => setEditingItem(null)}>
      <TextInput accessibilityLabel="Madde adı" style={styles.editInput} multiline value={itemTitle} onChangeText={setItemTitle} />
      <TextInput accessibilityLabel="Madde notu" style={styles.editInput} multiline value={itemNote} onChangeText={setItemNote} placeholder="Not (isteğe bağlı)" />
      <Button label="Kaydet" variant="primary" disabled={!itemTitle.trim()} onPress={() => { if (editingItem) updateChecklistItem(task.id, editingItem, { title: itemTitle, note: itemNote }); setEditingItem(null); }} />
    </FormSheet>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: L.surface },
  flex: { flex: 1, minWidth: 0 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 16, gap: 16, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  title: { flex: 1, minWidth: 0, fontFamily: F.uiSemi, fontSize: 20, lineHeight: 28, color: L.ink, paddingVertical: 8 },
  done: { color: L.tertiary, textDecorationLine: 'line-through' },
  note: { minHeight: 64, maxHeight: 160, fontFamily: F.ui, fontSize: 14, lineHeight: 21, color: L.ink2, textAlignVertical: 'top', padding: 10, backgroundColor: L.canvas, borderRadius: R.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.hairline },
  itemTitle: { fontFamily: F.ui, fontSize: 14, color: L.ink, paddingVertical: 4 },
  itemNote: { fontFamily: F.ui, fontSize: 12, color: L.tertiary, paddingBottom: 4 },
  track: { height: 3, backgroundColor: L.hairline, marginBottom: 8 },
  progress: { height: 3, backgroundColor: L.accent },
  hint: { fontFamily: F.ui, fontSize: 12, color: L.tertiary, lineHeight: 18, paddingVertical: 10 },
  footer: { borderTopWidth: 1, borderTopColor: L.hairline, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  footnote: { fontFamily: F.ui, fontSize: 12, color: L.tertiary },
  editInput: { minHeight: 44, borderWidth: 1, borderColor: L.border, borderRadius: R.md, padding: 10, fontFamily: F.ui, color: L.ink, fontSize: 14 },
});
