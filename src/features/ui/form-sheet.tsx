import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, L, R } from './theme';

export function FormSheet({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Pencereyi kapat" />
      <View style={styles.card} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Kapat" style={styles.close} onPress={onClose}>
            <Feather name="x" size={22} color={L.ink2} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.body}>
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(12,22,40,0.45)' },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '100%', backgroundColor: L.surface, borderRadius: R.lg, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: L.hairline },
  title: { flex: 1, minWidth: 0, fontFamily: F.uiSemi, color: L.ink, fontSize: 18 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 14 },
});
