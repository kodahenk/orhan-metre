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
import { C, F } from '@/features/ui/theme';

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
            {projects.map((project) => {
              const total = project.tasks.length;
              const done = project.tasks.filter((t) => t.done).length;
              return (
                <Pressable
                  key={project.id}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  onPress={() => router.push(`/project/${project.id}`)}
                >
                  <View style={[styles.colorDot, { backgroundColor: project.color }]} />
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
                      {project.name}
                    </Text>
                    <Text style={styles.cardMeta} maxFontSizeMultiplier={1.3}>
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
                  <Feather name="chevron-right" size={18} color={C.text3} />
                </Pressable>
              );
            })}

            {/* Yeni proje */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Yeni proje adı"
                placeholderTextColor={C.faint}
                onSubmitEditing={submit}
                returnKeyType="done"
                maxLength={40}
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
                onPress={submit}
              >
                <Feather name="plus" size={20} color={C.text} />
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
    backgroundColor: C.bg,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cardTitle: {
    color: C.text,
    fontFamily: F.uiSemi,
    fontSize: 15,
  },
  cardMeta: {
    color: C.text3,
    fontFamily: F.ui,
    fontSize: 12,
    marginTop: 3,
  },
  progressWrap: {
    width: 52,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.green,
  },
  addRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  input: {
    flex: 1,
    color: C.text,
    fontFamily: F.ui,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  addButton: {
    width: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
