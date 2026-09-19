import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { MarketSection } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { MoveRow } from '@/components/MoveRow';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

/** A market section as a card: tagline, the top few moves, and a clear "open" affordance. */
export function SectionCard({ section, onOpen }: { section: MarketSection; onOpen: () => void }) {
  const pnl = section.attribution?.portfolio_return_pct;
  const foundation = section.group === 'foundations';
  return (
    <Card onPress={onOpen} accessibilityLabel={`Open ${section.title}`}>
      <View style={styles.between}>
        <Text style={styles.title}>{section.title}</Text>
        {section.pinned ? <Chip label="following" tone="info" size="sm" /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {section.tagline}
      </ThemedText>
      {pnl != null ? (
        <Text style={[styles.pnl, { color: pnl > 0 ? Palette.success : pnl < 0 ? Palette.error : Palette.text }]}>
          {pnl > 0 ? '+' : ''}
          {pnl.toFixed(2)}% today
        </Text>
      ) : null}
      {foundation ? <ThemedText type="small">{section.guide.mental_model}</ThemedText> : null}
      {section.moves.slice(0, 3).map((m, i) => (
        <MoveRow key={m.fact_id} move={m} divider={i > 0} />
      ))}
      <View style={styles.cta}>
        <Text style={styles.link}>Open</Text>
        <Ionicons name="chevron-forward" size={16} color={Palette.primary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { color: Palette.text, fontSize: 18, fontWeight: '700', lineHeight: 24, flex: 1 },
  pnl: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  link: { color: Palette.primary, fontSize: 14, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
});
