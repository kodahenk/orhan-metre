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

import { PROJECT_COLORS } from '@/features/ui/theme';

// --- Model (v2) ---
// Projeler komşuluk listesiyle hiyerarşiktir (derinlik 2: üst proje + alt proje).
// Görevler ayrı, normalize bir koleksiyondur ve parentTaskId ile SINIRSIZ
// derinlikte iç içe geçebilir; her ekran en fazla 2 seviye gösterir.

export type GoalPeriod = 'weekly' | 'monthly' | 'yearly' | 'total';

export type Goal = {
  metric: 'hours' | 'sessions';
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

export type Task = {
  id: string;
  projectId: string;
  /** null = projenin üst düzey görevi. */
  parentTaskId: string | null;
  title: string;
  /** Görev açıklaması/notu — serbest metin, '' = yok. */
  note: string;
  done: boolean;
  /** 'YYYY-MM-DD' — takvimde görünür; null = tarihsiz. */
  dueDate: string | null;
  orderIndex: number;
};

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const PROJECTS_KEY = 'projects-v2';
const TASKS_KEY = 'tasks-v1';
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
  if (g.metric !== 'hours' && g.metric !== 'sessions') return null;
  const target = Number(g.target);
  if (!Number.isFinite(target) || target <= 0) return null;
  const period: GoalPeriod =
    g.period === 'weekly' || g.period === 'monthly' || g.period === 'yearly' || g.period === 'total'
      ? g.period
      : 'weekly';
  return { metric: g.metric, target, period };
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
  if (!Array.isArray(raw)) return [];
  const projectIds = new Set(projects.map((p) => p.id));
  const list = raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: (t.id as string) || newId(),
      projectId: String(t.projectId ?? ''),
      parentTaskId: typeof t.parentTaskId === 'string' ? t.parentTaskId : null,
      title: String(t.title ?? '').trim() || 'Görev',
      note: typeof t.note === 'string' ? t.note : '',
      done: !!t.done,
      dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
      orderIndex: Number.isFinite(t.orderIndex) ? (t.orderIndex as number) : i,
    }))
    .filter((t) => projectIds.has(t.projectId));
  const taskIds = new Set(list.map((t) => t.id));
  for (const t of list) {
    if (t.parentTaskId && !taskIds.has(t.parentTaskId)) t.parentTaskId = null;
  }
  return list;
}

/** Eski iç içe modelden (projects-v1) normalize modele migrasyon. */
function migrateLegacy(raw: unknown): { projects: Project[]; tasks: Task[] } {
  const oldProjects = Array.isArray(raw) ? raw : [];
  const projects: Project[] = [];
  const tasks: Task[] = [];
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
  return { projects: projects.length > 0 ? projects : DEFAULT_PROJECTS, tasks };
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
  addTask: (
    projectId: string,
    parentTaskId: string | null,
    title: string,
    dueDate?: string | null,
  ) => void;
  updateTask: (taskId: string, patch: Partial<Omit<Task, 'id' | 'projectId'>>) => void;
  /** Görevi tüm alt ağacıyla siler. */
  deleteTask: (taskId: string) => void;
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
        const [rawProjects, rawTasks, rawLegacy] = await Promise.all([
          Storage.getItem(PROJECTS_KEY),
          Storage.getItem(TASKS_KEY),
          Storage.getItem(LEGACY_PROJECTS_KEY),
        ]);
        if (cancelled) return;
        if (rawProjects) {
          const p = sanitizeProjects(JSON.parse(rawProjects));
          setProjects(p);
          setTasks(sanitizeTasks(rawTasks ? JSON.parse(rawTasks) : [], p));
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
    setProjectPreset: useCallback(
      (id, presetId) =>
        mutateProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, defaultPresetId: presetId } : p)),
        ),
      [mutateProjects],
    ),
    addTask: useCallback(
      (projectId, parentTaskId, title, dueDate = null) =>
        mutateTasks((prev) => [
          ...prev,
          {
            id: newId(),
            projectId,
            parentTaskId,
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
      (taskId) =>
        mutateTasks((prev) => {
          // Alt ağacı topla (derinlik sınırsız olabilir).
          const doomed = new Set([taskId]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const t of prev) {
              if (t.parentTaskId && doomed.has(t.parentTaskId) && !doomed.has(t.id)) {
                doomed.add(t.id);
                grew = true;
              }
            }
          }
          return prev.filter((t) => !doomed.has(t.id));
        }),
      [mutateTasks],
    ),
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error('useProjects, ProjectsProvider içinde kullanılmalı');
  return value;
}
