import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GOAL_PERIOD_LABELS, useProjects, type Project } from '@/features/projects/projects-context';
import { useSessions, type WorkSession } from '@/features/sessions/sessions-context';
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
import { useTimerSettings } from '@/features/timer/settings-context';
import { ScreenHeader } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

const CHART_HEIGHT = 120;

function sumWork(sessions: WorkSession[], from: number, to = Infinity) {
  let seconds = 0;
  let count = 0;
  for (const s of sessions) {
    if (s.startedAt >= from && s.startedAt < to) {
      seconds += s.workSeconds;
      count += 1;
    }
  }
  return { seconds, count };
}

function goalWindowStart(period: 'weekly' | 'monthly' | 'yearly' | 'total') {
  if (period === 'weekly') return startOfWeek(new Date()).getTime();
  if (period === 'monthly') return startOfMonth().getTime();
  if (period === 'yearly') return startOfYear().getTime();
  return 0;
}

export default function ReportsScreen() {
  const router = useRouter();
  const { sessions } = useSessions();
  const { projects } = useProjects();
  const { presets } = useTimerSettings();
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const now = Date.now();
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
    for (const parent of projects.filter((p) => !p.parentId)) {
      const own = perProject.get(parent.id) ?? 0;
      const children = projects
        .filter((p) => p.parentId === parent.id)
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
      .filter((p) => p.goal)
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
            : relevant.filter((s) => s.status === 'completed').length;
        const pct = Math.round((current / goal.target) * 100);
        return { project: p, goal, current, pct };
      });
  }, [projects, sessions]);

  // Geçmiş: son 20 oturum, güne gruplu, en yeni önce.
  const history = useMemo(() => {
    const recent = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20);
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
  }, [sessions]);

  const presetName = (id: string | null) => presets.find((p) => p.id === id)?.name ?? 'Önayar';
  const clockOf = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const hasAny = sessions.length > 0;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Rapor" />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          {!hasAny && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Henüz kayıt yok — Zamanlayıcı'dan bir seans başlat.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
                onPress={() => router.push('/')}
              >
                <Feather name="clock" size={16} color="#FFFFFF" />
                <Text style={styles.emptyButtonText} maxFontSizeMultiplier={1.2}>
                  Zamanlayıcıya git
                </Text>
              </Pressable>
            </View>
          )}

          {hasAny && (
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
                      {tile.data.count} seans
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
                    : ' '}
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
                {weekByProject.rows.map((row, i) => {
                  const pct = Math.round((row.seconds / weekByProject.weekTotal) * 100);
                  const color = row.project?.color ?? L.tertiary;
                  return (
                    <View key={row.project?.id ?? 'none'} style={i > 0 && styles.projectGap}>
                      <View style={styles.projectRow}>
                        <View style={[styles.projectDot, { backgroundColor: color }]} />
                        <Text style={styles.projectName} maxFontSizeMultiplier={1.2}>
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
                      {row.children.map((child) => (
                        <View key={child.project.id} style={styles.childRow}>
                          <View
                            style={[styles.projectDotSmall, { backgroundColor: child.project.color }]}
                          />
                          <Text style={styles.childName} maxFontSizeMultiplier={1.2}>
                            {child.project.name}
                          </Text>
                          <Text style={styles.childDuration} maxFontSizeMultiplier={1.2}>
                            {formatDuration(child.seconds)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>

              {/* Hedefler */}
              {goalRows.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                    HEDEFLER
                  </Text>
                  {goalRows.map(({ project, goal, current, pct }, i) => (
                    <Pressable
                      key={project.id}
                      style={[i > 0 && styles.projectGap]}
                      onPress={() => router.push(`/project/${project.id}`)}
                    >
                      <View style={styles.projectRow}>
                        <View style={[styles.projectDot, { backgroundColor: project.color }]} />
                        <Text style={styles.projectName} maxFontSizeMultiplier={1.2}>
                          {project.name}
                        </Text>
                        <Text style={styles.goalPeriod} maxFontSizeMultiplier={1.2}>
                          {GOAL_PERIOD_LABELS[goal.period]} hedef
                        </Text>
                      </View>
                      <View style={styles.projectRow}>
                        <Text style={styles.goalNumbers} maxFontSizeMultiplier={1.2}>
                          {goal.metric === 'hours'
                            ? `${formatDuration(Math.round(current * 3600))} / ${goal.target}s`
                            : `${current} / ${goal.target} seans`}
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
                </View>
              )}

              {/* Geçmiş */}
              <View style={styles.card}>
                <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                  GEÇMİŞ
                </Text>
                {history.map((group) => (
                  <View key={group.dayKey} style={styles.historyGroup}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyDay} maxFontSizeMultiplier={1.2}>
                        {group.label}
                      </Text>
                      <Text style={styles.historyTotal} maxFontSizeMultiplier={1.2}>
                        {formatDuration(group.total)}
                      </Text>
                    </View>
                    {group.items.map((s) => {
                      const project = s.projectId ? projectById.get(s.projectId) : null;
                      const deleted = s.projectId != null && !project;
                      return (
                        <View key={s.id} style={styles.historyRow}>
                          <View
                            style={[
                              styles.projectDotSmall,
                              { backgroundColor: project?.color ?? L.borderActive },
                            ]}
                          />
                          <View style={styles.flex}>
                            <Text style={styles.historyProject} maxFontSizeMultiplier={1.2}>
                              {project?.name ?? (deleted ? 'Silinmiş proje' : 'Projesiz')}
                              {s.status === 'abandoned' && (
                                <Text style={styles.abandoned}>  · yarım</Text>
                              )}
                            </Text>
                            <Text style={styles.historyMeta} maxFontSizeMultiplier={1.2}>
                              {presetName(s.presetId)} · {clockOf(s.startedAt)}–{clockOf(s.endedAt)}
                            </Text>
                          </View>
                          <Text style={styles.historyDuration} maxFontSizeMultiplier={1.2}>
                            {formatDuration(s.workSeconds)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
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
  content: {
    padding: 16,
    gap: 12,
    maxWidth: 560,
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
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
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
    width: 44,
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
  historyMeta: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 2,
  },
  historyDuration: {
    color: L.ink2,
    fontFamily: F.uiMed,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
