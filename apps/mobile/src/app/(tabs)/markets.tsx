import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import type { MarketGroup, MarketSectionId } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { HubTile, TileGrid } from '@/components/HubTile';
import { LabelledSection } from '@/components/LabelledSection';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { asOfLabel } from '@/lib/format';
import { useMarketsFeed } from '@/lib/useMarketsFeed';

/**
 * The Markets hub: a short page of big buttons, each opening its own focused page.
 * Nothing here scrolls past a screen or two; the depth lives one tap away.
 */
export default function MarketsHub() {
  const router = useRouter();
  const { feed, interests, error, reload } = useMarketsFeed();

  if (!feed) {
    return (
      <Screen title="Markets">
        {error ? (
          <Card tone="error">
            <ThemedText type="smallBold">Markets are unavailable</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}. Is the backend running?
            </ThemedText>
            <PrimaryButton label="Try again" variant="secondary" onPress={() => void reload()} />
          </Card>
        ) : (
          <ActivityIndicator color={Palette.primary} />
        )}
      </Screen>
    );
  }

  const count = (g: MarketGroup) => feed.sections.filter((s) => s.group === g).length;
  const pinnedTitles = feed.sections.filter((s) => s.pinned).map((s) => s.title);
  const openSection = (id: MarketSectionId) => router.push({ pathname: '/market/[section]', params: { section: id } });
  const openGroup = (id: 'macro' | 'foundations') => router.push({ pathname: '/group/[id]', params: { id } });
  const pricesDown = feed.providers.prices === 'failed' && feed.data_mode !== 'demo';

  return (
    <Screen title="Markets" subtitle="Pick where to start" footer={<Disclaimer />}>
      <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} />
      {pricesDown ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>Live prices are unreachable, showing the last saved market day.</Text>
        </View>
      ) : null}

      {/* 1 · The one-screen answer to "what happened today?" */}
      <LabelledSection kind="fact" title="Today at a glance">
        {feed.top_moves.slice(0, 3).map((m, i) => (
          <MoveRow key={m.fact_id} move={m} divider={i > 0} />
        ))}
      </LabelledSection>

      {/* 2 · Start here */}
      <SectionHeader title="Start here" first />
      <TileGrid>
        <HubTile
          wide
          tone="accent"
          icon="git-network-outline"
          title="How it all connects"
          subtitle="See how the Fed, rates, the dollar, oil and stocks move together, and which S&T desk trades what."
          onPress={() => router.push('/connect')}
        />
        <HubTile
          tone="teal"
          icon="sparkles-outline"
          title="AI market overview"
          subtitle="What happened today and why, with the evidence."
          onPress={() => router.push('/overview')}
        />
        <HubTile
          tone="info"
          icon="map-outline"
          title="Market map"
          subtitle="Today's moves on one diagram."
          onPress={() => router.push({ pathname: '/connect', params: { tab: 'map' } })}
        />
      </TileGrid>

      {/* 3 · Learn one area at a time */}
      <SectionHeader title="Learn the markets" meta="one area per page" />
      <TileGrid>
        <HubTile
          tone="info"
          icon="globe-outline"
          title="Macro analysis"
          subtitle="Fed, rates, dollar, oil, stocks"
          badge={`${count('macro')} topics`}
          onPress={() => openGroup('macro')}
        />
        <HubTile
          tone="success"
          icon="business-outline"
          title="Micro: sectors"
          subtitle="Banks, tech, energy and more"
          onPress={() => openSection('sectors')}
        />
        <HubTile
          tone="accent"
          icon="briefcase-outline"
          title="Company analysis"
          subtitle="Earnings, guidance, what's priced in"
          onPress={() => openSection('companies')}
        />
        <HubTile
          tone="teal"
          icon="pie-chart-outline"
          title="My portfolio"
          subtitle="How today hit your holdings"
          onPress={() => openSection('portfolio')}
        />
        <HubTile
          wide
          tone="info"
          icon="school-outline"
          title="S&T foundations"
          subtitle="How a desk makes money, valuation basics, risk and sizing"
          badge={`${count('foundations')} topics`}
          onPress={() => openGroup('foundations')}
        />
      </TileGrid>

      {/* 4 · Test yourself */}
      <SectionHeader title="Test yourself" meta="on today's real data" />
      <TileGrid>
        <HubTile
          tone="error"
          icon="shuffle-outline"
          title="What-if scenarios"
          subtitle="What if the Fed did the opposite?"
          onPress={() => router.push({ pathname: '/lab', params: { kinds: 'scenario' } })}
        />
        <HubTile
          tone="info"
          icon="flask-outline"
          title="Market Lab"
          subtitle="Predict, order, explain"
          onPress={() => router.push('/lab')}
        />
      </TileGrid>

      {/* 5 · Personalise */}
      <Card onPress={() => router.push('/interests')} accessibilityLabel="Customise interests">
        <View style={styles.rowBetween}>
          <ThemedText type="kicker" style={{ color: Palette.secondary }}>
            Your interests
          </ThemedText>
          <Text style={styles.link}>Customise</Text>
        </View>
        <ChipRow>
          {pinnedTitles.map((t) => (
            <Chip key={t} label={t} tone="info" size="sm" />
          ))}
          {(interests?.watch ?? []).map((t) => (
            <Chip key={t} label={t} tone="accent" size="sm" />
          ))}
          {!pinnedTitles.length && !interests?.watch.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              Pick the markets and companies you care about; they show first.
            </ThemedText>
          ) : null}
        </ChipRow>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: Palette.primary, fontSize: 14, fontWeight: '700' },
  warn: { backgroundColor: Palette.softAccent, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  warnText: { color: Palette.warning, fontSize: 13, fontWeight: '600' },
});
