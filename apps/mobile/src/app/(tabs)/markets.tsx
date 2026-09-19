import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  getMarketOverview,
  getMarketsFeed,
  type MarketGroup,
  type MarketSection,
  type MarketsFeed,
  type OverviewResponse,
} from '@/api/client';
import { Card } from '@/components/Card';
import { FlowDiagram } from '@/components/Diagrams';
import { MarketMap } from '@/components/MarketMap';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { HeadlineItem } from '@/components/HeadlineItem';
import { LabelledSection } from '@/components/LabelledSection';
import { MarketOverviewCard } from '@/components/MarketOverviewCard';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { asOfLabel } from '@/lib/format';
import { getInterests, type MarketInterests } from '@/lib/interests';
import { getPlan } from '@/lib/learner';

const GROUPS: { id: MarketGroup; title: string; meta: string }[] = [
  { id: 'macro', title: 'Macro', meta: 'top-down: economy → rates → FX → commodities → stocks' },
  { id: 'micro', title: 'Micro', meta: 'industries & sectors' },
  { id: 'company', title: 'Company', meta: 'single stocks' },
  { id: 'portfolio', title: 'Your portfolio', meta: 'demo book' },
  { id: 'foundations', title: 'Foundations', meta: 'what every S&T hire should know' },
];

export default function MarketsScreen() {
  const router = useRouter();
  const [feed, setFeed] = useState<MarketsFeed | null>(null);
  const [interests, setInterests] = useState<MarketInterests | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrimer, setShowPrimer] = useState(false);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOverview = async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [i, plan] = await Promise.all([getInterests(), getPlan()]);
      setOverview(
        await getMarketOverview({ level: plan?.level ?? 'beginner', interests: i.sections, watch: i.watch }),
      );
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : 'The AI overview is unavailable');
    } finally {
      setOverviewLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setError(null);
        const i = await getInterests();
        if (cancelled) return;
        setInterests(i);
        try {
          const f = await getMarketsFeed({ interests: i.sections, watch: i.watch });
          if (!cancelled) setFeed(f);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load markets');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!feed) {
    return (
      <Screen title="Markets">
        {error ? (
          <Card tone="error">
            <ThemedText type="smallBold">Markets are unavailable</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}. Is the backend running?
            </ThemedText>
          </Card>
        ) : (
          <ActivityIndicator color={Palette.primary} />
        )}
      </Screen>
    );
  }

  const pinnedTitles = feed.sections.filter((s) => s.pinned).map((s) => s.title);
  const pricesDown = feed.providers.prices === 'failed' && feed.data_mode !== 'demo';

  return (
    <Screen
      title="Markets"
      subtitle="What moved, why, and how desks think about it"
      footer={<Disclaimer />}
    >
      <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} />
      {pricesDown ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>Live prices are unreachable, showing the last saved market day.</Text>
        </View>
      ) : null}

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
              Pick the markets and companies you care about.
            </ThemedText>
          ) : null}
        </ChipRow>
      </Card>

      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.primary }}>
          Market Lab
        </ThemedText>
        <ThemedText type="smallBold">Do you actually understand how markets work?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Predict moves before you see them, and answer &quot;what if the Fed had done the opposite?&quot; scenarios that
          test cause and effect. Built from today&apos;s real data; it updates your Learn progress.
        </ThemedText>
        <PrimaryButton label="Start a 6-question set" onPress={() => router.push('/lab')} />
        <PrimaryButton
          label="What-if scenarios only"
          variant="secondary"
          onPress={() => router.push({ pathname: '/lab', params: { kinds: 'scenario' } })}
        />
      </Card>

      <SectionHeader title="AI market overview" meta="summary · explanation · evidence" />
      {overview ? (
        <>
          <MarketOverviewCard
            data={overview}
            sectionTitles={Object.fromEntries(feed.sections.map((s) => [s.id, s.title]))}
          />
          <PrimaryButton label="Refresh overview" variant="ghost" onPress={() => void loadOverview()} />
        </>
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            The AI reads today&apos;s numbers and the Fed, WSJ and Yahoo Finance headlines, then explains what
            happened across markets. Every point shows the data and headlines it is based on.
          </ThemedText>
          {overviewError ? (
            <ThemedText type="small" style={{ color: Palette.error }}>
              {overviewError}
            </ThemedText>
          ) : null}
          {overviewLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Palette.primary} />
              <ThemedText type="small" themeColor="textSecondary">
                Reading the market… (~20s)
              </ThemedText>
            </View>
          ) : (
            <PrimaryButton label="Summarise today's market" onPress={() => void loadOverview()} />
          )}
        </Card>
      )}

      <SectionHeader title="Today's market map" meta="how news flows down the chain" />
      <MarketMap
        feed={feed}
        onOpen={(id) => router.push({ pathname: '/market/[section]', params: { section: id } })}
      />

      <LabelledSection kind="teaching" title={feed.primer.title}>
        <ThemedText type="small">{feed.primer.intro}</ThemedText>
        {showPrimer ? (
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
        ) : null}
        <PrimaryButton
          label={showPrimer ? 'Hide the chain' : 'Show how it connects'}
          variant="ghost"
          onPress={() => setShowPrimer((v) => !v)}
        />
      </LabelledSection>

      {feed.top_moves.length ? (
        <>
          <SectionHeader title="Biggest moves" meta="vs a typical day" />
          <LabelledSection kind="fact">
            {feed.top_moves.map((m, i) => (
              <MoveRow key={m.fact_id} move={m} divider={i > 0} />
            ))}
          </LabelledSection>
        </>
      ) : null}

      {GROUPS.map((g) => {
        const sections = feed.sections.filter((s) => s.group === g.id);
        if (!sections.length) return null;
        return (
          <View key={g.id} style={{ gap: 12 }}>
            <SectionHeader title={g.title} meta={g.meta} />
            {sections.map((s) => (
              <SectionCard key={s.id} section={s} onOpen={() => router.push({ pathname: '/market/[section]', params: { section: s.id } })} />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

function SectionCard({ section, onOpen }: { section: MarketSection; onOpen: () => void }) {
  const pnl = section.attribution?.portfolio_return_pct;
  return (
    <Card onPress={onOpen} accessibilityLabel={`Open ${section.title}`}>
      <View style={styles.rowBetween}>
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
      {section.group === 'foundations' ? (
        <ThemedText type="small">{section.guide.mental_model}</ThemedText>
      ) : null}
      {section.moves.slice(0, 3).map((m, i) => (
        <MoveRow key={m.fact_id} move={m} divider={i > 0} />
      ))}
      {section.note && !section.moves.length ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {section.note}
        </ThemedText>
      ) : null}
      {section.headlines[0] ? <HeadlineItem item={section.headlines[0]} compact divider /> : null}
      <View style={styles.cta}>
        <Text style={styles.link}>{section.group === 'foundations' ? 'Learn it, then test yourself' : 'Learn it, see it today, test yourself'}</Text>
        <Ionicons name="chevron-forward" size={16} color={Palette.primary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { color: Palette.text, fontSize: 18, fontWeight: '700', lineHeight: 24, flex: 1 },
  pnl: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  link: { color: Palette.primary, fontSize: 14, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  warn: { backgroundColor: Palette.softAccent, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  warnText: { color: Palette.warning, fontSize: 13, fontWeight: '600' },
});
