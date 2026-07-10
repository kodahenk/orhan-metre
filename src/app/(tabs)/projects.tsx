import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

import { useProjects, type Project } from '@/features/projects/projects-context';
import { useSessions } from '@/features/sessions/sessions-context';
import { formatDuration, startOfWeek } from '@/features/timer/format';
import { PickerSheet, ScreenHeader, type PickerOption } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

const NO_PARENT_KEY = '__root__';

export default function ProjectsScreen() {
  const router = useRouter();
  const { projects, tasks, addProject } = useProjects();
  const { sessions } = useSessions();
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
  const childrenOf = (id: string) =>
    projects.filter((p) => p.parentId === id).sort((a, b) => a.orderIndex - b.orderIndex);

  const rollupSeconds = (p: Project) =>
    (weekSeconds.get(p.id) ?? 0) +
    childrenOf(p.id).reduce((sum, c) => sum + (weekSeconds.get(c.id) ?? 0), 0);

  const submit = () => {
    const name = newName.trim();
    if (!name) return;
    addProject(name, newParentId);
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
      <Pressable
        key={project.id}
        style={({ pressed }) => [
          styles.row,
          isChild && styles.rowChild,
          hasSeparator && styles.rowSeparator,
          pressed && styles.rowPressed,
        ]}
        onPress={() => router.push(`/project/${project.id}`)}
      >
        <View style={[styles.colorDot, { backgroundColor: project.color }]} />
        <View style={styles.flex}>
          <Text style={styles.rowTitle} maxFontSizeMultiplier={1.3}>
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
        </View>
        {children.length > 0 && (
          <Pressable hitSlop={10} onPress={() => toggleCollapse(project.id)}>
            <Feather
              name={collapsed.has(project.id) ? 'chevron-down' : 'chevron-up'}
              size={18}
              color={L.tertiary}
            />
          </Pressable>
        )}
        <Feather name="chevron-right" size={20} color={L.tertiary} />
      </Pressable>
    );
  };

  let renderedAny = false;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Projeler" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              {topLevel.map((parent) => {
                const rows = [renderRow(parent, false, renderedAny)];
                renderedAny = true;
                if (!collapsed.has(parent.id)) {
                  for (const child of childrenOf(parent.id)) {
                    rows.push(renderRow(child, true, true));
                  }
                }
                return rows;
              })}
            </View>

            {/* Yeni proje */}
            <View style={styles.addCard}>
              <View style={styles.addRow}>
                <TextInput
                  style={styles.input}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Yeni proje adı"
                  placeholderTextColor={L.tertiary}
                  onSubmitEditing={submit}
                  returnKeyType="done"
                  maxLength={40}
                />
                <Pressable
                  style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                  onPress={submit}
                >
                  <Feather name="plus" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [styles.parentChip, pressed && styles.rowPressed]}
                onPress={() => setParentPickerOpen(true)}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PickerSheet
        visible={parentPickerOpen}
        title="Üst proje"
        options={parentOptions}
        selectedKey={newParentId ?? NO_PARENT_KEY}
        onSelect={(key) => setNewParentId(key === NO_PARENT_KEY ? null : key)}
        onClose={() => setParentPickerOpen(false)}
      />
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
  content: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    maxWidth: 560,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    minHeight: 46,
    paddingVertical: 6,
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
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowTitle: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  metaRow: {
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
    gap: 10,
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
  parentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    height: 32,
    paddingHorizontal: 10,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  parentChipText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
});
