import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';

import { getMarketOverview, type OverviewResponse } from '@/api/client';
import { Card } from '@/components/Card';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { MarketOverviewCard, type OverviewView } from '@/components/MarketOverviewCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { asOfLabel } from '@/lib/format';
import { getPlan } from '@/lib/learner';
import { useMarketsFeed } from '@/lib/useMarketsFeed';

/** The AI overview on its own page, split into Story / Evidence / Desks so it reads one part at a time. */
export default function OverviewScreen() {
  const { feed, interests } = useMarketsFeed();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<OverviewView>('story');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const plan = await getPlan();
      setData(
        await getMarketOverview({
          level: plan?.level ?? 'beginner',
          interests: interests?.sections ?? [],
          watch: interests?.watch ?? [],
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI overview is unavailable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="AI market overview"
      subtitle="What happened, why, and the evidence for each claim"
      safeEdges={['bottom']}
      footer={<Disclaimer />}
    >
      <Stack.Screen options={{ title: 'AI overview' }} />
      {data ? (
        <>
          <DataModeBadge mode={data.data_mode} asOf={asOfLabel(data.as_of)} />
          <SegmentedTabs<OverviewView>
            value={view}
            onChange={setView}
            tabs={[
              { id: 'story', label: 'Story' },
              { id: 'evidence', label: 'Evidence' },
              { id: 'desks', label: 'Desk views' },
            ]}
          />
          <MarketOverviewCard
            data={data}
            view={view}
            sectionTitles={Object.fromEntries((feed?.sections ?? []).map((s) => [s.id, s.title]))}
          />
          <PrimaryButton label="Refresh overview" variant="ghost" onPress={() => void load()} />
        </>
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            The AI reads today&apos;s numbers and the Fed, WSJ and Yahoo Finance headlines, then explains what happened
            across markets. Every point shows the data and headlines it is based on.
          </ThemedText>
          {error ? (
            <ThemedText type="small" style={{ color: Palette.error }}>
              {error}
            </ThemedText>
          ) : null}
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Palette.primary} />
              <ThemedText type="small" themeColor="textSecondary">
                Reading the market… (~20s)
              </ThemedText>
            </View>
          ) : (
            <PrimaryButton label="Summarise today's market" onPress={() => void load()} />
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
});
