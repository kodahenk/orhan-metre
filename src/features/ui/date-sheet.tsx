import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, dateKey, formatDate } from '@/features/timer/format';
import { Button } from './components';
import { FormSheet } from './form-sheet';
import { F, L, R } from './theme';
import { validDateKey } from './date-validation';

type Props = { visible: boolean; value: string | null; onSelect: (value: string | null) => void; onClose: () => void };
export function DateSheet(props: Props) {
  return props.visible ? <DateForm {...props} /> : null;
}
function DateForm({ value, onSelect, onClose }: Props) {
  const [draft, setDraft] = useState(value ?? dateKey(new Date()));
  const valid = validDateKey(draft);
  const choose = (day: string | null) => { onClose(); onSelect(day); };
  return <FormSheet visible title="Görev tarihi" onClose={onClose}>
    <Text style={styles.help}>Yakın bir gün seç veya istediğin tarihi yıl-ay-gün olarak yaz.</Text>
    <View style={styles.row}>
      <Button label="Bugün" onPress={() => choose(dateKey(new Date()))} />
      <Button label="Yarın" onPress={() => choose(dateKey(addDays(new Date(), 1)))} />
      <Button label="Bir hafta sonra" onPress={() => choose(dateKey(addDays(new Date(), 7)))} />
    </View>
    <Text style={styles.label}>Tarih · YYYY-AA-GG</Text>
    <TextInput accessibilityLabel="Görev tarihi, yıl ay gün" style={styles.input} value={draft} onChangeText={setDraft}
      placeholder="2026-09-30" placeholderTextColor={L.tertiary} autoCapitalize="none" autoCorrect={false} maxLength={10}
      returnKeyType="done" onSubmitEditing={() => valid && choose(draft)} />
    <Text accessibilityLiveRegion="polite" style={[styles.help, !valid && { color: L.danger }]}>
      {valid ? formatDate(new Date(`${draft}T12:00:00`)) : 'Geçerli bir tarih gir. Örnek: 2026-09-30.'}
    </Text>
    <Button label="Tarihi kaydet" variant="primary" disabled={!valid} onPress={() => choose(draft)} />
    {value && <Button label="Tarihi kaldır" variant="ghost" onPress={() => choose(null)} />}
  </FormSheet>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  help: { fontFamily: F.ui, fontSize: 13, lineHeight: 20, color: L.ink2 },
  label: { fontFamily: F.uiSemi, fontSize: 13, color: L.ink },
  input: { minHeight: 48, borderWidth: 1, borderColor: L.border, borderRadius: R.md, paddingHorizontal: 14, color: L.ink, fontFamily: F.ui, fontSize: 16 },
});
