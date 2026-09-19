import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getFixture, getHealth, type DataMode, type Health } from '@/api/client';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { EventCard } from '@/components/EventCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { getPlan, type LearnerPlan } from '@/lib/learner';
import { Palette } from '@/constants/theme';

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
    >
      <DataModeBadge mode={brief.data_mode} asOf={brief.as_of_date} />
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      {health ? (
        <Text style={styles.meta}>
          API {health.status} · v{health.version}
        </Text>
      ) : null}

      <Text style={styles.section}>Cross-asset strip</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {brief.strip.map((f) => (
          <View key={f.fact_id} style={styles.stripCard}>
            <Text style={styles.stripLabel}>{f.label ?? f.symbol}</Text>
            <Text style={styles.stripValue}>
              {f.value}
              {f.unit}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.section}>Case studies</Text>
      {brief.events.map((e) => (
        <EventCard
          key={e.id}
          title={e.title}
          catalyst={e.catalyst}
          confidence={e.confidence}
          onPress={() => router.push(`/event/${e.id}`)}
        />
      ))}

      <PrimaryButton
        label="Start today's quiz"
        onPress={() => router.push('/quiz')}
        style={{ marginTop: 4 }}
      />
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: { color: Palette.warning, fontSize: 13 },
  meta: { color: Palette.muted, fontSize: 12 },
  section: {
    color: Palette.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  strip: { gap: 8, paddingVertical: 4 },
  stripCard: {
    backgroundColor: Palette.surface,
    borderColor: Palette.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
  },
  stripLabel: { color: Palette.muted, fontSize: 11, fontWeight: '600' },
  stripValue: { color: Palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 },
});
