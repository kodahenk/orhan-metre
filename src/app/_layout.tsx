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
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ProjectsProvider } from '@/features/projects/projects-context';
import { SessionsProvider } from '@/features/sessions/sessions-context';
import { SettingsProvider } from '@/features/timer/settings-context';
import { TimerProvider } from '@/features/timer/timer-context';
import { L } from '@/features/ui/theme';

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
        <SessionsProvider>
          <TimerProvider>
          <ThemeProvider value={DefaultTheme}>
            {/* Light ekranlarda koyu durum çubuğu simgeleri;
                tam ekran zamanlayıcı odaktayken çubukları kendisi gizler. */}
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: L.canvas },
              }}
            />
          </ThemeProvider>
          </TimerProvider>
        </SessionsProvider>
      </ProjectsProvider>
    </SettingsProvider>
  );
}
