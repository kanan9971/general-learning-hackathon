import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { AnimatedPressable, useFade } from '@/components/Motion';
import { Elevation, Layout, Palette, Radius } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'inverted';
type IconName = ComponentProps<typeof Ionicons>['name'];

type Look = { bg: string; fg: string; border: string; borderWidth: number; overlay: string };

const VARIANT: Record<Variant, Look> = {
  primary: { bg: Palette.primary, fg: Palette.white, border: Palette.primary, borderWidth: 0, overlay: '#000000' },
  secondary: { bg: Palette.surface, fg: Palette.primary, border: Palette.primary, borderWidth: 1.5, overlay: Palette.primary },
  ghost: { bg: 'transparent', fg: Palette.primary, border: 'transparent', borderWidth: 0, overlay: Palette.primary },
  // For use on a dark HeroCard: white pill, navy label.
  inverted: { bg: Palette.white, fg: Palette.primary, border: Palette.white, borderWidth: 0, overlay: Palette.primary },
};

/** Disabled is a deliberate state, not a faded copy of the enabled one. */
const DISABLED: Record<Variant, Pick<Look, 'bg' | 'fg' | 'border'>> = {
  primary: { bg: Palette.surfaceSunken, fg: Palette.subtle, border: Palette.surfaceSunken },
  secondary: { bg: Palette.surface, fg: Palette.subtle, border: Palette.border },
  ghost: { bg: 'transparent', fg: Palette.subtle, border: 'transparent' },
  inverted: { bg: 'rgba(255, 255, 255, 0.22)', fg: 'rgba(255, 255, 255, 0.6)', border: 'transparent' },
};

/**
 * One button height (52) and radius everywhere.
 * primary = the single main action on a screen · secondary = alternate path · ghost = low-key ·
 * inverted = primary action sitting on a dark hero surface.
 * Press compresses + darkens, hover lifts (web), `loading` shows a spinner and blocks taps.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Shows a spinner beside the label and disables the button while true. */
  loading?: boolean;
  /** Optional trailing Ionicon (e.g. "arrow-forward"). */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANT[variant];
  const off = !!disabled || !!loading;
  const look = off ? { ...v, ...DISABLED[variant] } : v;
  const [pressed, setPressed] = useState(false);
  const overlay = useFade(pressed && !off, variant === 'primary' ? 0.14 : 0.08);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      haptic={variant === 'primary' || variant === 'inverted' ? 'light' : 'selection'}
      lift={1}
      style={({ hovered }) => [
        styles.base,
        !off && (variant === 'primary' || variant === 'inverted') && (hovered ? Elevation.raised : variant === 'primary' ? Elevation.primary : Elevation.card),
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          borderWidth: v.borderWidth,
        },
        !off && hovered && variant === 'secondary' && { backgroundColor: Palette.softInfo },
        !off && hovered && variant === 'ghost' && { backgroundColor: Palette.softInfo },
        style,
      ]}
    >
      <Animated.View style={[styles.overlay, { backgroundColor: v.overlay }, overlay]} />
      <View style={styles.row}>
        {loading ? <ActivityIndicator size="small" color={look.fg} /> : null}
        <Text style={[styles.label, { color: look.fg }]} numberOfLines={1}>
          {label}
        </Text>
        {icon && !loading ? <Ionicons name={icon} size={18} color={look.fg} /> : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Layout.controlHeight,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same radius as the button so it needs no overflow clipping (which would eat iOS shadows).
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.md,
    pointerEvents: 'none',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
