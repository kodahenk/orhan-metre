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

// --- Model ---

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type Task = {
  id: string;
  title: string;
  done: boolean;
  /** 'YYYY-MM-DD' (yerel) — takvimde bu tarihte görünür; null = tarihsiz. */
  dueDate: string | null;
  subtasks: Subtask[];
};

export type Project = {
  id: string;
  name: string;
  color: string;
  tasks: Task[];
};

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY = 'projects-v1';

const DEFAULT_PROJECTS: Project[] = [
  { id: 'genel', name: 'Genel', color: PROJECT_COLORS[0], tasks: [] },
];

function sanitize(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return DEFAULT_PROJECTS;
  const projects = raw
    .filter((p): p is Project => !!p && typeof p === 'object')
    .map((p) => ({
      id: p.id || newId(),
      name: (p.name ?? '').trim() || 'Proje',
      color: typeof p.color === 'string' ? p.color : PROJECT_COLORS[0],
      tasks: Array.isArray(p.tasks)
        ? p.tasks.map((t) => ({
            id: t.id || newId(),
            title: (t.title ?? '').trim() || 'Görev',
            done: !!t.done,
            dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
            subtasks: Array.isArray(t.subtasks)
              ? t.subtasks.map((s) => ({
                  id: s.id || newId(),
                  title: (s.title ?? '').trim() || 'Alt görev',
                  done: !!s.done,
                }))
              : [],
          }))
        : [],
    }));
  return projects.length > 0 ? projects : DEFAULT_PROJECTS;
}

// --- Context ---

type ProjectsContextValue = {
  projects: Project[];
  loaded: boolean;
  addProject: (name: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  addTask: (projectId: string, title: string, dueDate?: string | null) => void;
  updateTask: (projectId: string, taskId: string, patch: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  addSubtask: (projectId: string, taskId: string, title: string) => void;
  toggleSubtask: (projectId: string, taskId: string, subtaskId: string) => void;
  deleteSubtask: (projectId: string, taskId: string, subtaskId: string) => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [loaded, setLoaded] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Storage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) setProjects(sanitize(JSON.parse(raw)));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Yazmalar kısa aralıkla toplanır (art arda tik atlarken her dokunuşta
  // diske gitmemek için).
  const mutate = useCallback((fn: (prev: Project[]) => Project[]) => {
    setProjects((prev) => {
      const next = fn(prev);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void Storage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      }, 300);
      return next;
    });
  }, []);

  const mapTask = (
    prev: Project[],
    projectId: string,
    taskId: string,
    fn: (t: Task) => Task | null,
  ) =>
    prev.map((p) =>
      p.id !== projectId
        ? p
        : {
            ...p,
            tasks: p.tasks
              .map((t) => (t.id === taskId ? fn(t) : t))
              .filter((t): t is Task => t !== null),
          },
    );

  const value: ProjectsContextValue = {
    projects,
    loaded,
    addProject: useCallback(
      (name) =>
        mutate((prev) => [
          ...prev,
          {
            id: newId(),
            name: name.trim() || 'Proje',
            color: PROJECT_COLORS[prev.length % PROJECT_COLORS.length],
            tasks: [],
          },
        ]),
      [mutate],
    ),
    renameProject: useCallback(
      (id, name) =>
        mutate((prev) =>
          prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
        ),
      [mutate],
    ),
    deleteProject: useCallback(
      (id) => mutate((prev) => prev.filter((p) => p.id !== id)),
      [mutate],
    ),
    addTask: useCallback(
      (projectId, title, dueDate = null) =>
        mutate((prev) =>
          prev.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  tasks: [
                    ...p.tasks,
                    { id: newId(), title: title.trim() || 'Görev', done: false, dueDate, subtasks: [] },
                  ],
                },
          ),
        ),
      [mutate],
    ),
    updateTask: useCallback(
      (projectId, taskId, patch) =>
        mutate((prev) => mapTask(prev, projectId, taskId, (t) => ({ ...t, ...patch }))),
      [mutate],
    ),
    deleteTask: useCallback(
      (projectId, taskId) => mutate((prev) => mapTask(prev, projectId, taskId, () => null)),
      [mutate],
    ),
    addSubtask: useCallback(
      (projectId, taskId, title) =>
        mutate((prev) =>
          mapTask(prev, projectId, taskId, (t) => ({
            ...t,
            subtasks: [...t.subtasks, { id: newId(), title: title.trim() || 'Alt görev', done: false }],
          })),
        ),
      [mutate],
    ),
    toggleSubtask: useCallback(
      (projectId, taskId, subtaskId) =>
        mutate((prev) =>
          mapTask(prev, projectId, taskId, (t) => ({
            ...t,
            subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
          })),
        ),
      [mutate],
    ),
    deleteSubtask: useCallback(
      (projectId, taskId, subtaskId) =>
        mutate((prev) =>
          mapTask(prev, projectId, taskId, (t) => ({
            ...t,
            subtasks: t.subtasks.filter((s) => s.id !== subtaskId),
          })),
        ),
      [mutate],
    ),
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error('useProjects, ProjectsProvider içinde kullanılmalı');
  return value;
}
