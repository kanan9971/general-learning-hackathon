import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Palette } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

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
  style?: ViewStyle;
}) {
  const bg =
    variant === 'primary'
      ? Palette.primary
      : variant === 'secondary'
        ? Palette.secondary
        : 'transparent';
  const color = variant === 'ghost' ? Palette.primary : Palette.white;
  const borderColor = variant === 'ghost' ? Palette.border : bg;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && variant === 'primary' ? Palette.primaryHover : bg,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
