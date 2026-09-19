import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Layout, Palette, Radius } from '@/constants/theme';

export type CardTone = 'surface' | 'info' | 'accent' | 'success' | 'error';

const TONE_BG: Record<CardTone, string> = {
  surface: Palette.surface,
  info: Palette.softInfo,
  accent: Palette.softAccent,
  success: Palette.softSuccess,
  error: Palette.softError,
};

/**
 * The one card surface used everywhere (padding 16, radius 12, 1px border).
 * Pass `onPress` to get a tappable card with a highlighted pressed state.
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && { backgroundColor: Palette.softInfo, borderColor: Palette.primary },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: Layout.cardPadding,
    gap: Layout.cardGap,
  },
});
