import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { DataMode } from '@/api/client';
import { Palette } from '@/constants/theme';

const LABEL: Record<DataMode, string> = { live: 'LIVE', cache: 'CACHED', demo: 'DEMO DAY' };

export function DataModeBadge({ mode, asOf }: { mode: DataMode; asOf?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <ThemedText type="smallBold" style={styles.text}>{LABEL[mode]}</ThemedText>
      </View>
      {asOf ? (
        <ThemedText type="small" themeColor="textSecondary">
          as of {asOf}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: Palette.secondary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: { color: Palette.white, fontSize: 12 },
});
