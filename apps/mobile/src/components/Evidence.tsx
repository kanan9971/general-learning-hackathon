import { StyleSheet, Text, View } from 'react-native';

import type { Headline, Move } from '@/api/client';
import { HeadlineItem } from '@/components/HeadlineItem';
import { Palette, Radius } from '@/constants/theme';
import { signed } from '@/lib/format';

/**
 * The evidence behind an AI claim: the market facts it cites (numbers rendered from data, never
 * from the AI) and the headlines it cites (tap to open the source).
 */
export function Evidence({
  factIds,
  headlineIds,
  moves,
  headlines,
}: {
  factIds: string[];
  headlineIds: string[];
  moves: Map<string, Move>;
  headlines: Map<string, Headline>;
}) {
  const facts = factIds.map((f) => moves.get(f)).filter((m): m is Move => !!m);
  const news = headlineIds.map((h) => headlines.get(h)).filter((h): h is Headline => !!h);
  if (!facts.length && !news.length) {
    return <Text style={styles.none}>No evidence cited, so treat this as unsupported.</Text>;
  }
  return (
    <View style={styles.box}>
      <Text style={styles.kicker}>Evidence</Text>
      {facts.length ? (
        <View style={styles.facts}>
          {facts.map((m) => (
            <View key={m.fact_id} style={styles.fact}>
              <Text style={styles.factLabel} numberOfLines={1}>
                {m.label}
              </Text>
              <Text
                style={[
                  styles.factValue,
                  { color: m.change > 0 ? Palette.success : m.change < 0 ? Palette.error : Palette.text },
                ]}
              >
                {signed(m.change, m.change_unit)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {news.map((h, i) => (
        <HeadlineItem key={h.id} item={h} compact divider={i > 0 || facts.length > 0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 6,
  },
  kicker: { color: Palette.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  fact: {
    backgroundColor: Palette.pageBackground,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  factLabel: { color: Palette.muted, fontSize: 11, fontWeight: '600' },
  factValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  none: { color: Palette.warning, fontSize: 12, fontWeight: '600' },
});
