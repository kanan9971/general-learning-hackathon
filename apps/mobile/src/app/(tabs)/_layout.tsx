import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, type ColorValue, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable, useSelectionPop } from '@/components/Motion';
import { Elevation, Palette } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Default bar (49pt) is sized for a 10pt label; we use a 12pt label + 24pt icon so give it room.
const TAB_BAR_HEIGHT = 60;

type TabIconProps = { color: ColorValue; focused: boolean };

/** The icon pops when its tab becomes active. */
function TabIcon({ outline, filled, color, focused }: TabIconProps & { outline: IconName; filled: IconName }) {
  const pop = useSelectionPop(focused);
  return (
    <Animated.View style={pop}>
      <Ionicons name={focused ? filled : outline} size={24} color={color} />
    </Animated.View>
  );
}

const ICONS = {
  index: ['today-outline', 'today'],
  portfolio: ['briefcase-outline', 'briefcase'],
  learn: ['git-network-outline', 'git-network'],
  practice: ['flask-outline', 'flask'],
} as const satisfies Record<string, readonly [IconName, IconName]>;

function tabIcon(tab: keyof typeof ICONS) {
  const [outline, filled] = ICONS[tab];
  const Icon = (p: TabIconProps) => <TabIcon outline={outline} filled={filled} {...p} />;
  Icon.displayName = `TabIcon(${tab})`;
  return Icon;
}

/** Tab buttons compress like every other button in the app instead of flashing an opacity. */
function TabButton({
  children,
  style,
  onPress,
  onLongPress,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent | React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  accessibilityRole?: ComponentProps<typeof AnimatedPressable>['accessibilityRole'];
  accessibilityState?: ComponentProps<typeof AnimatedPressable>['accessibilityState'];
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <AnimatedPressable
      onPress={onPress as (e: GestureResponderEvent) => void}
      onLongPress={onLongPress ?? undefined}
      accessibilityRole={accessibilityRole ?? 'tab'}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      haptic="selection"
      pressScale={0.92}
      style={[styles.tabButton, style]}
    >
      {children}
    </AnimatedPressable>
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
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarStyle: {
          backgroundColor: Palette.surface,
          borderTopColor: Palette.border,
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT + insets.bottom,
          ...Elevation.footer,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('index') }} />
      <Tabs.Screen name="portfolio" options={{ title: 'Portfolio', tabBarIcon: tabIcon('portfolio') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: tabIcon('learn') }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice', tabBarIcon: tabIcon('practice') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
