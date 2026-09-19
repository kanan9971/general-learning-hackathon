// Keeps Fact / Interpretation / Teaching / Your view visually distinct (see CLAUDE.md rule 5).
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export type SectionKind = 'fact' | 'interpretation' | 'teaching' | 'you';
const META: Record<SectionKind, { label: string; color: string }> = {
  fact: { label: 'FACT (calculated from data)', color: '#64748B' },
  interpretation: { label: 'AI INTERPRETATION', color: '#D97706' },
  teaching: { label: 'TEACHING', color: '#0F766E' },
  you: { label: 'YOUR VIEW', color: '#7C3AED' },
};

export function LabelledSection({ kind, children }: { kind: SectionKind; children: React.ReactNode }) {
  const { label, color } = META[kind];
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderLeftColor: color }]}>
      <ThemedText type="smallBold" style={{ color }}>{label}</ThemedText>
      <View style={styles.body}>{children}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderRadius: 8, padding: 12 },
  body: { marginTop: 6, gap: 4 },
});
