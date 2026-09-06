import Storage from 'expo-sqlite/kv-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { migrateTaskChecklists, type Task, type ChecklistItem } from './task-model';
import { PROJECT_COLORS } from '@/features/ui/theme';

export { taskPathLabel, type Task, type ChecklistItem } from './task-model';

// Projects contain independent tasks; each task owns a flat checklist.

export type GoalPeriod = 'weekly' | 'monthly' | 'yearly' | 'total';

export type Goal = {
  /** 'rounds': tamamlanan TUR sayısı (eski kayıtlardaki 'sessions' buna eşlenir). */
  metric: 'hours' | 'rounds';
  target: number;
  period: GoalPeriod;
};

export const GOAL_PERIOD_LABELS: Record<GoalPeriod, string> = {
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
  total: 'Toplam',
};

export type Project = {
  id: string;
  /** null = üst düzey. Alt projeler kendisi üst olamaz (derinlik 2). */
  parentId: string | null;
  name: string;
  color: string;
  orderIndex: number;
  /** Proje notu/dokümantasyonu — tek serbest metin alanı. */
  noteBody: string;
  /** Proje bazlı zamanlayıcı önayarı; null = genel varsayılan. */
  defaultPresetId: string | null;
  goal: Goal | null;
};

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const PROJECTS_KEY = 'projects-v2';
const TASKS_KEY = 'tasks-v2-checklists';
const LEGACY_TASKS_KEY = 'tasks-v1';
const LEGACY_PROJECTS_KEY = 'projects-v1';

const DEFAULT_PROJECTS: Project[] = [
  {
    id: 'genel',
    parentId: null,
    name: 'Genel',
    color: PROJECT_COLORS[0],
    orderIndex: 0,
    noteBody: '',
    defaultPresetId: null,
    goal: null,
  },
];

function sanitizeGoal(raw: unknown): Goal | null {
  const g = raw as Partial<Goal> | null;
  if (!g || typeof g !== 'object') return null;
  const metric = g.metric === 'hours' ? 'hours' : g.metric === 'rounds' || g.metric === 'sessions' ? 'rounds' : null;
  if (!metric) return null;
  const target = Number(g.target);
  if (!Number.isFinite(target) || target <= 0) return null;
  const period: GoalPeriod =
    g.period === 'weekly' || g.period === 'monthly' || g.period === 'yearly' || g.period === 'total'
      ? g.period
      : 'weekly';
  return { metric, target, period };
}

function sanitizeProjects(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return DEFAULT_PROJECTS;
  const list = raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p, i) => ({
      id: (p.id as string) || newId(),
      parentId: typeof p.parentId === 'string' ? p.parentId : null,
      name: String(p.name ?? '').trim() || 'Proje',
      color: typeof p.color === 'string' ? p.color : PROJECT_COLORS[i % PROJECT_COLORS.length],
      orderIndex: Number.isFinite(p.orderIndex) ? (p.orderIndex as number) : i,
      noteBody: typeof p.noteBody === 'string' ? p.noteBody : '',
      defaultPresetId: typeof p.defaultPresetId === 'string' ? p.defaultPresetId : null,
      goal: sanitizeGoal(p.goal),
    }));
  if (list.length === 0) return DEFAULT_PROJECTS;
  // Derinlik 2 garantisi: üst projesi de alt proje olan kayıtlar üst düzeye alınır.
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const p of list) {
    if (p.parentId) {
      const parent = byId.get(p.parentId);
      if (!parent || parent.parentId) p.parentId = null;
    }
  }
  return list;
}

function sanitizeTasks(raw: unknown, projects: Project[]): Task[] {
  return migrateTaskChecklists(raw, new Set(projects.map((p) => p.id)));
}

/** Eski iç içe modelden (projects-v1) normalize modele migrasyon. */
function migrateLegacy(raw: unknown): { projects: Project[]; tasks: Task[] } {
  const oldProjects = Array.isArray(raw) ? raw : [];
  const projects: Project[] = [];
  const tasks: Record<string, unknown>[] = [];
  oldProjects.forEach((p: Record<string, unknown>, i: number) => {
    if (!p || typeof p !== 'object') return;
    const projectId = (p.id as string) || newId();
    projects.push({
      id: projectId,
      parentId: null,
      name: String(p.name ?? '').trim() || 'Proje',
      color: typeof p.color === 'string' ? p.color : PROJECT_COLORS[i % PROJECT_COLORS.length],
      orderIndex: i,
      noteBody: '',
      defaultPresetId: null,
      goal: null,
    });
    const oldTasks = Array.isArray(p.tasks) ? p.tasks : [];
    oldTasks.forEach((t: Record<string, unknown>, ti: number) => {
      const taskId = (t.id as string) || newId();
      tasks.push({
        id: taskId,
        projectId,
        parentTaskId: null,
        title: String(t.title ?? '').trim() || 'Görev',
        note: '',
        done: !!t.done,
        dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
        orderIndex: ti,
      });
      const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
      subs.forEach((s: Record<string, unknown>, si: number) => {
        tasks.push({
          id: (s.id as string) || newId(),
          projectId,
          parentTaskId: taskId,
          title: String(s.title ?? '').trim() || 'Alt görev',
          note: '',
          done: !!s.done,
          dueDate: null,
          orderIndex: si,
        });
      });
    });
  });
  return { projects: projects.length > 0 ? projects : DEFAULT_PROJECTS, tasks: sanitizeTasks(tasks, projects) };
}

// --- Context ---

type ProjectsContextValue = {
  projects: Project[];
  tasks: Task[];
  loaded: boolean;
  addProject: (name: string, parentId?: string | null) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  setProjectNote: (id: string, noteBody: string) => void;
  setProjectGoal: (id: string, goal: Goal | null) => void;
  setProjectPreset: (id: string, presetId: string | null) => void;
  /** Proje rengini değiştirir (PROJECT_COLORS içinden). */
  setProjectColor: (id: string, color: string) => void;
  /** Projeyi kardeşleri arasında bir sıra yukarı/aşağı taşır. */
  moveProject: (id: string, direction: -1 | 1) => void;
  moveTask: (taskId: string, projectId: string) => void;
  moveTaskOrder: (taskId: string, direction: -1 | 1) => void;
  addTask: (projectId: string, title: string, dueDate?: string | null) => void;
  updateTask: (taskId: string, patch: Partial<Pick<Task, 'title' | 'note' | 'done' | 'dueDate'>>) => void;
  deleteTask: (taskId: string) => void;
  addChecklistItem: (taskId: string, title: string) => void;
  updateChecklistItem: (taskId: string, itemId: string, patch: Partial<Pick<ChecklistItem, 'title' | 'done' | 'note'>>) => void;
  deleteChecklistItem: (taskId: string, itemId: string) => void;
  moveChecklistItem: (taskId: string, itemId: string, direction: -1 | 1) => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ projects, tasks });
  useEffect(() => {
    stateRef.current = { projects, tasks };
  }, [projects, tasks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawProjects, rawTasks, rawLegacy, rawLegacyTasks] = await Promise.all([
          Storage.getItem(PROJECTS_KEY),
          Storage.getItem(TASKS_KEY),
          Storage.getItem(LEGACY_PROJECTS_KEY),
          Storage.getItem(LEGACY_TASKS_KEY),
        ]);
        if (cancelled) return;
        if (rawProjects) {
          const p = sanitizeProjects(JSON.parse(rawProjects));
          setProjects(p);
          const migrated = sanitizeTasks(JSON.parse(rawTasks ?? rawLegacyTasks ?? '[]'), p);
          setTasks(migrated);
          if (!rawTasks && rawLegacyTasks) await Storage.setItem(TASKS_KEY, JSON.stringify(migrated));
        } else if (rawLegacy) {
          // v1 → v2 migrasyonu; eski anahtar yedek olarak yerinde bırakılır.
          const { projects: p, tasks: t } = migrateLegacy(JSON.parse(rawLegacy));
          setProjects(p);
          setTasks(t);
          await Storage.setItem(PROJECTS_KEY, JSON.stringify(p)).catch(() => {});
          await Storage.setItem(TASKS_KEY, JSON.stringify(t)).catch(() => {});
        }
      } catch {
        // varsayılanlarla devam
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Yazmalar kısa aralıkla toplanır.
  const persist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const { projects: p, tasks: t } = stateRef.current;
      void Storage.setItem(PROJECTS_KEY, JSON.stringify(p)).catch(() => {});
      void Storage.setItem(TASKS_KEY, JSON.stringify(t)).catch(() => {});
    }, 300);
  }, []);

  const mutateProjects = useCallback(
    (fn: (prev: Project[]) => Project[]) => {
      setProjects((prev) => {
        const next = fn(prev);
        stateRef.current = { ...stateRef.current, projects: next };
        return next;
      });
      persist();
    },
    [persist],
  );

  const mutateTasks = useCallback(
    (fn: (prev: Task[]) => Task[]) => {
      setTasks((prev) => {
        const next = fn(prev);
        stateRef.current = { ...stateRef.current, tasks: next };
        return next;
      });
      persist();
    },
    [persist],
  );

  const value: ProjectsContextValue = {
    projects,
    tasks,
    loaded,
    addProject: useCallback(
      (name, parentId = null) =>
        mutateProjects((prev) => {
          // Derinlik 2: yalnızca üst düzey projeler ebeveyn olabilir.
          const parent = parentId ? prev.find((p) => p.id === parentId && !p.parentId) : null;
          return [
            ...prev,
            {
              id: newId(),
              parentId: parent ? parent.id : null,
              name: name.trim() || 'Proje',
              color: PROJECT_COLORS[prev.length % PROJECT_COLORS.length],
              orderIndex: Math.max(0, ...prev.map((p) => p.orderIndex + 1)),
              noteBody: '',
              defaultPresetId: null,
              goal: null,
            },
          ];
        }),
      [mutateProjects],
    ),
    renameProject: useCallback(
      (id, name) =>
        mutateProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
        ),
      [mutateProjects],
    ),
    deleteProject: useCallback(
      (id) => {
        // Son proje korunur: silinirse sanitize açılışta "Genel"i diriltir ve
        // kullanıcı sildiği projenin geri geldiğini görürdü.
        if (stateRef.current.projects.length <= 1) return;
        // Alt projeler ve tüm görevleri de silinir; oturum kayıtları kalır
        // (Rapor'da "Silinmiş proje" olarak görünür).
        const doomed = new Set([id]);
        for (const p of stateRef.current.projects) {
          if (p.parentId === id) doomed.add(p.id);
        }
        mutateProjects((prev) => prev.filter((p) => !doomed.has(p.id)));
        mutateTasks((prev) => prev.filter((t) => !doomed.has(t.projectId)));
      },
      [mutateProjects, mutateTasks],
    ),
    setProjectNote: useCallback(
      (id, noteBody) =>
        mutateProjects((prev) => prev.map((p) => (p.id === id ? { ...p, noteBody } : p))),
      [mutateProjects],
    ),
    setProjectGoal: useCallback(
      (id, goal) => mutateProjects((prev) => prev.map((p) => (p.id === id ? { ...p, goal } : p))),
      [mutateProjects],
    ),
    setProjectColor: useCallback(
      (id, color) => mutateProjects((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p))),
      [mutateProjects],
    ),
    moveProject: useCallback(
      (id, direction) =>
        mutateProjects((prev) => {
          const target = prev.find((p) => p.id === id);
          if (!target) return prev;
          // Yalnız aynı düzeydeki kardeşler arasında yer değiştirir.
          const siblings = prev
            .filter((p) => p.parentId === target.parentId)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          const i = siblings.findIndex((p) => p.id === id);
          const j = i + direction;
          if (i < 0 || j < 0 || j >= siblings.length) return prev;
          const a = siblings[i];
          const b = siblings[j];
          return prev.map((p) =>
            p.id === a.id
              ? { ...p, orderIndex: b.orderIndex }
              : p.id === b.id
                ? { ...p, orderIndex: a.orderIndex }
                : p,
          );
        }),
      [mutateProjects],
    ),
    moveTask: useCallback(
      (taskId, projectId) => mutateTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectId } : t)),
      [mutateTasks],
    ),
    moveTaskOrder: useCallback(
      (taskId, direction) =>
        mutateTasks((prev) => {
          const target = prev.find((t) => t.id === taskId);
          if (!target) return prev;
          const siblings = prev
            .filter((t) => t.projectId === target.projectId)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          const i = siblings.findIndex((t) => t.id === taskId);
          const j = i + direction;
          if (i < 0 || j < 0 || j >= siblings.length) return prev;
          const a = siblings[i];
          const b = siblings[j];
          return prev.map((t) =>
            t.id === a.id
              ? { ...t, orderIndex: b.orderIndex }
              : t.id === b.id
                ? { ...t, orderIndex: a.orderIndex }
                : t,
          );
        }),
      [mutateTasks],
    ),
    setProjectPreset: useCallback(
      (id, presetId) =>
        mutateProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, defaultPresetId: presetId } : p)),
        ),
      [mutateProjects],
    ),
    addTask: useCallback(
      (projectId, title, dueDate = null) =>
        mutateTasks((prev) => [
          ...prev,
          {
            id: newId(),
            projectId,
            checklist: [],
            legacyTaskIds: [],
            title: title.trim() || 'Görev',
            note: '',
            done: false,
            dueDate,
            orderIndex: Math.max(0, ...prev.map((t) => t.orderIndex + 1)),
          },
        ]),
      [mutateTasks],
    ),
    updateTask: useCallback(
      (taskId, patch) =>
        mutateTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))),
      [mutateTasks],
    ),
    deleteTask: useCallback(
      (taskId) => mutateTasks((prev) => prev.filter((t) => t.id !== taskId)),
      [mutateTasks],
    ),
    addChecklistItem: useCallback((taskId, title) => {
      const clean = title.trim();
      if (!clean) return;
      mutateTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, checklist: [...task.checklist, {
        id: newId(), title: clean, done: false, note: '', dueDate: null, orderIndex: task.checklist.reduce((max, i) => Math.max(max, i.orderIndex + 1), 0),
      }] } : task));
    }, [mutateTasks]),
    updateChecklistItem: useCallback((taskId, itemId, patch) => {
      mutateTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, checklist: task.checklist.map((item) => item.id === itemId ? { ...item, ...patch, title: patch.title?.trim() || item.title } : item) } : task));
    }, [mutateTasks]),
    deleteChecklistItem: useCallback((taskId, itemId) => {
      mutateTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, checklist: task.checklist.filter((item) => item.id !== itemId) } : task));
    }, [mutateTasks]),
    moveChecklistItem: useCallback((taskId, itemId, direction) => {
      mutateTasks((prev) => prev.map((task) => {
        if (task.id !== taskId) return task;
        const items = [...task.checklist].sort((a, b) => a.orderIndex - b.orderIndex);
        const i = items.findIndex((item) => item.id === itemId);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= items.length) return task;
        [items[i], items[j]] = [items[j], items[i]];
        return { ...task, checklist: items.map((item, orderIndex) => ({ ...item, orderIndex })) };
      }));
    }, [mutateTasks]),
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error('useProjects, ProjectsProvider içinde kullanılmalı');
  return value;
}
