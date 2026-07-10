import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects } from '@/features/projects/projects-context';
import { ScreenHeader } from '@/features/ui/components';
import { F, L, R } from '@/features/ui/theme';

export default function ProjectsScreen() {
  const router = useRouter();
  const { projects, addProject } = useProjects();
  const [newName, setNewName] = useState('');

  const submit = () => {
    const name = newName.trim();
    if (!name) return;
    addProject(name);
    setNewName('');
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Projeler" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Proje listesi — tek beyaz kart içinde satırlar */}
            <View style={styles.card}>
              {projects.map((project, i) => {
                const total = project.tasks.length;
                const done = project.tasks.filter((t) => t.done).length;
                return (
                  <Pressable
                    key={project.id}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && styles.rowSeparator,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => router.push(`/project/${project.id}`)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: project.color }]} />
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle} maxFontSizeMultiplier={1.3}>
                        {project.name}
                      </Text>
                      <Text style={styles.rowMeta} maxFontSizeMultiplier={1.3}>
                        {total === 0 ? 'Görev yok' : `${done}/${total} görev tamamlandı`}
                      </Text>
                    </View>
                    {total > 0 && (
                      <View style={styles.progressWrap}>
                        <View
                          style={[
                            styles.progressBar,
                            { width: `${Math.round((done / total) * 100)}%` },
                          ]}
                        />
                      </View>
                    )}
                    <Feather name="chevron-right" size={20} color={L.tertiary} />
                  </Pressable>
                );
              })}
            </View>

            {/* Yeni proje */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Yeni proje adı"
                placeholderTextColor={L.tertiary}
                onSubmitEditing={submit}
                returnKeyType="done"
                maxLength={40}
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                onPress={submit}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: L.canvas,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 68,
    paddingVertical: 12,
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: L.hairline,
  },
  rowPressed: {
    backgroundColor: L.pressed,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowTitle: {
    color: L.ink,
    fontFamily: F.uiMed,
    fontSize: 15,
  },
  rowMeta: {
    color: L.ink2,
    fontFamily: F.ui,
    fontSize: 13,
    marginTop: 3,
  },
  progressWrap: {
    width: 52,
    height: 4,
    backgroundColor: L.hairline,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    backgroundColor: L.success,
  },
  addRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    height: 48,
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 15,
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: R.md,
    paddingHorizontal: 12,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: R.md,
    backgroundColor: L.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: {
    backgroundColor: L.accentPressed,
  },
});
