import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Default bar (49pt) is sized for a 10pt label; we use a 12pt label + 24pt icon so give it room.
const TAB_BAR_HEIGHT = 60;

function tabIcon(outline: IconName, filled: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={24} color={color} />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.primary,
        tabBarInactiveTintColor: Palette.muted,
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: Palette.surface,
          borderTopColor: Palette.border,
          height: TAB_BAR_HEIGHT + insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Quiz', tabBarIcon: tabIcon('help-circle-outline', 'help-circle') }}
      />
      <Tabs.Screen
        name="markets"
        options={{ title: 'Markets', tabBarIcon: tabIcon('trending-up-outline', 'trending-up') }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{ title: 'Portfolio', tabBarIcon: tabIcon('pie-chart-outline', 'pie-chart') }}
      />
      <Tabs.Screen
        name="learn"
        options={{ title: 'Learn', tabBarIcon: tabIcon('school-outline', 'school') }}
      />
    </Tabs>
  );
}
