// Keeps Fact / Interpretation / Teaching / Your view visually distinct.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Elevation, Layout, Palette, Radius } from '@/constants/theme';

export type SectionKind = 'fact' | 'interpretation' | 'teaching' | 'you';

const META: Record<SectionKind, { label: string; color: string; bg: string }> = {
  fact: { label: 'Fact · from data', color: Palette.muted, bg: Palette.surface },
  interpretation: { label: 'AI interpretation', color: Palette.warning, bg: Palette.softAccent },
  teaching: { label: 'Teaching', color: Palette.secondary, bg: Palette.softSuccess },
  you: { label: 'Your view', color: Palette.primary, bg: Palette.softInfo },
};

/**
 * Same footprint as `Card` (padding 20, radius 14) plus a 4px colour rail and a kicker,
 * so labelled blocks line up with plain cards on the same screen.
 */
export function LabelledSection({
  kind,
  title,
  children,
}: {
  kind: SectionKind;
  /** Optional heading shown under the kicker (e.g. "Catalyst"). */
  title?: string;
  children: React.ReactNode;
}) {
  const { label, color, bg } = META[kind];
  return (
    <View style={[styles.card, { borderLeftColor: color, backgroundColor: bg }]}>
      <ThemedText type="kicker" style={{ color }}>
        {label}
      </ThemedText>
      {title ? <ThemedText type="sectionTitle">{title}</ThemedText> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Layout.cardPadding,
    gap: 8,
    ...Elevation.card,
  },
  body: { gap: 6 },
});
