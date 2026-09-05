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

import { ProjectsProvider, useProjects } from '@/features/projects/projects-context';
import { SessionsProvider, useSessions } from '@/features/sessions/sessions-context';
import { SettingsProvider, useTimerSettings } from '@/features/timer/settings-context';
import { TimerProvider } from '@/features/timer/timer-context';
import { LoadingScreen } from '@/features/ui/components';
import { AppKeyboardProvider } from '@/features/ui/keyboard-provider';
import { L } from '@/features/ui/theme';

/**
 * Veri kapısı: üç depo da diskten okunmadan uygulama ağacı monte edilmez.
 *
 * Bu kapı olmadan ekranlar varsayılan state ile açılıyordu; form ekranları
 * ilk render'daki (boş) değeri sabitleyip kaydettiklerinde gerçek veriyi
 * eziyordu — proje notu boş string ile siliniyor, önayar süreleri
 * varsayılana dönüyordu. Ayrıca Rapor/Projeler bir an "boş" görünüyordu.
 */
function DataGate({ children }: { children: React.ReactNode }) {
  const { loaded: settingsLoaded } = useTimerSettings();
  const { loaded: projectsLoaded } = useProjects();
  const { loaded: sessionsLoaded } = useSessions();
  if (!settingsLoaded || !projectsLoaded || !sessionsLoaded) return <LoadingScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  // İki font ailesi: arayüz Inter, zamanlayıcı Roboto Mono.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    RobotoMono_200ExtraLight,
    RobotoMono_300Light,
    RobotoMono_500Medium,
  });

  if (!fontsLoaded && !fontError) return <LoadingScreen />;

  return (
    <AppKeyboardProvider>
    <SettingsProvider>
      <ProjectsProvider>
        <SessionsProvider>
          <DataGate>
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
          </DataGate>
        </SessionsProvider>
      </ProjectsProvider>
    </SettingsProvider>
    </AppKeyboardProvider>
  );
}
