import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { F, L, R } from './theme';

export function SectionTitle({ title, detail, right }: { title: string; detail?: string; right?: ReactNode }) {
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
    {detail && <Text style={styles.detail}>{detail}</Text>}
    {right}
  </View>;
}

export function FieldRow({ icon, label, value, onPress, disabled = false }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.field, pressed && { backgroundColor: L.pressed }]}>
    <Feather name={icon} size={17} color={L.tertiary} />
    <Text style={styles.label}>{label}</Text>
    <Text numberOfLines={2} style={styles.value}>{value}</Text>
    <Feather name={disabled ? "lock" : "chevron-right"} size={16} color={L.tertiary} />
  </Pressable>;
}

export function AddRow({ value, onChange, onSubmit, placeholder }: { value: string; onChange: (text: string) => void; onSubmit: () => void; placeholder: string }) {
  return <View style={styles.add}>
    <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={L.tertiary} style={styles.input}
      value={value} onChangeText={onChange} onSubmitEditing={onSubmit} returnKeyType="done" submitBehavior="submit" maxLength={160} />
    <Pressable accessibilityRole="button" accessibilityLabel="Ekle" disabled={!value.trim()} accessibilityState={{ disabled: !value.trim() }}
      onPress={onSubmit} style={[styles.addButton, !value.trim() && { opacity: 0.35 }]}>
      <Feather name="plus" size={20} color={L.accent} />
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  sectionTitle: { flex: 1, minWidth: 0, fontFamily: F.uiSemi, fontSize: 13, color: L.ink },
  detail: { fontFamily: F.ui, color: L.tertiary, fontSize: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.hairline },
  label: { color: L.ink2, fontFamily: F.ui, fontSize: 13 },
  value: { flex: 1, minWidth: 0, textAlign: 'right', color: L.ink, fontFamily: F.uiMed, fontSize: 13 },
  add: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: L.border, borderRadius: R.md },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, color: L.ink, fontFamily: F.ui, fontSize: 14 },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
