import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SettingsProvider } from '@/features/timer/settings-context';
import { TimerProvider } from '@/features/timer/timer-context';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <TimerProvider>
        <ThemeProvider value={DarkTheme}>
          {/* Normal ekranlarda sistem çubukları görünür (açık stil);
              zamanlayıcı ekranı odaktayken kendisi gizler. */}
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#000000' },
            }}
          />
        </ThemeProvider>
      </TimerProvider>
    </SettingsProvider>
  );
}
