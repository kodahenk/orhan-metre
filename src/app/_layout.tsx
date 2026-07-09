import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  RobotoMono_200ExtraLight,
  RobotoMono_300Light,
  RobotoMono_500Medium,
} from '@expo-google-fonts/roboto-mono';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ProjectsProvider } from '@/features/projects/projects-context';
import { SettingsProvider } from '@/features/timer/settings-context';
import { TimerProvider } from '@/features/timer/timer-context';

export default function RootLayout() {
  // İki font ailesi: arayüz Inter, zamanlayıcı Roboto Mono.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    RobotoMono_200ExtraLight,
    RobotoMono_300Light,
    RobotoMono_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <SettingsProvider>
      <ProjectsProvider>
        <TimerProvider>
          <ThemeProvider value={DarkTheme}>
            {/* Normal ekranlarda sistem çubukları görünür (açık stil);
                tam ekran zamanlayıcı odaktayken kendisi gizler. */}
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#000000' },
              }}
            />
          </ThemeProvider>
        </TimerProvider>
      </ProjectsProvider>
    </SettingsProvider>
  );
}
