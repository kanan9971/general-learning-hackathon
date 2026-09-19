import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { MarketSectionId } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SelectableChip } from '@/components/SelectableChip';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { getInterests, saveInterests } from '@/lib/interests';

// Mirrors the backend guide's section ids; titles are just labels for the picker.
const OPTIONS: { group: string; items: { id: MarketSectionId; label: string; hint: string }[] }[] = [
  {
    group: 'Macro · the big picture',
    items: [
      { id: 'macro', label: 'Fed & economy', hint: 'inflation, jobs, interest-rate decisions' },
      { id: 'rates', label: 'Rates & bonds', hint: 'Treasury yields and the yield curve' },
      { id: 'fx', label: 'Currencies', hint: 'the dollar, euro, yen' },
      { id: 'commodities', label: 'Commodities', hint: 'oil, gas, gold, copper' },
      { id: 'equities', label: 'Stock market & VIX', hint: 'indices and risk mood' },
    ],
  },
  { group: 'Micro · industries', items: [{ id: 'sectors', label: 'Sectors', hint: 'tech, banks, energy…' }] },
  {
    group: 'Company · single stocks',
    items: [{ id: 'companies', label: 'Company analysis', hint: 'earnings, guidance, deals' }],
  },
  { group: 'Your money', items: [{ id: 'portfolio', label: 'My portfolio', hint: 'how today hit your holdings' }] },
  {
    group: 'Foundations · what every S&T hire should know',
    items: [
      { id: 'desk', label: 'How a desk makes money', hint: 'sales, trading, market-making' },
      { id: 'valuation', label: 'Business & valuation', hint: 'profits, cash, multiples' },
      { id: 'risk', label: 'Risk & sizing', hint: 'position size, correlation, liquidity' },
    ],
  },
];

const TICKER_RX = /^[A-Z][A-Z0-9.-]{0,9}$/;

export default function InterestsScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<MarketSectionId[]>([]);
  const [watch, setWatch] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    getInterests().then((i) => {
      setSections(i.sections);
      setWatch(i.watch);
    });
  }, []);

  const toggle = (id: MarketSectionId) =>
    setSections((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addTicker = () => {
    const t = draft.trim().toUpperCase();
    if (!t) return;
    if (!TICKER_RX.test(t)) return setDraftError('Use a ticker symbol like AAPL or BRK-B');
    if (watch.length >= 10) return setDraftError('Up to 10 companies');
    setDraftError(null);
    setWatch((w) => (w.includes(t) ? w : [...w, t]));
    setDraft('');
  };

  const onSave = async () => {
    await saveInterests({ sections, watch });
    router.back();
  };

  return (
    <Screen
      title="Your interests"
      subtitle="Followed markets appear first. You can still open every section."
      safeEdges={['bottom']}
      footer={<PrimaryButton label="Save" onPress={() => void onSave()} />}
    >
      {OPTIONS.map((g) => (
        <View key={g.group} style={{ gap: 8 }}>
          <SectionHeader title={g.group} />
          {g.items.map((o) => (
            <View key={o.id} style={styles.optRow}>
              <SelectableChip label={o.label} selected={sections.includes(o.id)} onPress={() => toggle(o.id)} />
              <ThemedText type="caption" themeColor="textSecondary" style={{ flex: 1 }}>
                {o.hint}
              </ThemedText>
            </View>
          ))}
        </View>
      ))}

      <SectionHeader title="Companies you follow" meta={`${watch.length}/10`} />
      <Card>
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addTicker}
            placeholder="Ticker, e.g. TSLA"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            placeholderTextColor={Palette.muted}
          />
          <PrimaryButton label="Add" variant="secondary" onPress={addTicker} style={{ minWidth: 80 }} />
        </View>
        {draftError ? (
          <ThemedText type="caption" style={{ color: Palette.error }}>
            {draftError}
          </ThemedText>
        ) : null}
        <ChipRow>
          {watch.map((t) => (
            <SelectableChip key={t} label={t} selected onPress={() => setWatch((w) => w.filter((x) => x !== t))} />
          ))}
        </ChipRow>
        {!watch.length ? (
          <ThemedText type="caption" themeColor="textSecondary">
            No tickers yet: company analysis shows a few large, widely-followed names.
          </ThemedText>
        ) : (
          <Chip label="tap a ticker to remove it" tone="neutral" size="sm" />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    fontSize: 16,
    color: Palette.text,
    backgroundColor: Palette.surface,
  },
});
