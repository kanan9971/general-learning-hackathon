import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketSectionId, MarketsFeed, Move } from '@/api/client';
import { Card } from '@/components/Card';
import { Arrow, TONE, type NodeTone } from '@/components/Diagrams';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Radius } from '@/constants/theme';
import { level as levelText, signed } from '@/lib/format';

type MapNode = { symbol: string; label: string; section: MarketSectionId };

// Top-down: how news normally travels through the market. Symbols match the backend universe.
const LAYERS: { title: string; edge: string; nodes: MapNode[] }[] = [
  {
    title: 'The price of money',
    edge: 'sets the price of money for every other market',
    nodes: [
      { symbol: 'UST2Y', label: 'Fed expectations (2Y yield)', section: 'macro' },
      { symbol: 'UST3M', label: 'T-bill (Fed proxy)', section: 'macro' },
    ],
  },
  {
    title: 'Bond market',
    edge: 'changes rate gaps between countries and the real return on holding cash',
    nodes: [
      { symbol: 'UST10Y', label: '10Y yield', section: 'rates' },
      { symbol: 'US2S10S', label: 'Curve (2s10s)', section: 'rates' },
    ],
  },
  {
    title: 'Dollar & commodities',
    edge: 'discounts future profits and shifts the mood towards or away from risk',
    nodes: [
      { symbol: 'DX-Y.NYB', label: 'US dollar', section: 'fx' },
      { symbol: 'GC=F', label: 'Gold', section: 'commodities' },
      { symbol: 'CL=F', label: 'Oil', section: 'commodities' },
    ],
  },
  {
    title: 'The stock market',
    edge: 'hits each industry differently, depending on its balance sheet',
    nodes: [
      { symbol: '^GSPC', label: 'S&P 500', section: 'equities' },
      { symbol: '^VIX', label: 'VIX (fear)', section: 'equities' },
    ],
  },
  {
    title: 'Sectors',
    edge: '',
    nodes: [
      { symbol: 'XLK', label: 'Tech', section: 'sectors' },
      { symbol: 'XLF', label: 'Banks', section: 'sectors' },
      { symbol: 'XLE', label: 'Energy', section: 'sectors' },
    ],
  },
];

function toneOf(m?: Move): NodeTone {
  if (!m) return 'unknown';
  return m.change > 0 ? 'up' : m.change < 0 ? 'down' : 'neutral';
}

/**
 * The market as one connected diagram. Each box is coloured by today's real move, so a learner can
 * literally see where the news entered and how far it travelled. Tap a box to open that market.
 */
export function MarketMap({ feed, onOpen }: { feed: MarketsFeed; onOpen: (s: MarketSectionId) => void }) {
  const bySymbol = new Map<string, Move>();
  feed.sections.forEach((s) => s.moves.forEach((m) => bySymbol.set(m.symbol, m)));
  const biggest = [...bySymbol.values()].filter((m) => LAYERS.some((l) => l.nodes.some((n) => n.symbol === m.symbol)))
    .sort((a, b) => b.score - a.score)[0];

  return (
    <Card>
      {LAYERS.map((layer, li) => (
        <View key={layer.title}>
          <Text style={styles.layerTitle}>{layer.title}</Text>
          <View style={styles.row}>
            {layer.nodes.map((n) => {
              const m = bySymbol.get(n.symbol);
              const t = TONE[toneOf(m)];
              const hot = biggest?.symbol === n.symbol;
              return (
                <Pressable
                  key={n.symbol}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${n.label}`}
                  onPress={() => onOpen(n.section)}
                  style={({ pressed }) => [
                    styles.node,
                    { backgroundColor: t.bg, borderColor: hot ? Palette.accent : t.border, borderWidth: hot ? 3 : 1.5 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.label}>{n.label}</Text>
                  {m ? (
                    <>
                      <Text style={[styles.change, { color: t.fg }]}>{signed(m.change, m.change_unit)}</Text>
                      <Text style={styles.level}>{levelText(m)}</Text>
                    </>
                  ) : (
                    <Text style={styles.level}>no data</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          {layer.edge ? <Arrow caption={layer.edge} /> : null}
        </View>
      ))}
      <View style={styles.legend}>
        <ThemedText type="caption" themeColor="textSecondary">
          Green = up, red = down (1 day). The gold outline is the biggest move vs a typical day. Tap a box to learn
          that market.
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  layerTitle: {
    fontFamily: Fonts.mono,
    color: Palette.muted,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', gap: 8 },
  node: { flex: 1, borderRadius: Radius.md, padding: 10, gap: 2, minHeight: 78, justifyContent: 'center' },
  label: { color: Palette.text, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  change: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  level: { color: Palette.muted, fontSize: 11, fontVariant: ['tabular-nums'] },
  legend: { marginTop: 8 },
});
