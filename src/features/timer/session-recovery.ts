import Storage from 'expo-sqlite/kv-store';

/**
 * Yürüyen oturumun kurtarma anlık görüntüsü.
 *
 * Tur döngüsü sonsuz olduğu için bir oturum tüm günü kapsayabilir; süreç
 * arka planda öldürülürse (Android bunu sıkça yapar) o ana dek biriken
 * çalışma kaydı tamamen kaybolurdu. Bu yüzden ilerleme düzenli aralıklarla
 * diske yazılır ve soğuk açılışta kayda dönüştürülür.
 *
 * Kayıt, son yazma anına kadar olan kısmı içerir: en fazla bir yazma aralığı
 * kadar süre kaybedilir.
 */
export type SessionSnapshot = {
  projectId: string | null;
  taskId: string | null;
  presetId: string | null;
  startedAt: number;
  /** Son yazma anı — kurtarılan kaydın bitiş zamanı olarak kullanılır. */
  updatedAt: number;
  workMs: number;
  breatheMs: number;
  completedRounds: number;
};

const KEY = 'session-in-progress';

export const SNAPSHOT_INTERVAL_MS = 20_000;

export function saveSnapshot(snapshot: SessionSnapshot): void {
  void Storage.setItem(KEY, JSON.stringify(snapshot)).catch(() => {});
}

export async function loadSnapshot(): Promise<SessionSnapshot | null> {
  try {
    const raw = await Storage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SessionSnapshot>;
    if (!Number.isFinite(s.startedAt) || !Number.isFinite(s.updatedAt)) return null;
    return {
      projectId: typeof s.projectId === 'string' ? s.projectId : null,
      taskId: typeof s.taskId === 'string' ? s.taskId : null,
      presetId: typeof s.presetId === 'string' ? s.presetId : null,
      startedAt: s.startedAt as number,
      updatedAt: s.updatedAt as number,
      workMs: Math.max(0, Number(s.workMs) || 0),
      breatheMs: Math.max(0, Number(s.breatheMs) || 0),
      completedRounds: Math.max(0, Number(s.completedRounds) || 0),
    };
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  void Storage.removeItem(KEY).catch(() => {});
}
