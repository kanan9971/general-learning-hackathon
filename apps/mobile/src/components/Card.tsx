import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnimatedPressable } from '@/components/Motion';
import { Elevation, Layout, Palette, Radius } from '@/constants/theme';

export type CardTone = 'surface' | 'info' | 'accent' | 'success' | 'error';

const TONE_BG: Record<CardTone, string> = {
  surface: Palette.surface,
  info: Palette.softInfo,
  accent: Palette.softAccent,
  success: Palette.softSuccess,
  error: Palette.softError,
};

/**
 * The one card surface used everywhere (padding 20, radius 14, hairline + warm elevation).
 * Pass `onPress` to get a tappable card with press compression.
 */
export function Card({
  children,
  tone = 'surface',
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  tone?: CardTone;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const base = [styles.card, { backgroundColor: TONE_BG[tone] }, style];

  if (!onPress) {
    return <View style={base}>{children}</View>;
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      haptic="selection"
      lift={2}
      style={({ pressed, hovered }) => [base, (pressed || hovered) && styles.pressed]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: Layout.cardPadding,
    gap: Layout.cardGap,
    ...Elevation.card,
  },
  pressed: { borderColor: Palette.primary, ...Elevation.raised },
});
