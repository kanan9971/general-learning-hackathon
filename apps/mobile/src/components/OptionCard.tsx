import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Layout, Palette, Radius } from '@/constants/theme';

type State = 'idle' | 'correct' | 'incorrect' | 'missed';

const LETTERS = 'ABCDEFGH';

/**
 * MCQ answer row. The letter badge fills in when selected so the chosen answer is obvious
 * at a glance; after submit it becomes ✓ / ✕. Border width is constant to avoid layout jump.
 */
export function OptionCard({
  label,
  selected,
  onPress,
  index,
  state = 'idle',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 0-based; renders as A/B/C/D. */
  index?: number;
  /** After submit: show correct / incorrect styling. */
  state?: State;
}) {
  const tone =
    state === 'correct' || state === 'missed'
      ? { border: Palette.success, bg: Palette.softSuccess, badge: Palette.success }
      : state === 'incorrect'
        ? { border: Palette.error, bg: Palette.softError, badge: Palette.error }
        : selected
          ? { border: Palette.primary, bg: Palette.softInfo, badge: Palette.primary }
          : { border: Palette.border, bg: Palette.surface, badge: Palette.border };

  const filled = selected || state !== 'idle';
  const glyph =
    state === 'correct' || state === 'missed'
      ? '✓'
      : state === 'incorrect'
        ? '✕'
        : index !== undefined
          ? LETTERS[index] ?? ''
          : '';

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: tone.border, backgroundColor: tone.bg },
        pressed && !selected && state === 'idle' && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.badge,
          { borderColor: tone.badge, backgroundColor: filled ? tone.badge : Palette.surface },
        ]}
      >
        <Text style={[styles.badgeText, { color: filled ? Palette.white : Palette.muted }]}>{glyph}</Text>
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: Layout.controlHeight + 4,
    borderWidth: 2,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Layout.cardPadding,
  },
  pressed: { backgroundColor: Palette.softInfo },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '700', lineHeight: 16 },
  label: {
    flex: 1,
    color: Palette.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  labelSelected: { fontWeight: '700' },
});
