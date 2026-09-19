import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Palette } from '@/constants/theme';

export type ChainItem = { from: string; to: string; why: string };

/** Numbered cause → effect steps on a vertical rail. */
export function ChainList({ steps }: { steps: ChainItem[] }) {
  return (
    <Card style={{ gap: 0 }}>
      {steps.map((step, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.rail}>
            <View style={styles.index}>
              <Text style={styles.indexText}>{i + 1}</Text>
            </View>
            {i < steps.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={[styles.body, i < steps.length - 1 && { paddingBottom: 16 }]}>
            <Text style={styles.from}>{step.from}</Text>
            <Text style={styles.to}>→ {step.to}</Text>
            <Text style={styles.why}>{step.why}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 28 },
  index: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: Palette.white, fontWeight: '700', fontSize: 13 },
  line: { flex: 1, width: 2, backgroundColor: Palette.border, marginVertical: 4 },
  body: { flex: 1, gap: 2 },
  from: { color: Palette.muted, fontSize: 13, fontWeight: '600' },
  to: { color: Palette.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  why: { color: Palette.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
});
