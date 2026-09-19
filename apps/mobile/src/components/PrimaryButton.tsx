import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Layout, Palette, Radius } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT: Record<Variant, { bg: string; pressedBg: string; fg: string; border: string }> = {
  primary: { bg: Palette.primary, pressedBg: Palette.primaryHover, fg: Palette.white, border: Palette.primary },
  secondary: { bg: Palette.surface, pressedBg: Palette.softInfo, fg: Palette.primary, border: Palette.primary },
  ghost: { bg: 'transparent', pressedBg: Palette.softInfo, fg: Palette.primary, border: 'transparent' },
};

/**
 * One button height (52) and radius everywhere.
 * primary = the single main action on a screen · secondary = alternate path · ghost = low-key.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANT[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? v.pressedBg : v.bg,
          borderColor: v.border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
    </Pressable>
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
    borderWidth: 1.5,
  },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
