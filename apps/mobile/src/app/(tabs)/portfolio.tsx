import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { getFixture } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

type PortfolioImpact = {
  attribution: {
    portfolio_return_pct: number;
    contributions: { symbol: string; weight: number; return_pct: number; contribution_pct: number }[];
    sectors: Record<string, number>;
  };
  narrative: {
    summary: string;
    position_notes: { symbol: string; event_id: string | null; explanation: string; confidence: string }[];
    concepts: string[];
  };
  narrative_status: string;
};

const FALLBACK: PortfolioImpact = {
  attribution: {
    portfolio_return_pct: 0,
    contributions: [{ symbol: 'AAA', weight: 0.5, return_pct: 0, contribution_pct: 0 }],
    sectors: { Technology: 0.5, Energy: 0.5 },
  },
  narrative: {
    summary: 'Placeholder AI narrative for the demo book.',
    position_notes: [
      { symbol: 'AAA', event_id: 'evt-1', explanation: 'Placeholder link to today’s event.', confidence: 'low' },
    ],
    concepts: ['real-yields'],
  },
  narrative_status: 'ok',
};

export default function PortfolioScreen() {
  const [data, setData] = useState<PortfolioImpact | null>(null);

  useFocusEffect(
    useCallback(() => {
      getFixture<PortfolioImpact>('portfolio_impact')
        .then(setData)
        .catch(() => setData(FALLBACK));
    }, []),
  );

  if (!data) {
    return (
      <Screen title="Portfolio">
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  const { attribution, narrative } = data;
  const pnl = attribution.portfolio_return_pct;
  const pnlColor = pnl > 0 ? Palette.success : pnl < 0 ? Palette.error : Palette.text;
  const signed = (v: number, digits = 2) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;

  return (
    <Screen title="Portfolio" subtitle="Demo book · numbers from attribution (not the LLM)">
      <LabelledSection kind="fact">
        <ThemedText type="display" style={{ color: pnlColor }}>
          {signed(pnl)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Day P&L · calculated from positions × snapshot
        </ThemedText>
      </LabelledSection>

      <SectionHeader title="Contributors" meta="weight · return → contribution" />
      <Card style={styles.table}>
        {attribution.contributions.map((c, i) => (
          <View key={c.symbol} style={[styles.row, i > 0 && styles.rowDivider]}>
            <Text style={styles.symbol}>{c.symbol}</Text>
            <Text style={styles.meta}>
              {(c.weight * 100).toFixed(0)}% · {signed(c.return_pct)}
            </Text>
            <Text
              style={[
                styles.contrib,
                c.contribution_pct > 0 && { color: Palette.success },
                c.contribution_pct < 0 && { color: Palette.error },
              ]}
            >
              {signed(c.contribution_pct)}
            </Text>
          </View>
        ))}
      </Card>

      <SectionHeader title="Sectors" meta="share of book" />
      <ChipRow>
        {Object.entries(attribution.sectors).map(([name, w]) => (
          <Chip key={name} label={`${name} ${(w * 100).toFixed(0)}%`} tone="info" />
        ))}
      </ChipRow>

      <LabelledSection kind="interpretation" title="What drove it">
        <ThemedText>{narrative.summary}</ThemedText>
        {narrative.position_notes.map((n) => (
          <ThemedText key={n.symbol} type="small" themeColor="textSecondary">
            <Text style={styles.noteSymbol}>{n.symbol}</Text> · {n.explanation} ({n.confidence} confidence)
          </ThemedText>
        ))}
      </LabelledSection>

      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  table: { paddingVertical: 4, gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Palette.border },
  symbol: { color: Palette.primary, fontWeight: '800', fontSize: 15, width: 56 },
  meta: { flex: 1, color: Palette.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  contrib: { color: Palette.text, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] },
  noteSymbol: { color: Palette.primary, fontWeight: '700' },
});
