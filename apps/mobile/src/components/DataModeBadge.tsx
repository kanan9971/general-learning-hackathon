import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { DataMode } from '@/api/client';
import { Palette, Radius } from '@/constants/theme';

const LABEL: Record<DataMode, string> = { live: 'Live', cache: 'Cached', demo: 'Demo day' };

export function DataModeBadge({ mode, asOf }: { mode: DataMode; asOf?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <View style={styles.dot} />
        <ThemedText type="kicker" style={styles.text}>
          {LABEL[mode]}
        </ThemedText>
      </View>
      {asOf ? (
        <ThemedText type="caption" themeColor="textSecondary">
          as of {asOf}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.secondary,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.white, opacity: 0.9 },
  text: { color: Palette.white },
});
