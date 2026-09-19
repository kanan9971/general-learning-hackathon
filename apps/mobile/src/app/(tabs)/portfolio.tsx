import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { getFixture } from '@/api/client';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { Screen } from '@/components/Screen';
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

  return (
    <Screen title="Portfolio" subtitle="Demo book · numbers from attribution (not the LLM)">
      <LabelledSection kind="fact">
        <ThemedText type="subtitle" style={{ fontSize: 28 }}>
          {attribution.portfolio_return_pct.toFixed(2)}%
        </ThemedText>
        <ThemedText themeColor="textSecondary">Day P&L (calculated)</ThemedText>
      </LabelledSection>

      <Text style={styles.section}>Contributors</Text>
      {attribution.contributions.map((c) => (
        <View key={c.symbol} style={styles.row}>
          <Text style={styles.symbol}>{c.symbol}</Text>
          <Text style={styles.meta}>
            w {(c.weight * 100).toFixed(0)}% · ret {c.return_pct.toFixed(2)}%
          </Text>
          <Text style={styles.contrib}>{c.contribution_pct.toFixed(2)}%</Text>
        </View>
      ))}

      <Text style={styles.section}>Sectors</Text>
      <View style={styles.sectors}>
        {Object.entries(attribution.sectors).map(([name, w]) => (
          <View key={name} style={styles.sectorChip}>
            <Text style={styles.sectorText}>
              {name} {(w * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>

      <LabelledSection kind="interpretation">
        <ThemedText>{narrative.summary}</ThemedText>
        {narrative.position_notes.map((n) => (
          <ThemedText key={n.symbol} type="small" themeColor="textSecondary">
            {n.symbol}: {n.explanation} ({n.confidence})
          </ThemedText>
        ))}
      </LabelledSection>

      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: Palette.text, fontWeight: '700', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 10,
    padding: 12,
  },
  symbol: { color: Palette.primary, fontWeight: '800', width: 48 },
  meta: { flex: 1, color: Palette.muted, fontSize: 13 },
  contrib: { color: Palette.text, fontWeight: '700' },
  sectors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorChip: {
    backgroundColor: Palette.softInfo,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectorText: { color: Palette.primary, fontSize: 13, fontWeight: '600' },
});
