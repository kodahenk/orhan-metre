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

// Append-only oturum günlüğü. Tüm rapor sayıları okuma anında hesaplanır;
// saklanan sayaç yoktur. Molalar (breakSeconds) hiçbir yerde toplanmaz.

export type WorkSession = {
  id: string;
  /** null = "Projesiz". Proje silinse bile kayıt kalır. */
  projectId: string | null;
  /** null = görevsiz. Görev silinse bile kayıt kalır ("Silinmiş görev"). */
  taskId: string | null;
  presetId: string | null;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  /** Odak + Tekrar fazlarında fiilen geçen, SAYILAN süre. */
  workSeconds: number;
  /** Nefes Al sürelerinin toplamı. */
  breakSeconds: number;
  /** Tekrar fazına ulaşmış (çalışılmış sayılan) tur sayısı. */
  completedRounds: number;
  status: 'completed' | 'abandoned';
};

const SESSIONS_KEY = 'sessions-v1';

function sanitize(raw: unknown): WorkSession[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      id: String(s.id ?? `${s.startedAt ?? ''}`),
      projectId: typeof s.projectId === 'string' ? s.projectId : null,
      taskId: typeof s.taskId === 'string' ? s.taskId : null,
      presetId: typeof s.presetId === 'string' ? s.presetId : null,
      startedAt: Number(s.startedAt) || 0,
      endedAt: Number(s.endedAt) || 0,
      workSeconds: Math.max(0, Number(s.workSeconds) || 0),
      breakSeconds: Math.max(0, Number(s.breakSeconds) || 0),
      // Eski kayıtlarda tur kavramı yoktu: tamamlanan çalışma partı sayısı
      // en yakın karşılık olarak devralınır.
      completedRounds: Math.max(
        0,
        Number(s.completedRounds ?? s.completedWorkParts) || 0,
      ),
      status: (s.status === 'abandoned' ? 'abandoned' : 'completed') as WorkSession['status'],
    }))
    .filter((s) => s.startedAt > 0);
}

type SessionsContextValue = {
  sessions: WorkSession[];
  loaded: boolean;
  addSession: (session: WorkSession) => void;
};

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    let cancelled = false;
    Storage.getItem(SESSIONS_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) setSessions(sanitize(JSON.parse(raw)));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ekleme nadir bir olay: anında (debounce'suz) kalıcılaştırılır.
  const addSession = useCallback((session: WorkSession) => {
    const next = [...sessionsRef.current, session];
    sessionsRef.current = next;
    setSessions(next);
    void Storage.setItem(SESSIONS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return (
    <SessionsContext.Provider value={{ sessions, loaded, addSession }}>
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions(): SessionsContextValue {
  const value = useContext(SessionsContext);
  if (!value) throw new Error('useSessions, SessionsProvider içinde kullanılmalı');
  return value;
}
