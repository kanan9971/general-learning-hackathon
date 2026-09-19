import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Section title that sits above a group of cards. Same size and top spacing on every
 * screen; optional right-aligned meta (count, unit, "as of…").
 */
export function SectionHeader({
  title,
  meta,
  first,
}: {
  title: string;
  meta?: string;
  /** Skip the extra top margin when it is the first thing under the screen title. */
  first?: boolean;
}) {
  return (
    <View style={[styles.row, !first && styles.spaced]}>
      <ThemedText type="sectionTitle">{title}</ThemedText>
      {meta ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {meta}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  spaced: { marginTop: Spacing.three },
});
