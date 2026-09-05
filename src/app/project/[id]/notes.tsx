import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects } from '@/features/projects/projects-context';
import { F, L, R } from '@/features/ui/theme';

/** Proje notu/dokümantasyonu — tam ekran düz metin editörü, otomatik kayıt. */
export default function ProjectNotesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, setProjectNote } = useProjects();
  const project = projects.find((p) => p.id === id);

  const [body, setBody] = useState(project?.noteBody ?? '');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Taslak, proje kimliği değiştiğinde tazelenir: ekran veri gelmeden monte
  // olsa bile boş taslak kaydedilip notun üzerine yazılmasın.
  const projectId = project?.id;
  const savedNote = project?.noteBody ?? '';
  const [draftProjectId, setDraftProjectId] = useState(projectId);
  if (draftProjectId !== projectId) {
    setDraftProjectId(projectId);
    setBody(savedNote);
  }

  // Yazarken 500 ms'de bir otomatik kaydet; çıkarken son halini yaz.
  const onChange = (text: string) => {
    setBody(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (project) setProjectNote(project.id, text);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const goBack = () => {
    // DataGate veriler yüklenmeden editörü açmaz; boş not da geçerli bir düzenlemedir.
    if (project) {
      setProjectNote(project.id, body);
    }
    router.back();
  };

  if (!project) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <Text style={styles.empty}>Proje bulunamadı.</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={24} color={L.ink} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {project.name} · Notlar
            </Text>
            <Text style={styles.autosave} maxFontSizeMultiplier={1.2}>
              otomatik kaydedilir
            </Text>
          </View>
          <View style={styles.headerButton} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TextInput
            style={styles.editor}
            value={body}
            onChangeText={onChange}
            placeholder="Dokümantasyon, kaynak bağlantıları, notlar…"
            placeholderTextColor={L.tertiary}
            multiline
            textAlignVertical="top"
            autoFocus={!project.noteBody}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: L.surface,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 56,
    backgroundColor: L.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.hairline,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 16,
  },
  autosave: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 11,
    marginTop: 1,
  },
  editor: {
    flex: 1,
    color: L.ink,
    fontFamily: F.ui,
    fontSize: 15,
    lineHeight: 23,
    padding: 16,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  empty: {
    color: L.tertiary,
    fontFamily: F.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  pressed: {
    backgroundColor: L.pressed,
  },
});
