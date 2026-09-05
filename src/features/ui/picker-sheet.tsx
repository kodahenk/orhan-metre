import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useDeferredValue, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchField } from './collection';
import { searchText } from './collection-utils';
import { F, L, R } from './theme';

export type PickerOption = { key: string; label: string; color?: string; indent?: boolean; caption?: string };
type PickerSheetProps = {
  visible: boolean; title: string; options: PickerOption[]; selectedKey?: string | null;
  onSelect: (key: string) => void; onClose: () => void;
};

/** Unmount on dismiss so searches and scroll position never leak into the next picker. */
export function PickerSheet(props: PickerSheetProps) {
  return props.visible ? <PickerContent {...props} /> : null;
}

function PickerContent({ title, options, selectedKey, onSelect, onClose }: PickerSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const filtered = useMemo(() => {
    const needle = searchText(deferred);
    return needle ? options.filter((option) => searchText(`${option.label} ${option.caption ?? ''}`).includes(needle)) : options;
  }, [deferred, options]);
  const searchable = options.length > 7;
  const availableHeight = Math.max(120, height - insets.top - insets.bottom - 32);
  const sheetHeight = Math.min(availableHeight, options.length > 7 ? 580 : 104 + options.length * 66);
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Pencereyi kapat" onPress={(event) => { event.stopPropagation(); onClose(); }} />
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[styles.sheet, { height: sheetHeight, maxHeight: '100%', paddingBottom: Math.max(12, insets.bottom) }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>{title}</Text>
          <Pressable style={styles.close} accessibilityRole="button" accessibilityLabel="Seçimi kapat" onPress={(event) => { event.stopPropagation(); onClose(); }}>
            <Feather name="x" size={22} color={L.ink2} />
          </Pressable>
        </View>
        {searchable && <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Seçeneklerde ara…" />
          <Text style={styles.count} accessibilityLiveRegion="polite">{filtered.length} seçenek</Text>
        </View>}
        <FlashList data={filtered} keyExtractor={(item) => item.key} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" maintainVisibleContentPosition={{ disabled: true }} extraData={selectedKey}
          ListEmptyComponent={<View style={styles.empty}><Feather name="search" size={24} color={L.tertiary} /><Text style={styles.caption}>{query ? 'Sonuç bulunamadı. Aramanı değiştir.' : 'Henüz seçilebilecek bir öğe yok.'}</Text></View>}
          renderItem={({ item }) => {
            const selected = selectedKey === item.key;
            return <Pressable accessibilityRole="button" accessibilityLabel={[item.label, item.caption].filter(Boolean).join(', ')}
              accessibilityState={{ selected }} style={({ pressed }) => [styles.row, item.indent && styles.indent, selected && styles.selected, pressed && styles.pressed]}
              onPress={(event) => {
                event.stopPropagation();
                // Close the current sheet first. An action may immediately open a different sheet.
                onClose();
                onSelect(item.key);
              }}>
              {item.color && <View style={[styles.dot, { backgroundColor: item.color }]} />}
              <View style={styles.body}>
                <Text style={[styles.label, selected && { color: L.accent }]}>{item.label}</Text>
                {!!item.caption && <Text style={styles.caption}>{item.caption}</Text>}
              </View>
              {selected && <Feather name="check" size={18} color={L.accent} />}
            </Pressable>;
          }} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,22,40,0.45)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: L.surface, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: L.hairline },
  title: { flex: 1, minWidth: 0, color: L.ink, fontFamily: F.uiSemi, fontSize: 18 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  search: { padding: 12, gap: 8 },
  count: { color: L.tertiary, fontFamily: F.ui, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, minHeight: 56, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.hairline },
  indent: { paddingLeft: 36 },
  selected: { backgroundColor: L.selected },
  pressed: { backgroundColor: L.pressed },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  label: { color: L.ink, fontFamily: F.uiMed, fontSize: 14, flexShrink: 1 },
  caption: { color: L.ink2, fontFamily: F.ui, fontSize: 12, lineHeight: 18 },
  empty: { padding: 24, gap: 12, alignItems: 'center' },
});
