import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Motion } from '@/components/Motion';
import { Palette, Radius } from '@/constants/theme';

/** Session/cycle progress. Fill uses scaleX so we never animate width. */
export function ProgressBar({
  percent,
  color = Palette.primary,
  trackColor = Palette.surfaceSunken,
  height = 8,
}: {
  percent: number;
  color?: string;
  /** Pass `OnDark.track` when the bar sits on a HeroCard. */
  trackColor?: string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, percent)) / 100;
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(reduced ? clamped : withSpring(Math.max(clamped, 0.03), Motion.smooth));
  }, [clamped, progress, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View
      accessibilityRole="progressbar"
      style={[styles.track, { height, borderRadius: Radius.sm, backgroundColor: trackColor }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            backgroundColor: color,
            borderRadius: Radius.sm,
            transformOrigin: 'left center',
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { width: '100%' },
});
