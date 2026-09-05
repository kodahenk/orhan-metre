import { useMemo } from 'react';

import { groupBy } from '@/features/ui/collection-utils';
import { useProjects } from '@/features/projects/projects-context';
import type { PickerOption } from '@/features/ui/components';
import { useTimer } from './timer-context';

export const NO_PROJECT_KEY = '__none__';
export const NO_TASK_KEY = '__no_task__';

/**
 * Zamanlayıcı öncesi proje + görev seçimi. Hem ana ekran hem tam ekran sayaç
 * aynı listeleri ve aynı seçim davranışını kullanır.
 *
 * Görev listesi, seçili proje ALT PROJELERİYLE birlikte taranır: üst proje
 * seçildiğinde alt projelerdeki görevler de listelenir (raporlar da süreleri
 * "kendisi + altları" diye topladığı için tutarlı). Alt projenin görevleri,
 * hangi projeye ait olduğu görünsün diye başlıklarıyla gruplanır.
 */
export function useSelectionPickers() {
  const timer = useTimer();
  const { projects, tasks } = useProjects();

  const projectOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: NO_PROJECT_KEY, label: 'Projesiz' }];
    const childProjects = groupBy(projects, (p) => p.parentId);
    for (const parent of projects.filter((p) => !p.parentId)) {
      options.push({ key: parent.id, label: parent.name, color: parent.color });
      for (const child of childProjects.get(parent.id) ?? []) {
        options.push({ key: child.id, label: child.name, color: child.color, indent: true });
      }
    }
    return options;
  }, [projects]);

  const pendingProject = projects.find((p) => p.id === timer.pendingProjectId) ?? null;

  // Seçili proje + (üst projeyse) alt projeleri.
  const scopeIds = useMemo(() => {
    if (!pendingProject) return [];
    const ids = [pendingProject.id];
    for (const p of projects) if (p.parentId === pendingProject.id) ids.push(p.id);
    return ids;
  }, [pendingProject, projects]);

  const projectTasks = useMemo(() => {
    if (scopeIds.length === 0) return [];
    const scope = new Set(scopeIds);
    return tasks
      .filter((t) => scope.has(t.projectId) && !t.done)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [tasks, scopeIds]);

  const taskOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [{ key: NO_TASK_KEY, label: 'Görevsiz' }];
    const ids = new Set(projectTasks.map((t) => t.id));
    const byProject = groupBy(projectTasks, (t) => t.projectId);
    const byParent = groupBy(projectTasks, (t) => t.parentTaskId);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const visited = new Set<string>();
    for (const projectId of scopeIds) {
      const owned = byProject.get(projectId) ?? [];
      if (owned.length === 0) continue;
      // Alt projenin görevlerinde hangi projeye ait olduğu alt yazıyla belirtilir.
      const childName =
        projectId === scopeIds[0] ? undefined : projectById.get(projectId)?.name;
      const tops = owned.filter((t) => !t.parentTaskId || !ids.has(t.parentTaskId));
      for (const top of tops) {
        if (visited.has(top.id)) continue;
        visited.add(top.id);
        options.push({ key: top.id, label: top.title, caption: childName });
        const stack = [top.id];
        while (stack.length > 0) {
          const parentId = stack.pop()!;
          for (const sub of byParent.get(parentId) ?? []) {
            if (visited.has(sub.id) || sub.projectId !== projectId) continue;
            visited.add(sub.id);
            options.push({ key: sub.id, label: sub.title, indent: true, caption: childName });
            stack.push(sub.id);
          }
        }
      }
    }
    return options;
  }, [projectTasks, scopeIds, projects]);

  // Kalıcı seçim bayatlamış olabilir (görev silinmiş/tamamlanmış/başka proje).
  const pendingTask = projectTasks.find((t) => t.id === timer.pendingTaskId) ?? null;

  return {
    projectOptions,
    taskOptions,
    pendingProject,
    pendingTask,
    projectTasks,
    selectProject: (key: string) => timer.setPendingProject(key === NO_PROJECT_KEY ? null : key),
    selectTask: (key: string) => timer.setPendingTask(key === NO_TASK_KEY ? null : key),
  };
}
