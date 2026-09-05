import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  GOAL_PERIOD_LABELS,
  taskPathLabel,
  useProjects,
  type Project,
} from '@/features/projects/projects-context';
import { useSessions, type WorkSession } from '@/features/sessions/sessions-context';
import { useTimer } from '@/features/timer/timer-context';
import {
  addDays,
  dateKey,
  formatDuration,
  MONTHS,
  startOfMonth,
  startOfToday,
  startOfWeek,
  startOfYear,
  WEEKDAYS,
  WEEKDAYS_SHORT,
} from '@/features/timer/format';
import {
  EmptyState,
  Button,
  ScreenIntro,
  HeaderIconButton,
  PickerSheet,
  ScreenHeader,
  type PickerOption,
} from '@/features/ui/components';
import { confirmAction } from '@/features/ui/dialogs';
import { Pagination, SearchField } from '@/features/ui/collection';
import { groupBy, pageWindow, searchText } from '@/features/ui/collection-utils';
import { F, L, R } from '@/features/ui/theme';

const CHART_HEIGHT = 120;

function sumWork(sessions: WorkSession[], from: number, to = Infinity) {
  let seconds = 0;
  let count = 0;
  let rounds = 0;
  let breatheSeconds = 0;
  for (const s of sessions) {
    if (s.startedAt >= from && s.startedAt < to) {
      seconds += s.workSeconds;
      count += 1;
      rounds += s.completedRounds;
      breatheSeconds += s.breakSeconds;
    }
  }
  return { seconds, count, rounds, breatheSeconds };
}

function goalWindowStart(period: 'weekly' | 'monthly' | 'yearly' | 'total') {
  if (period === 'weekly') return startOfWeek(new Date()).getTime();
  if (period === 'monthly') return startOfMonth().getTime();
  if (period === 'yearly') return startOfYear().getTime();
  return 0;
}

export default function ReportsScreen() {
  const router = useRouter();
  const { sessions: allSessions, deleteSession, updateSession } = useSessions();
  const timer = useTimer();
  const { projects, tasks } = useProjects();
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  // Kayıt düzenleme: satıra dokunmak eylem listesini açar (proje/görev/sil).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionSheet, setActionSheet] = useState<'none' | 'actions' | 'project' | 'task'>('none');
  // Rapor filtresi: yalnız seçili projenin (ve alt projelerinin) kayıtları.
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const deferredHistoryQuery = useDeferredValue(historyQuery);
  const [projectPage, setProjectPage] = useState(0);
  const [goalPage, setGoalPage] = useState(0);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Filtre kapsamı: seçili proje + alt projeleri (raporun her yerinde geçerli).
  const filterScope = useMemo(() => {
    if (!filterProjectId) return null;
    const ids = new Set([filterProjectId]);
    for (const pr of projects) if (pr.parentId === filterProjectId) ids.add(pr.id);
    return ids;
  }, [filterProjectId, projects]);
  const sessions = useMemo(
    () => (filterScope ? allSessions.filter((s) => s.projectId && filterScope.has(s.projectId)) : allSessions),
    [allSessions, filterScope],
  );
  const filterProject = filterProjectId ? projectById.get(filterProjectId) : null;

  const filterOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: '__all__', label: 'Tüm projeler' }];
    for (const parent of projects.filter((pr) => !pr.parentId)) {
      options.push({ key: parent.id, label: parent.name, color: parent.color });
      for (const child of projects.filter((pr) => pr.parentId === parent.id)) {
        options.push({ key: child.id, label: child.name, color: child.color, indent: true });
      }
    }
    return options;
  }, [projects]);

  const editing = editingId ? allSessions.find((x) => x.id === editingId) ?? null : null;

  // Düzenlenen kaydın projesine ait görevler (alt projeler dahil).
  const editingTaskOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: '__no_task__', label: 'Görevsiz' }];
    if (!editing?.projectId) return options;
    const scope = new Set([editing.projectId]);
    for (const pr of projects) if (pr.parentId === editing.projectId) scope.add(pr.id);
    for (const t of tasks.filter((t) => scope.has(t.projectId)).sort((a, b) => a.orderIndex - b.orderIndex)) {
      options.push({ key: t.id, label: t.title, indent: !!t.parentTaskId });
    }
    return options;
  }, [editing, tasks, projects]);

  // Raporu metin olarak dışa aktar (yedek/paylaşım).
  const shareReport = async () => {
    const lines = [...sessions]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((x) => {
        const pr = x.projectId ? projectById.get(x.projectId)?.name ?? 'Silinmiş proje' : 'Projesiz';
        const tk = taskPathLabel(tasks, x.taskId);
        const d = new Date(x.startedAt);
        return `${dateKey(d)} ${clockOf(x.startedAt)} · ${pr}${tk ? ' · ' + tk : ''} · ${formatDuration(x.workSeconds)} · ${x.completedRounds} tur`;
      });
    await Share.share({
      title: 'orhan-metre raporu',
      message: [`Toplam ${sessions.length} kayıt`, '', ...lines].join('\n'),
    }).catch(() => {});
  };

  // Kazara kayıtlar (ör. "Bitir"e basmayı unutmak) raporu kalıcı bozar; satıra
  // uzun basmak silme onayı açar.
  const confirmDeleteSession = (id: string, label: string) =>
    confirmAction({
      title: 'Kaydı sil',
      message: `${label} kaydı silinecek. Bu işlem geri alınamaz.`,
      onConfirm: () => {
        deleteSession(id);
        // Ana ekrandaki "Kaydedildi: …" özeti silinen kaydı göstermeye devam etmesin.
        timer.clearLastSaved();
      },
    });

  const today = sumWork(sessions, startOfToday().getTime());
  const week = sumWork(sessions, startOfWeek(new Date()).getTime());
  const month = sumWork(sessions, startOfMonth().getTime());

  // Son 7 gün: bugün en sağda.
  const last7 = useMemo(() => {
    const days: { label: string; date: Date; seconds: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(startOfToday(), -i);
      const from = d.getTime();
      const to = addDays(d, 1).getTime();
      days.push({
        label: WEEKDAYS_SHORT[d.getDay()],
        date: d,
        seconds: sumWork(sessions, from, to).seconds,
      });
    }
    return days;
  }, [sessions]);
  const maxDay = Math.max(...last7.map((d) => d.seconds), 1);

  // Bu hafta projelere göre; üst proje = kendi + alt projeleri.
  const weekByProject = useMemo(() => {
    const weekStart = startOfWeek(new Date()).getTime();
    const perProject = new Map<string, number>(); // projectId ('' = projesiz/silinmiş) → sn
    for (const s of sessions) {
      if (s.startedAt < weekStart) continue;
      const key = s.projectId && projectById.has(s.projectId) ? s.projectId : '';
      perProject.set(key, (perProject.get(key) ?? 0) + s.workSeconds);
    }
    type Row = { project: Project | null; seconds: number; children: { project: Project; seconds: number }[] };
    const rows: Row[] = [];
    const projectChildren = groupBy(projects, (p) => p.parentId);
    for (const parent of projects.filter((p) => !p.parentId)) {
      const own = perProject.get(parent.id) ?? 0;
      const children = (projectChildren.get(parent.id) ?? [])
        .map((child) => ({ project: child, seconds: perProject.get(child.id) ?? 0 }))
        .filter((c) => c.seconds > 0);
      const total = own + children.reduce((sum, c) => sum + c.seconds, 0);
      if (total > 0) rows.push({ project: parent, seconds: total, children });
    }
    const untracked = perProject.get('') ?? 0;
    if (untracked > 0) rows.push({ project: null, seconds: untracked, children: [] });
    rows.sort((a, b) => b.seconds - a.seconds);
    const weekTotal = rows.reduce((sum, r) => sum + r.seconds, 0);
    return { rows, weekTotal };
  }, [sessions, projects, projectById]);

  // Hedefler.
  const goalRows = useMemo(() => {
    return projects
      .filter((p) => p.goal && (!filterScope || filterScope.has(p.id)))
      .map((p) => {
        const goal = p.goal!;
        const from = goalWindowStart(goal.period);
        const childIds = projects.filter((c) => c.parentId === p.id).map((c) => c.id);
        const relevant = sessions.filter(
          (s) =>
            s.startedAt >= from &&
            (s.projectId === p.id || (s.projectId != null && childIds.includes(s.projectId))),
        );
        const current =
          goal.metric === 'hours'
            ? relevant.reduce((sum, s) => sum + s.workSeconds, 0) / 3600
            : relevant.reduce((sum, s) => sum + s.completedRounds, 0);
        const pct = Math.round((current / goal.target) * 100);
        return { project: p, goal, current, pct };
      });
  }, [projects, sessions, filterScope]);

  // Geçmiş: en yeni önce, güne gruplu. Varsayılan 20 kayıt; "daha fazla" ile
  // sayfa sayfa açılır — eski kayıtlar erişilemez (ve silinemez) kalmasın.
  const [historyPage, setHistoryPage] = useState(0);
  const searchableHistory = useMemo(() => {
    const needle = searchText(deferredHistoryQuery);
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    return sessions.filter((session) => !needle || searchText(`${projectById.get(session.projectId ?? '')?.name ?? 'Projesiz'} ${taskById.get(session.taskId ?? '')?.title ?? ''} ${dateKey(new Date(session.startedAt))}`).includes(needle))
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [sessions, deferredHistoryQuery, tasks, projectById]);
  const historyWindow = pageWindow(searchableHistory.length, historyPage, 20);
  const projectWindow = pageWindow(weekByProject.rows.length, projectPage, 10);
  const goalWindow = pageWindow(goalRows.length, goalPage, 10);
  const history = useMemo(() => {
    const recent = searchableHistory.slice(historyWindow.start, historyWindow.end);
    const groups: { dayKey: string; label: string; total: number; items: WorkSession[] }[] = [];
    const todayKey = dateKey(new Date());
    const yesterdayKey = dateKey(addDays(new Date(), -1));
    for (const s of recent) {
      const d = new Date(s.startedAt);
      const key = dateKey(d);
      let group = groups.find((g) => g.dayKey === key);
      if (!group) {
        const label =
          key === todayKey
            ? 'Bugün'
            : key === yesterdayKey
              ? 'Dün'
              : `${d.getDate()} ${MONTHS[d.getMonth()]} ${WEEKDAYS[d.getDay()]}`;
        group = { dayKey: key, label, total: 0, items: [] };
        groups.push(group);
      }
      group.total += s.workSeconds;
      group.items.push(s);
    }
    return groups;
  }, [searchableHistory, historyWindow.start, historyWindow.end]);

  const clockOf = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const hasAny = sessions.length > 0;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Raporlar"
          subtitle="Emeğini görünür kılan istatistikler"
          right={<HeaderIconButton icon="share" onPress={shareReport} />}
        />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <ScreenIntro eyebrow="İLERLEMEN" title="Her odak anı değerli." description="Çalışma süreni, tamamladığın turları ve hedeflerine ne kadar yaklaştığını gör." />
          {/* Proje filtresi: tüm kartlar, grafik, hedefler ve geçmiş bu kapsamı izler. */}
          <Pressable
            style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
            onPress={() => setFilterOpen(true)}
          >
            {filterProject ? (
              <View style={[styles.projectDotSmall, { backgroundColor: filterProject.color }]} />
            ) : (
              <Feather name="filter" size={13} color={L.ink2} />
            )}
            <Text style={styles.filterChipText} maxFontSizeMultiplier={1.2}>
              {filterProject ? filterProject.name : 'Tüm projeler'}
            </Text>
            <Feather name="chevron-down" size={14} color={L.tertiary} />
          </Pressable>
          {!hasAny && <EmptyState icon="bar-chart-2" title={filterProject ? 'Bu projede henüz oturum yok' : 'İlerlemen burada başlayacak'} description="İlk odak oturumunu tamamladığında çalışma sürelerin ve günlük dağılımın burada görünecek." action={<Button label="Odaklanmaya başla" icon="play" variant="primary" onPress={() => router.push('/')} />} />}

          {(hasAny || goalRows.length > 0) && (
            <>
              {/* İstatistik kartları */}
              <View style={styles.tileRow}>
                {[
                  { label: 'Bugün', data: today },
                  { label: 'Bu Hafta', data: week },
                  { label: 'Bu Ay', data: month },
                ].map((tile) => (
                  <View key={tile.label} style={styles.tile}>
                    <Text style={styles.tileLabel} maxFontSizeMultiplier={1.2}>
                      {tile.label}
                    </Text>
                    <Text style={styles.tileValue} maxFontSizeMultiplier={1.1}>
                      {formatDuration(tile.data.seconds)}
                    </Text>
                    <Text style={styles.tileMeta} maxFontSizeMultiplier={1.2}>
                      {tile.data.rounds} tur
                      {tile.data.breatheSeconds > 0
                        ? ` · ${formatDuration(tile.data.breatheSeconds)} nefes`
                        : ''}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Son 7 gün */}
              <View style={styles.card}>
                <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                  SON 7 GÜN
                </Text>
                <Text style={styles.chartCaption} maxFontSizeMultiplier={1.2}>
                  {selectedBar != null
                    ? `${WEEKDAYS[last7[selectedBar].date.getDay()]} · ${formatDuration(last7[selectedBar].seconds)}`
                    : 'Günlük çalışma süreni görmek için bir sütuna dokun'}
                </Text>
                <View style={styles.chart}>
                  {last7.map((d, i) => (
                    <Pressable
                      key={i}
                      style={styles.chartCol}
                      onPress={() => setSelectedBar(selectedBar === i ? null : i)}
                    >
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: Math.max((d.seconds / maxDay) * CHART_HEIGHT, 3),
                            backgroundColor:
                              i === 6 ? L.accent : d.seconds > 0 ? L.accentSoft : L.hairline,
                          },
                        ]}
                      />
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chartLabels}>
                  {last7.map((d, i) => (
                    <Text key={i} style={styles.chartLabel} maxFontSizeMultiplier={1.1}>
                      {d.label}
                    </Text>
                  ))}
                </View>
              </View>

              {/* Projelere göre (bu hafta) */}
              <View style={styles.card}>
                <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                  PROJELERE GÖRE · BU HAFTA
                </Text>
                {weekByProject.rows.length === 0 && (
                  <Text style={styles.emptyLine} maxFontSizeMultiplier={1.3}>
                    Bu hafta kayıt yok.
                  </Text>
                )}
                {weekByProject.rows.slice(projectWindow.start, projectWindow.end).map((row, i) => {
                  const pct = Math.round((row.seconds / weekByProject.weekTotal) * 100);
                  const color = row.project?.color ?? L.tertiary;
                  return (
                    <View key={row.project?.id ?? 'none'} style={i > 0 && styles.projectGap}>
                      <View style={styles.projectRow}>
                        <View style={[styles.projectDot, { backgroundColor: color }]} />
                        <Text numberOfLines={2} style={styles.projectName} maxFontSizeMultiplier={1.2}>
                          {row.project?.name ?? 'Projesiz'}
                        </Text>
                        <Text style={styles.projectDuration} maxFontSizeMultiplier={1.2}>
                          {formatDuration(row.seconds)}
                        </Text>
                        <Text style={styles.projectPct} maxFontSizeMultiplier={1.2}>
                          %{pct}
                        </Text>
                      </View>
                      <View style={styles.projectTrack}>
                        <View
                          style={[
                            styles.projectFill,
                            { width: `${pct}%`, backgroundColor: color },
                          ]}
                        />
                      </View>
                      {row.children.slice(0, 3).map((child) => (
                        <View key={child.project.id} style={styles.childRow}>
                          <View
                            style={[styles.projectDotSmall, { backgroundColor: child.project.color }]}
                          />
                          <Text numberOfLines={2} style={styles.childName} maxFontSizeMultiplier={1.2}>
                            {child.project.name}
                          </Text>
                          <Text style={styles.childDuration} maxFontSizeMultiplier={1.2}>
                            {formatDuration(child.seconds)}
                          </Text>
                        </View>
                      ))}
                      {row.children.length > 3 && <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { setFilterProjectId(row.project?.id ?? null); router.push(`/project/${row.project!.id}`); }}><Text style={styles.emptyLine}>Tüm alt projeleri gör ({row.children.length})</Text></Pressable>}
                    </View>
                  );
                })}
                <Pagination total={weekByProject.rows.length} page={projectWindow.page} onChange={setProjectPage} size={10} />
              </View>

              {/* Hedefler */}
              {goalRows.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                    HEDEFLER
                  </Text>
                  {goalRows.slice(goalWindow.start, goalWindow.end).map(({ project, goal, current, pct }, i) => (
                    <Pressable
                      key={project.id}
                      style={[i > 0 && styles.projectGap]}
                      onPress={() => router.push(`/project/${project.id}`)}
                    >
                      <View style={styles.projectRow}>
                        <View style={[styles.projectDot, { backgroundColor: project.color }]} />
                        <Text numberOfLines={2} style={styles.projectName} maxFontSizeMultiplier={1.2}>
                          {project.name}
                        </Text>
                        <Text style={styles.goalPeriod} maxFontSizeMultiplier={1.2}>
                          {GOAL_PERIOD_LABELS[goal.period]} hedef
                        </Text>
                      </View>
                      <View style={styles.projectRow}>
                        <Text style={styles.goalNumbers} maxFontSizeMultiplier={1.2}>
                          {goal.metric === 'hours'
                            ? `${formatDuration(Math.round(current * 3600))} / ${goal.target} sa`
                            : `${current} / ${goal.target} tur`}
                        </Text>
                        <Text
                          style={[styles.projectPct, pct >= 100 && styles.goalDone]}
                          maxFontSizeMultiplier={1.2}
                        >
                          %{pct}
                        </Text>
                      </View>
                      <View style={styles.projectTrack}>
                        <View
                          style={[
                            styles.projectFill,
                            {
                              width: `${Math.min(pct, 100)}%`,
                              backgroundColor: pct >= 100 ? L.success : L.accent,
                            },
                          ]}
                        />
                      </View>
                    </Pressable>
                  ))}
                  <Pagination total={goalRows.length} page={goalWindow.page} onChange={setGoalPage} size={10} />
                </View>
              )}

              {/* Geçmiş */}
              <View style={styles.card}>
                <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                  GEÇMİŞ
                </Text>
                <SearchField value={historyQuery} onChangeText={(text) => { setHistoryQuery(text); setHistoryPage(0); }} placeholder="Proje, görev veya tarih ara…" />
                {searchableHistory.length === 0 && <Text style={styles.emptyLine}>Aramanla eşleşen kayıt yok.</Text>}
                {history.map((group) => (
                  <View key={group.dayKey} style={styles.historyGroup}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyDay} maxFontSizeMultiplier={1.2}>
                        {group.label}
                      </Text>
                      <Text style={styles.historyTotal} maxFontSizeMultiplier={1.2}>
                        Bu sayfa: {formatDuration(group.total)}
                      </Text>
                    </View>
                    {group.items.map((s) => {
                      const project = s.projectId ? projectById.get(s.projectId) : null;
                      const deleted = s.projectId != null && !project;
                      return (
                        <Pressable
                          key={s.id}
                          style={({ pressed }) => [styles.historyRow, pressed && styles.rowPressed]}
                          onPress={() => {
                            setEditingId(s.id);
                            setActionSheet('actions');
                          }}
                          onLongPress={() =>
                            confirmDeleteSession(
                              s.id,
                              `${project?.name ?? 'Projesiz'} · ${formatDuration(s.workSeconds)}`,
                            )
                          }
                          delayLongPress={500}
                        >
                          <View
                            style={[
                              styles.projectDotSmall,
                              { backgroundColor: project?.color ?? L.borderActive },
                            ]}
                          />
                          <View style={styles.flex}>
                            <Text numberOfLines={2} style={styles.historyProject} maxFontSizeMultiplier={1.2}>
                              {project?.name ?? (deleted ? 'Silinmiş proje' : 'Projesiz')}
                              {s.status === 'abandoned' && (
                                <Text style={styles.abandoned}>  · yarım</Text>
                              )}
                            </Text>
                            {taskPathLabel(tasks, s.taskId) && (
                              <Text
                                style={styles.historyTask}
                                numberOfLines={1}
                                maxFontSizeMultiplier={1.2}
                              >
                                {taskPathLabel(tasks, s.taskId)}
                              </Text>
                            )}
                            <Text style={styles.historyMeta} maxFontSizeMultiplier={1.2}>
                              {s.completedRounds} tur · {clockOf(s.startedAt)}–{clockOf(s.endedAt)}
                            </Text>
                          </View>
                          <Text style={styles.historyDuration} maxFontSizeMultiplier={1.2}>
                            {formatDuration(s.workSeconds)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
                <Pagination total={searchableHistory.length} page={historyWindow.page} onChange={setHistoryPage} size={20} />
                <Text style={styles.historyHint} maxFontSizeMultiplier={1.2}>
                  Kaydı düzeltmek için satıra dokun, silmek için basılı tut.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <PickerSheet
        visible={filterOpen}
        title="Projeye göre filtrele"
        options={filterOptions}
        selectedKey={filterProjectId ?? '__all__'}
        onSelect={(key) => { setFilterProjectId(key === '__all__' ? null : key); setHistoryPage(0); setProjectPage(0); setGoalPage(0); }}
        onClose={() => setFilterOpen(false)}
      />

      {/* Kayıt eylemleri: yanlış projeye/göreve yazılmış oturum düzeltilebilir. */}
      <PickerSheet
        visible={actionSheet === 'actions'}
        title="Kayıt"
        options={[
          { key: 'project', label: 'Projeyi değiştir' },
          { key: 'task', label: 'Görevi değiştir' },
          { key: 'delete', label: 'Kaydı sil' },
        ]}
        selectedKey=""
        onSelect={(key) => {
          if (key === 'delete') {
            const label = editing
              ? `${editing.projectId ? projectById.get(editing.projectId)?.name ?? 'Projesiz' : 'Projesiz'} · ${formatDuration(editing.workSeconds)}`
              : '';
            const id = editingId;
            setActionSheet('none');
            if (id) confirmDeleteSession(id, label);
            return;
          }
          setActionSheet(key === 'project' ? 'project' : 'task');
        }}
        onClose={() => setActionSheet('none')}
      />

      <PickerSheet
        visible={actionSheet === 'project'}
        title="Kaydın projesi"
        options={filterOptions.map((o) =>
          o.key === '__all__' ? { key: '__none__', label: 'Projesiz' } : o,
        )}
        selectedKey={editing?.projectId ?? '__none__'}
        onSelect={(key) => {
          if (!editingId) return;
          // Proje değişince görev geçersizleşir: birlikte sıfırlanır.
          updateSession(editingId, { projectId: key === '__none__' ? null : key, taskId: null });
        }}
        onClose={() => setActionSheet('none')}
      />

      <PickerSheet
        visible={actionSheet === 'task'}
        title="Kaydın görevi"
        options={editingTaskOptions}
        selectedKey={editing?.taskId ?? '__no_task__'}
        onSelect={(key) => {
          if (!editingId) return;
          updateSession(editingId, { taskId: key === '__no_task__' ? null : key });
        }}
        onClose={() => setActionSheet('none')}
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
  safeArea: {
    flex: 1,
    minWidth: 0,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 64,
  },
  emptyText: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: L.accent,
    borderRadius: R.md,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontFamily: F.uiSemi,
    fontSize: 14,
  },
  tileRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
    minWidth: 130,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    padding: 12,
    gap: 4,
  },
  tileLabel: {
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 11,
  },
  tileValue: {
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 20,
  },
  tileMeta: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
  },
  card: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    padding: 16,
  },
  cardTitle: {
    color: L.tertiary,
    fontFamily: F.uiSemi,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  chartCaption: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 12,
    marginBottom: 8,
    minHeight: 16,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: CHART_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.border,
  },
  chartCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: CHART_HEIGHT,
  },
  chartBar: {
    width: '70%',
    borderTopLeftRadius: R.sm,
    borderTopRightRadius: R.sm,
  },
  chartLabels: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  chartLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
  },
  emptyLine: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
  },
  projectGap: {
    marginTop: 14,
  },
  projectRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  projectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  projectDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  projectName: {
    flex: 1,
    minWidth: 0,
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  projectDuration: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  projectPct: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    minWidth: 44,
    textAlign: 'right',
  },
  projectTrack: {
    height: 6,
    backgroundColor: L.hairline,
    overflow: 'hidden',
    borderRadius: R.sm,
  },
  projectFill: {
    height: 6,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 18,
    marginTop: 6,
  },
  childName: {
    flex: 1,
    minWidth: 0,
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 13,
  },
  childDuration: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  goalPeriod: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  goalNumbers: {
    flex: 1,
    minWidth: 0,
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 13,
  },
  goalDone: {
    color: L.success,
    fontFamily: F.uiSemi,
  },
  historyGroup: {
    marginBottom: 12,
  },
  historyHeader: {
    flexWrap: 'wrap',
    gap: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyDay: {
    color: L.ink2,
    fontFamily: F.uiSemi,
    fontSize: 13,
  },
  historyTotal: {
    color: L.tertiary,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  historyProject: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 14,
  },
  abandoned: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
  },
  filterChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
  },
  filterChipText: {
    flexShrink: 1,
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 12,
  },
  rowPressed: {
    backgroundColor: L.pressed,
  },
  moreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    marginTop: 8,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    backgroundColor: L.surface,
  },
  moreButtonText: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  historyHint: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  historyTask: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 2,
  },
  historyMeta: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 2,
  },
  historyDuration: {
    maxWidth: '40%',
    flexShrink: 1,
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
