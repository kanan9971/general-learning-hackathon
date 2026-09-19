import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';

export function OptionCard({
  label,
  selected,
  onPress,
  state,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** After submit: show correct / incorrect styling. */
  state?: 'idle' | 'correct' | 'incorrect' | 'missed';
}) {
  const border =
    state === 'correct'
      ? Palette.success
      : state === 'incorrect'
        ? Palette.error
        : state === 'missed'
          ? Palette.success
          : selected
            ? Palette.primary
            : Palette.border;
  const bg =
    state === 'correct' || state === 'missed'
      ? Palette.softSuccess
      : state === 'incorrect'
        ? '#FDECEC'
        : selected
          ? Palette.softInfo
          : Palette.surface;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, { borderColor: border, backgroundColor: bg }]}
    >
      <View style={[styles.radio, { borderColor: border, backgroundColor: selected ? border : 'transparent' }]} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginTop: 2,
  },
  label: {
    flex: 1,
    color: Palette.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
});
