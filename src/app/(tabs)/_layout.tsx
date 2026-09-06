import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, type ColorValue } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, L } from '@/features/ui/theme';

function tabIcon(name: keyof typeof Feather.glyphMap) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Feather name={name} size={22} color={color} />;
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: L.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: L.hairline,
          elevation: 0,
          height: 56 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarActiveTintColor: L.accent,
        tabBarInactiveTintColor: L.tertiary,
        tabBarLabelStyle: {
          fontFamily: F.uiMed,
          fontSize: 11,
          letterSpacing: 0.2,
        },
        sceneStyle: { backgroundColor: L.canvas },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{ title: 'Projeler', tabBarIcon: tabIcon('folder') }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Takvim', tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'Odak', tabBarIcon: tabIcon('clock') }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: 'Raporlar', tabBarIcon: tabIcon('bar-chart-2') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Ayarlar', tabBarIcon: tabIcon('settings') }}
      />
    </Tabs>
  );
}
