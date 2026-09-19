// Keeps Fact / Interpretation / Teaching / Your view visually distinct.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

export type SectionKind = 'fact' | 'interpretation' | 'teaching' | 'you';

const META: Record<SectionKind, { label: string; color: string; bg: string }> = {
  fact: { label: 'FACT (from data)', color: Palette.muted, bg: Palette.surface },
  interpretation: { label: 'AI INTERPRETATION', color: Palette.accent, bg: Palette.softAccent },
  teaching: { label: 'TEACHING', color: Palette.secondary, bg: Palette.softSuccess },
  you: { label: 'YOUR VIEW', color: Palette.primary, bg: Palette.softInfo },
};

export function LabelledSection({ kind, children }: { kind: SectionKind; children: React.ReactNode }) {
  const { label, color, bg } = META[kind];
  return (
    <View style={[styles.card, { borderLeftColor: color, backgroundColor: bg }]}>
      <ThemedText type="smallBold" style={{ color }}>{label}</ThemedText>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  body: { marginTop: 6, gap: 4 },
});
