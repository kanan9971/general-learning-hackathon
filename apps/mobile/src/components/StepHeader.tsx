import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

/** Numbered step in a learning path: makes the page read as "understand → see → test → think". */
export function StepHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Text style={styles.n}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText type="sectionTitle">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  n: { color: Palette.white, fontWeight: '800', fontSize: 15 },
});
