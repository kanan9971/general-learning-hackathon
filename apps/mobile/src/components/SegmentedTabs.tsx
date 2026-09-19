import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { AnimatedPressable, Motion } from '@/components/Motion';
import { Palette, Radius } from '@/constants/theme';

/** Page-level tabs: one focus at a time instead of one long scroll. */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const inset = 4;
  const tabW = tabs.length && width > inset * 2 ? (width - inset * 2) / tabs.length : 0;

  useEffect(() => {
    if (!tabW) return;
    const next = index * tabW;
    x.set(reduced ? next : withSpring(next, Motion.smooth));
  }, [index, reduced, tabW, x]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View
      style={styles.wrap}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {tabW > 0 ? <Animated.View pointerEvents="none" style={[styles.pill, { width: tabW }, pill]} /> : null}
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <AnimatedPressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.id)}
            haptic="selection"
            pressScale={0.95}
            style={({ hovered }) => [styles.tab, hovered && !on && styles.tabHover]}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {t.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Palette.surfaceSunken,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    padding: 4,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: Palette.primary,
    borderRadius: Radius.pill,
  },
  tab: { flex: 1, paddingVertical: 10, minHeight: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  tabHover: { backgroundColor: 'rgba(28, 25, 23, 0.04)' },
  text: { color: Palette.muted, fontSize: 14, fontWeight: '700' },
  textOn: { color: Palette.white },
});
