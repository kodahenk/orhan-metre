import { Feather } from '@expo/vector-icons';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { pageWindow, searchText } from './collection-utils';
import { F, L, R } from './theme';

export function SearchField({ value, onChangeText, placeholder = 'Ara…' }: {
  value: string; onChangeText: (text: string) => void; placeholder?: string;
}) {
  return <View style={styles.search}>
    <Feather name="search" size={18} color={L.tertiary} />
    <TextInput style={styles.input} accessibilityLabel={placeholder} placeholder={placeholder}
      placeholderTextColor={L.tertiary} value={value} onChangeText={onChangeText}
      autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
    {!!value && <Pressable accessibilityRole="button" accessibilityLabel="Aramayı temizle"
      onPress={() => onChangeText('')} style={styles.icon}>
      <Feather name="x" size={18} color={L.ink2} />
    </Pressable>}
  </View>;
}

export function Pagination({ total, page, onChange, size = 30 }: {
  total: number; page: number; onChange: (page: number) => void; size?: number;
}) {
  const window = pageWindow(total, page, size);
  if (total <= size) return null;
  return <View style={styles.pagination}>
    <Text accessibilityLiveRegion="polite" style={styles.caption}>{window.start + 1}–{window.end} / {total}</Text>
    <View style={styles.navigation}>
      <Pressable style={styles.icon} accessibilityRole="button" accessibilityLabel="Önceki sayfa"
        accessibilityState={{ disabled: window.page === 0 }} disabled={window.page === 0}
        onPress={() => onChange(window.page - 1)}>
        <Feather name="chevron-left" size={20} color={window.page === 0 ? L.borderActive : L.accent} />
      </Pressable>
      <Text style={styles.caption}>{window.page + 1} / {window.pages}</Text>
      <Pressable style={styles.icon} accessibilityRole="button" accessibilityLabel="Sonraki sayfa"
        accessibilityState={{ disabled: window.page === window.pages - 1 }} disabled={window.page === window.pages - 1}
        onPress={() => onChange(window.page + 1)}>
        <Feather name="chevron-right" size={20} color={window.page === window.pages - 1 ? L.borderActive : L.accent} />
      </Pressable>
    </View>
  </View>;
}

type TaskLike = { title: string; done: boolean; note?: string };
type Status = 'all' | 'open' | 'done';
export function useTaskCollection<T extends TaskLike>(items: T[], scope: string | undefined) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [page, setPage] = useState(0);
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setQuery('');
    setStatus('all');
    setPage(0);
  }
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const needle = searchText(deferredQuery);
    return items.filter((item) => (status === 'all' || item.done === (status === 'done')) &&
      (!needle || searchText(`${item.title} ${item.note ?? ''}`).includes(needle)));
  }, [items, deferredQuery, status]);
  const window = pageWindow(filtered.length, page);
  return {
    query, status, page: window.page, total: filtered.length,
    items: filtered.slice(window.start, window.end),
    setPage,
    setQuery: (text: string) => { setQuery(text); setPage(0); },
    setStatus: (value: Status) => { setStatus(value); setPage(0); },
  };
}

export function TaskFilters({ collection }: { collection: Pick<ReturnType<typeof useTaskCollection>, 'query' | 'setQuery' | 'status' | 'setStatus' | 'total'> }) {
  return <View style={styles.filters}>
    <SearchField value={collection.query} onChangeText={collection.setQuery} placeholder="Görevlerde ara…" />
    <View style={styles.filterRow}>
      {([{ key: 'all', label: 'Tümü' }, { key: 'open', label: 'Açık' }, { key: 'done', label: 'Tamamlanan' }] as const).map((item) =>
        <Pressable key={item.key} style={[styles.filter, collection.status === item.key && styles.selected]}
          accessibilityRole="button" accessibilityState={{ selected: collection.status === item.key }} onPress={() => collection.setStatus(item.key)}>
          <Text style={[styles.caption, collection.status === item.key && { color: L.accent }]}>{item.label}</Text>
        </Pressable>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.caption}>{collection.total} görev</Text>
  </View>;
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 4, minHeight: 48, borderWidth: 1, borderColor: L.border, borderRadius: R.md, backgroundColor: L.surface },
  input: { flex: 1, minWidth: 0, paddingVertical: 12, color: L.ink, fontFamily: F.ui, fontSize: 14 },
  icon: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { color: L.ink2, fontFamily: F.uiMed, fontSize: 12, flexShrink: 1 },
  filters: { gap: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: L.border, borderRadius: R.md, backgroundColor: L.surface },
  selected: { borderColor: L.accent, backgroundColor: L.selected },
});
