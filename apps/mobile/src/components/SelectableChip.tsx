import { Pressable, StyleSheet } from 'react-native';

import { Chip, type ChipTone } from '@/components/Chip';
import { Radius } from '@/constants/theme';

/** Selectable chip — wraps Chip visuals with press + selected state. */
export function SelectableChip({
  label,
  selected,
  onPress,
  tone = 'info',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: ChipTone;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.wrap, selected && styles.selected]}
    >
      <Chip label={selected ? `✓ ${label}` : label} tone={selected ? tone : 'neutral'} outlined={!selected} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: Radius.pill },
  selected: { opacity: 1 },
});
