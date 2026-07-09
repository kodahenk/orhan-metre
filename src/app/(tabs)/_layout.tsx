import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';

import { C, F } from '@/features/ui/theme';

function tabIcon(name: keyof typeof Feather.glyphMap) {
  return ({ color }: { color: ColorValue }) => <Feather name={name} size={21} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#050607',
          borderTopColor: C.border,
          height: 62,
          paddingTop: 6,
        },
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.text3,
        tabBarLabelStyle: {
          fontFamily: F.uiMed,
          fontSize: 11,
        },
        sceneStyle: { backgroundColor: C.bg },
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
        options={{ title: 'Zamanlayıcı', tabBarIcon: tabIcon('clock') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Ayarlar', tabBarIcon: tabIcon('settings') }}
      />
    </Tabs>
  );
}
