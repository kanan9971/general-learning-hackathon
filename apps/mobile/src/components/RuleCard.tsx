import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Palette } from '@/constants/theme';

/** A trader's rule of thumb: IF → THEN, the reason, and when it breaks. Builds intuition, not facts. */
export function RuleCard({ rule }: { rule: { when: string; then: string; why: string; exception: string } }) {
  return (
    <Card>
      <View style={styles.line}>
        <Text style={[styles.tag, { color: Palette.primary }]}>If</Text>
        <Text style={styles.text}>{rule.when}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.tag, { color: Palette.secondary }]}>Then</Text>
        <Text style={[styles.text, styles.bold]}>{rule.then}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.tag, { color: Palette.muted }]}>Because</Text>
        <Text style={styles.muted}>{rule.why}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.tag, { color: Palette.warning }]}>Unless</Text>
        <Text style={styles.muted}>{rule.exception}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tag: { width: 62, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 2 },
  text: { flex: 1, color: Palette.text, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '700' },
  muted: { flex: 1, color: Palette.muted, fontSize: 13, lineHeight: 19 },
});
