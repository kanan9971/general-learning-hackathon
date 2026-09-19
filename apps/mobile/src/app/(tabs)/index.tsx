import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getFixture, getHealth, type DataMode, type Health } from '@/api/client';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { EventCard } from '@/components/EventCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { getPlan, type LearnerPlan } from '@/lib/learner';
import { Layout, Palette, Radius } from '@/constants/theme';

type Fact = { fact_id: string; label?: string; symbol: string; value: number; unit: string };
type Event = {
  id: string;
  title: string;
  catalyst: string;
  confidence?: string;
};
type Brief = {
  as_of_date: string;
  data_mode: DataMode;
  strip: Fact[];
  events: Event[];
};

const FALLBACK_BRIEF: Brief = {
  as_of_date: '2000-01-01',
  data_mode: 'demo',
  strip: [
    { fact_id: 'SPX.pct_change.1d', label: 'S&P 500', symbol: '^GSPC', value: 0, unit: '%' },
    { fact_id: 'US10Y.bp_change.1d', label: 'US 10Y', symbol: '^TNX', value: 0, unit: 'bp' },
  ],
  events: [
    {
      id: 'evt-1',
      title: 'Placeholder: inflation surprise lifts yields',
      catalyst: 'Placeholder catalyst (likely, not certain)',
      confidence: 'medium',
    },
  ],
};

export default function TodayScreen() {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [plan, setPlan] = useState<LearnerPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlan().then(setPlan);
    Promise.all([getHealth().catch(() => null), getFixture<Brief>('brief')])
      .then(([h, b]) => {
        setHealth(h);
        setBrief(b);
      })
      .catch(() => {
        setBrief(FALLBACK_BRIEF);
        setError('API offline — showing local demo brief');
      });
  }, []);

  if (!brief) {
    return (
      <Screen title="Today">
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Today"
      subtitle={plan ? `Plan tone: ${plan.level}` : undefined}
      footer={
        <>
          <PrimaryButton label="Start today's quiz" onPress={() => router.push('/quiz')} />
          <Disclaimer />
        </>
      }
    >
      <View style={styles.statusRow}>
        <DataModeBadge mode={brief.data_mode} asOf={brief.as_of_date} />
        {health ? (
          <Text style={styles.meta}>
            API {health.status} · v{health.version}
          </Text>
        ) : null}
      </View>
      {error ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warn}>{error}</Text>
        </View>
      ) : null}

      <SectionHeader title="Cross-asset strip" meta="1-day change" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        style={styles.stripScroll}
      >
        {brief.strip.map((f) => (
          <View key={f.fact_id} style={styles.stripCard}>
            <Text style={styles.stripLabel}>{f.label ?? f.symbol}</Text>
            <Text
              style={[
                styles.stripValue,
                f.value > 0 && { color: Palette.success },
                f.value < 0 && { color: Palette.error },
              ]}
            >
              {f.value > 0 ? '+' : ''}
              {f.value}
              {f.unit}
            </Text>
          </View>
        ))}
      </ScrollView>

      <SectionHeader title="Case studies" meta={`${brief.events.length} today`} />
      {brief.events.map((e) => (
        <EventCard
          key={e.id}
          title={e.title}
          catalyst={e.catalyst}
          confidence={e.confidence}
          onPress={() => router.push(`/event/${e.id}`)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: { color: Palette.muted, fontSize: 12 },
  warnBanner: {
    backgroundColor: Palette.softAccent,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warn: { color: Palette.warning, fontSize: 13, fontWeight: '600' },
  // Bleed the strip to the screen edge so cards peek in and invite a swipe.
  stripScroll: { marginHorizontal: -Layout.screenPadding },
  strip: { gap: 8, paddingHorizontal: Layout.screenPadding },
  stripCard: {
    backgroundColor: Palette.surface,
    borderColor: Palette.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Layout.cardPadding,
    paddingVertical: 12,
    minWidth: 112,
    gap: 4,
  },
  stripLabel: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  stripValue: { color: Palette.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
