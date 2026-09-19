import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { FlowDiagram } from '@/components/Diagrams';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { MarketMap } from '@/components/MarketMap';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { asOfLabel } from '@/lib/format';
import { useMarketsFeed } from '@/lib/useMarketsFeed';

type Tab = 'map' | 'chain' | 'desks';

/** "How it all connects": one idea per tab so nobody has to scroll to find the next thing. */
export default function ConnectScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const router = useRouter();
  const { feed } = useMarketsFeed();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'chain');

  return (
    <Screen
      title="How it all connects"
      subtitle="Markets are one machine. News enters at the top and ripples down."
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton
            label="Test what you learned: what-if scenarios"
            onPress={() => router.push({ pathname: '/lab', params: { kinds: 'scenario' } })}
          />
          <Disclaimer />
        </>
      }
    >
      <Stack.Screen options={{ title: 'How it connects' }} />
      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'chain', label: 'The chain' },
          { id: 'map', label: "Today's map" },
          { id: 'desks', label: 'S&T desks' },
        ]}
      />

      {!feed ? (
        <ActivityIndicator color={Palette.primary} />
      ) : tab === 'chain' ? (
        <>
          <LabelledSection kind="teaching" title={feed.primer.title}>
            <ThemedText type="small">{feed.primer.intro}</ThemedText>
          </LabelledSection>
          <FlowDiagram
            nodes={[
              { label: feed.primer.steps[0].from_, tone: 'shock' },
              ...feed.primer.steps.map((s, i) => ({
                label: s.to,
                tone: (i === feed.primer.steps.length - 1 ? 'goal' : 'neutral') as 'goal' | 'neutral',
              })),
            ]}
            edges={feed.primer.steps.map((s) => s.why)}
          />
        </>
      ) : tab === 'map' ? (
        <>
          <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} />
          <MarketMap
            feed={feed}
            onOpen={(id) => router.push({ pathname: '/market/[section]', params: { section: id } })}
          />
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            A bank splits the market into desks. Each desk owns one layer of the chain above.
          </ThemedText>
          {feed.sections
            .filter((s) => s.group !== 'foundations' && s.group !== 'portfolio')
            .sort((a, b) => feed.interest_options.findIndex((o) => o.id === a.id) - feed.interest_options.findIndex((o) => o.id === b.id))
            .map((s) => (
              <Card
                key={s.id}
                onPress={() => router.push({ pathname: '/market/[section]', params: { section: s.id } })}
                accessibilityLabel={`Open ${s.title}`}
              >
                <Text style={styles.title}>{s.title}</Text>
                <ThemedText type="small">{s.guide.desk}</ThemedText>
                <View>
                  <Text style={styles.link}>Learn this desk's market</Text>
                </View>
              </Card>
            ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: Palette.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  link: { color: Palette.primary, fontSize: 14, fontWeight: '700' },
});
