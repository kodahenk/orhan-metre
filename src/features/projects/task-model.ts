export type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  orderIndex: number;
  /** Preserved when converting an older subtask. */
  note: string;
  dueDate: string | null;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  note: string;
  done: boolean;
  dueDate: string | null;
  orderIndex: number;
  checklist: ChecklistItem[];
  /** Historical session references remain resolvable even after deleting a checklist item. */
  legacyTaskIds: string[];
};

type LegacyTask = Task & { parentTaskId: string | null };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

/** Idempotent conversion: nested tasks become a flat checklist on their root task.
 * Existing storage is kept under its original key as a migration backup.
 * Broken parents become standalone tasks; cycles are resolved deterministically.
 */
export function migrateTaskChecklists(raw: unknown, projectIds: Set<string>): Task[] {
  if (!Array.isArray(raw)) return [];
  const list: LegacyTask[] = raw.filter(record).map((t, index) => ({
    id: typeof t.id === 'string' && t.id ? t.id : `recovered-task-${index}`,
    projectId: String(t.projectId ?? ''),
    parentTaskId: typeof t.parentTaskId === 'string' ? t.parentTaskId : null,
    title: String(t.title ?? '').trim() || 'Görev',
    note: typeof t.note === 'string' ? t.note : '',
    done: !!t.done,
    dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
    orderIndex: typeof t.orderIndex === 'number' && Number.isFinite(t.orderIndex) ? t.orderIndex : index,
    checklist: Array.isArray(t.checklist) ? t.checklist.filter(record).map((item, i) => ({
      id: typeof item.id === 'string' ? item.id : `${t.id}-check-${i}`,
      title: String(item.title ?? '').trim() || 'Madde',
      done: !!item.done,
      orderIndex: typeof item.orderIndex === 'number' && Number.isFinite(item.orderIndex) ? item.orderIndex : i,
      note: typeof item.note === 'string' ? item.note : '',
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : null,
    })) : [],
    legacyTaskIds: Array.isArray(t.legacyTaskIds) ? t.legacyTaskIds.filter((id): id is string => typeof id === 'string') : [],
  })).filter((t) => projectIds.has(t.projectId));
  const byId = new Map(list.map((t) => [t.id, t]));
  const roots = new Map<string, string>();
  for (const task of list) {
    if (roots.has(task.id)) continue;
    const path: string[] = [];
    const seen = new Map<string, number>();
    let current = task;
    let root: string;
    while (true) {
      if (roots.has(current.id)) { root = roots.get(current.id)!; break; }
      const cycleStart = seen.get(current.id);
      if (cycleStart != null) { root = path.slice(cycleStart).sort()[0]; break; }
      seen.set(current.id, path.length);
      path.push(current.id);
      const parent = current.parentTaskId ? byId.get(current.parentTaskId) : undefined;
      if (!parent || parent.projectId !== current.projectId) { root = current.id; break; }
      current = parent;
    }
    for (const id of path) roots.set(id, root);
  }
  const result = new Map<string, Task>();
  for (const task of list) {
    const rootId = roots.get(task.id)!;
    if (result.has(rootId)) continue;
    const { parentTaskId: _parent, ...root } = byId.get(rootId)!;
    result.set(rootId, { ...root, checklist: [...root.checklist], legacyTaskIds: [...root.legacyTaskIds] });
  }
  for (const task of [...list].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const owner = result.get(roots.get(task.id)!)!;
    if (owner.id === task.id) continue;
    owner.checklist.push({ id: task.id, title: task.title, done: task.done, note: task.note, dueDate: task.dueDate, orderIndex: owner.checklist.length });
    owner.checklist.push(...task.checklist.map((item) => ({ ...item, orderIndex: owner.checklist.length + item.orderIndex })));
    owner.legacyTaskIds.push(task.id, ...task.legacyTaskIds);
  }
  return [...result.values()].map((task) => ({ ...task, legacyTaskIds: [...new Set(task.legacyTaskIds)] }));
}

export function taskPathLabel(tasks: Task[], taskId: string | null): string | null {
  if (!taskId) return null;
  const task = tasks.find((t) => t.id === taskId || t.legacyTaskIds.includes(taskId));
  if (!task) return 'Silinmiş görev';
  const item = task.checklist.find((i) => i.id === taskId);
  return item ? `${task.title} · ${item.title}` : task.title;
}
