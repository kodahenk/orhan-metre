/** Locale-aware matching shared by project, task and picker searches. */
export function searchText(value: string): string {
  return value.trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
}

export function pageWindow(total: number, requestedPage: number, size = 30) {
  const pageSize = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(0, Math.min(Math.floor(requestedPage), pages - 1));
  return { page, pages, start: page * pageSize, end: Math.min(total, (page + 1) * pageSize), total };
}

/** Index once instead of filtering the complete collection inside each row. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string | null | undefined) {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (value == null) continue;
    const group = result.get(value);
    if (group) group.push(item);
    else result.set(value, [item]);
  }
  return result;
}
