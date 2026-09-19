import { ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Disclaimer } from '@/components/Disclaimer';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Screen } from '@/components/Screen';
import { SectionCard } from '@/components/SectionCard';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { asOfLabel } from '@/lib/format';
import { useMarketsFeed } from '@/lib/useMarketsFeed';

const META = {
  macro: {
    title: 'Macro analysis',
    subtitle: 'The big picture, top-down: the economy and the Fed, then rates, currencies, commodities, stocks.',
  },
  foundations: {
    title: 'S&T foundations',
    subtitle: 'What every sales & trading hire should know before touching a market.',
  },
} as const;

/** A group of related topics, one card each, in the order to learn them. */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: 'macro' | 'foundations' }>();
  const router = useRouter();
  const { feed } = useMarketsFeed();
  const meta = META[id] ?? META.macro;
  const sections = feed?.sections.filter((s) => s.group === id) ?? [];
  // Learning order (top-down), not "followed first": the page is a path, not a feed.
  const order = feed ? feed.interest_options.map((o) => o.id) : [];
  sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  return (
    <Screen title={meta.title} subtitle={meta.subtitle} safeEdges={['bottom']} footer={<Disclaimer />}>
      <Stack.Screen options={{ title: meta.title }} />
      {!feed ? (
        <ActivityIndicator color={Palette.primary} />
      ) : (
        <>
          {id === 'macro' ? <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} /> : null}
          <ThemedText type="caption" themeColor="textSecondary">
            Tap a topic to open it. Each one has Learn, Today, Test and Desk tabs.
          </ThemedText>
          {sections.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              onOpen={() => router.push({ pathname: '/market/[section]', params: { section: s.id } })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
