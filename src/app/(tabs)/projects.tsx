import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects, type Project } from '@/features/projects/projects-context';
import { useSessions } from '@/features/sessions/sessions-context';
import { formatDuration, startOfWeek } from '@/features/timer/format';
import { Button, HeaderIconButton, EmptyState, ScreenIntro, PickerSheet, ScreenHeader, type PickerOption } from '@/features/ui/components';
import { groupBy, searchText } from '@/features/ui/collection-utils';
import { FormSheet } from '@/features/ui/form-sheet';
import { SearchField } from '@/features/ui/collection';
import { F, L, R } from '@/features/ui/theme';

const NO_PARENT_KEY = '__root__';

export default function ProjectsScreen() {
  const router = useRouter();
  const { projects, tasks, addProject, moveProject } = useProjects();
  const { sessions } = useSessions();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Bu hafta proje başına çalışma süresi; üst proje = kendi + altları.
  const weekSeconds = useMemo(() => {
    const weekStart = startOfWeek(new Date()).getTime();
    const per = new Map<string, number>();
    for (const s of sessions) {
      if (s.startedAt < weekStart || !s.projectId) continue;
      per.set(s.projectId, (per.get(s.projectId) ?? 0) + s.workSeconds);
    }
    return per;
  }, [sessions]);

  const taskCounts = useMemo(() => {
    const per = new Map<string, { open: number; total: number }>();
    for (const t of tasks) {
      if (t.parentTaskId) continue; // özet yalnız üst düzey görevleri sayar
      const c = per.get(t.projectId) ?? { open: 0, total: 0 };
      c.total += 1;
      if (!t.done) c.open += 1;
      per.set(t.projectId, c);
    }
    return per;
  }, [tasks]);

  const topLevel = useMemo(
    () => projects.filter((p) => !p.parentId).sort((a, b) => a.orderIndex - b.orderIndex),
    [projects],
  );
  const query = searchText(useDeferredValue(search));
  const childMap = useMemo(() => groupBy([...projects].sort((a, b) => a.orderIndex - b.orderIndex), (p) => p.parentId), [projects]);
  const childrenOf = (id: string) => childMap.get(id) ?? [];
  const rows = useMemo(() => {
    const result: { project: Project; isChild: boolean }[] = [];
    for (const parent of topLevel) {
      const children = childMap.get(parent.id) ?? [];
      const parentMatches = searchText(parent.name).includes(query);
      const matchingChildren = query && !parentMatches ? children.filter((c) => searchText(c.name).includes(query)) : children;
      if (!parentMatches && matchingChildren.length === 0) continue;
      result.push({ project: parent, isChild: false });
      if (query || !collapsed.has(parent.id)) {
        for (const child of matchingChildren) result.push({ project: child, isChild: true });
      }
    }
    return result;
  }, [topLevel, childMap, query, collapsed]);

  const rollupSeconds = (p: Project) =>
    (weekSeconds.get(p.id) ?? 0) +
    childrenOf(p.id).reduce((sum, c) => sum + (weekSeconds.get(c.id) ?? 0), 0);

  const submit = () => {
    const name = newName.trim();
    if (!name) return;
    addProject(name, newParentId);
    setCreateOpen(false);
    setSearch('');
    setNewName('');
    setNewParentId(null);
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const parentOptions: PickerOption[] = [
    { key: NO_PARENT_KEY, label: 'Yok (üst düzey proje)' },
    ...topLevel.map((p) => ({ key: p.id, label: p.name, color: p.color })),
  ];

  const renderRow = (project: Project, isChild: boolean, hasSeparator: boolean) => {
    const counts = taskCounts.get(project.id);
    const seconds = isChild ? (weekSeconds.get(project.id) ?? 0) : rollupSeconds(project);
    const children = isChild ? [] : childrenOf(project.id);
    const goal = project.goal;
    return (
      <View style={[styles.row, isChild && styles.rowChild, hasSeparator && styles.rowSeparator]}>
        <View style={[styles.colorDot, { backgroundColor: project.color }]} />
        <Pressable style={styles.flex} accessibilityRole="button" accessibilityLabel={`${project.name} projesini aç`} onPress={() => router.push(`/project/${project.id}`)}>
          <Text numberOfLines={2} style={styles.rowTitle} maxFontSizeMultiplier={1.3}>
            {project.name}
          </Text>
          <View style={styles.metaRow}>
            {seconds > 0 && (
              <View style={styles.metaChip}>
                <Feather name="clock" size={10} color={L.tertiary} />
                <Text style={styles.metaText} maxFontSizeMultiplier={1.2}>
                  {formatDuration(seconds)}
                </Text>
              </View>
            )}
            {counts && counts.total > 0 && (
              <Text style={styles.metaText} maxFontSizeMultiplier={1.2}>
                {counts.total - counts.open}/{counts.total} görev
              </Text>
            )}
            {children.length > 0 && (
              <Text style={styles.metaText} maxFontSizeMultiplier={1.2}>
                {children.length} alt proje
              </Text>
            )}
            {goal && (
              <Feather name="target" size={11} color={L.tertiary} />
            )}
          </View>
        </Pressable>
        {children.length > 0 && (
          <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Alt projeleri aç veya kapat" onPress={(event) => { event.stopPropagation(); toggleCollapse(project.id); }}>
            <Feather
              name={collapsed.has(project.id) ? 'chevron-down' : 'chevron-up'}
              size={18}
              color={L.tertiary}
            />
          </Pressable>
        )}
        <HeaderIconButton icon="more-horizontal" label={`${project.name} işlemleri`} onPress={() => setActionId(project.id)} />
        <Feather name="chevron-right" size={20} color={L.tertiary} />
      </View>
    );
  };


  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Projeler" subtitle="Hedeflerin için düzenli bir çalışma alanı" right={<HeaderIconButton icon="plus" label="Yeni proje oluştur" onPress={() => setCreateOpen(true)} />} />
        <View style={styles.listContainer}>
          <FlashList data={rows} keyExtractor={(row) => row.project.id}
            maintainVisibleContentPosition={{ disabled: true }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            renderItem={({ item, index }) => renderRow(item.project, item.isChild, index > 0)}
            ListHeaderComponent={<View style={styles.listHeader}>
              <ScreenIntro eyebrow="ÇALIŞMA ALANIN" title="Projelerin, tek bir yerde." description={`${projects.length} proje · ${tasks.filter((t) => !t.done).length} açık görev`} />
              {projects.length > 0 && <SearchField value={search} onChangeText={setSearch} placeholder="Projelerinde ara…" />}
              {!!query && <Text style={styles.metaText}>{rows.length} sonuç</Text>}
            </View>}
            ListEmptyComponent={<EmptyState icon={query ? 'search' : 'folder-plus'} title={query ? 'Proje bulunamadı' : 'İlk projeni oluştur'}
              description={query ? 'Başka bir kelime dene veya aramayı temizle.' : 'Görevlerini ve odak oturumlarını bir proje altında düzenle.'}
              action={<Button label={query ? 'Aramayı temizle' : 'Proje oluştur'} onPress={() => query ? setSearch('') : setCreateOpen(true)} />} />}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} />
        </View>
      </SafeAreaView>

      <FormSheet visible={createOpen} title="Yeni proje" onClose={() => setCreateOpen(false)}>
            <View style={styles.addCard}>
              <Text style={{ fontFamily: F.uiSemi, fontSize: 15, color: L.ink }}>Yeni proje oluştur</Text>
              <View style={styles.addRow}>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Yeni proje adı"
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Yeni proje adı"
                  placeholderTextColor={L.tertiary}
                  onSubmitEditing={submit}
                  returnKeyType="done"
                  maxLength={40}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Proje oluştur"
                  accessibilityState={{ disabled: !newName.trim() }}
                  disabled={!newName.trim()}
                  style={({ pressed }) => [styles.addButton, !newName.trim() && { backgroundColor: L.borderActive }, pressed && styles.addButtonPressed]}
                  onPress={submit}
                >
                  <Feather name="plus" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [styles.parentChip, pressed && styles.rowPressed]}
                onPress={() => { setCreateOpen(false); setParentPickerOpen(true); }}
              >
                <Feather name="corner-down-right" size={13} color={L.ink2} />
                <Text style={styles.parentChipText} maxFontSizeMultiplier={1.2}>
                  Üst proje:{' '}
                  {newParentId
                    ? (projects.find((p) => p.id === newParentId)?.name ?? 'Yok')
                    : 'Yok'}
                </Text>
                <Feather name="chevron-down" size={14} color={L.tertiary} />
              </Pressable>
            </View>
      </FormSheet>
      <PickerSheet visible={actionId != null} title="Proje işlemleri" options={[{ key: 'up', label: 'Yukarı taşı' }, { key: 'down', label: 'Aşağı taşı' }]} onClose={() => setActionId(null)} onSelect={(key) => { if (actionId) moveProject(actionId, key === 'up' ? -1 : 1); }} />
      <PickerSheet
        visible={parentPickerOpen}
        title="Üst proje"
        options={parentOptions}
        selectedKey={newParentId ?? NO_PARENT_KEY}
        onSelect={(key) => setNewParentId(key === NO_PARENT_KEY ? null : key)}
        onClose={() => { setParentPickerOpen(false); setCreateOpen(true); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  listHeader: { gap: 12, paddingBottom: 16 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48, backgroundColor: L.surface, borderWidth: 1, borderColor: L.border, borderRadius: R.md },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, fontFamily: F.ui, fontSize: 14, color: L.ink },
  screen: {
    flex: 1,
    backgroundColor: L.canvas,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 18,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  row: {
    backgroundColor: L.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    minHeight: 76,
    paddingVertical: 14,
  },
  rowChild: {
    paddingLeft: 30,
    backgroundColor: '#FCFCFC',
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: L.hairline,
  },
  rowPressed: {
    backgroundColor: L.pressed,
  },
  emptyHint: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  orderCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowTitle: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 15,
  },
  metaRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  addCard: {
    padding: 18,
    backgroundColor: L.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: L.hairline,
    gap: 14,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
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
  parentChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  parentChipText: {
    flexShrink: 1,
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
});
