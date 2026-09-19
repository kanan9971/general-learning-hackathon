import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getFixture } from '@/api/client';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

type ChainStep = { from_?: string; from?: string; to: string; explanation: string };
type Event = {
  id: string;
  title: string;
  catalyst: string;
  mechanism_chain: ChainStep[];
  positively_affected: string[];
  negatively_affected: string[];
  alternatives: { explanation: string; evidence_that_would_confirm: string }[];
  confidence: string;
  confidence_reason: string;
  concept_ids: string[];
  fact_ids: string[];
};
type Brief = { events: Event[]; strip: { fact_id: string; label?: string; value: number; unit: string }[] };

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [facts, setFacts] = useState<{ fact_id: string; label?: string; value: number; unit: string }[]>([]);

  useEffect(() => {
    getFixture<Brief>('brief')
      .then((b) => {
        setEvent(b.events.find((e) => e.id === id) ?? b.events[0] ?? null);
        setFacts(b.strip ?? []);
      })
      .catch(() => {
        setFacts([
          { fact_id: 'US10Y.bp_change.1d', label: 'US 10Y', value: 0, unit: 'bp' },
        ]);
        setEvent({
          id: 'evt-1',
          title: 'Placeholder: inflation surprise lifts yields',
          catalyst: 'Placeholder catalyst (likely, not certain)',
          mechanism_chain: [
            {
              from_: 'Higher-than-expected inflation',
              to: 'Rate expectations stay higher',
              explanation: 'Placeholder explanation.',
            },
            {
              from_: 'Rate expectations stay higher',
              to: 'Government bond yields rise',
              explanation: 'Placeholder explanation.',
            },
            {
              from_: 'Government bond yields rise',
              to: 'Long-duration growth equities face pressure',
              explanation: 'Higher discount rate on future earnings.',
            },
          ],
          positively_affected: ['Banks'],
          negatively_affected: ['Long-duration growth equities'],
          alternatives: [
            {
              explanation: 'Positioning ahead of earnings',
              evidence_that_would_confirm: 'Volume spike without a yield move',
            },
          ],
          confidence: 'medium',
          confidence_reason: 'Supported by headlines only (placeholder).',
          concept_ids: ['real-yields', 'bond-price-yield'],
          fact_ids: ['US10Y.bp_change.1d'],
        });
      });
  }, [id]);

  if (!event) {
    return (
      <Screen title="Case study">
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  const relatedFacts = facts.filter((f) => event.fact_ids?.includes(f.fact_id));

  return (
    <Screen title={event.title}>
      <LabelledSection kind="fact">
        {relatedFacts.length ? (
          relatedFacts.map((f) => (
            <ThemedText key={f.fact_id}>
              {f.label ?? f.fact_id}: {f.value}
              {f.unit}
            </ThemedText>
          ))
        ) : (
          <ThemedText>Numbers come from the daily snapshot (fixture).</ThemedText>
        )}
      </LabelledSection>

      <LabelledSection kind="interpretation">
        <ThemedText type="smallBold">Catalyst</ThemedText>
        <ThemedText>{event.catalyst}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Confidence: {event.confidence} — {event.confidence_reason}
        </ThemedText>
      </LabelledSection>

      <Text style={styles.section}>Causal chain</Text>
      {event.mechanism_chain.map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepIndex}>{i + 1}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.stepTitle}>
              {step.from_ ?? step.from} → {step.to}
            </Text>
            <Text style={styles.stepBody}>{step.explanation}</Text>
          </View>
        </View>
      ))}

      <LabelledSection kind="interpretation">
        <ThemedText type="smallBold">Alternatives</ThemedText>
        {event.alternatives.map((a, i) => (
          <ThemedText key={i}>
            {a.explanation} — confirm with: {a.evidence_that_would_confirm}
          </ThemedText>
        ))}
      </LabelledSection>

      <View style={styles.row}>
        <View style={styles.chipCol}>
          <Text style={styles.chipLabel}>+ Affected</Text>
          {event.positively_affected.map((x) => (
            <Text key={x} style={styles.pos}>
              {x}
            </Text>
          ))}
        </View>
        <View style={styles.chipCol}>
          <Text style={styles.chipLabel}>− Affected</Text>
          {event.negatively_affected.map((x) => (
            <Text key={x} style={styles.neg}>
              {x}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.concepts}>
        {event.concept_ids.map((c) => (
          <View key={c} style={styles.conceptChip}>
            <Text style={styles.conceptText}>{c}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton label="Start today's quiz" onPress={() => router.push('/quiz')} />
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: Palette.text, fontWeight: '700', fontSize: 15 },
  step: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 10,
    padding: 12,
  },
  stepIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    backgroundColor: Palette.softInfo,
    color: Palette.primary,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stepTitle: { color: Palette.text, fontWeight: '700', fontSize: 14 },
  stepBody: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  chipCol: { flex: 1, gap: 4 },
  chipLabel: { color: Palette.muted, fontSize: 12, fontWeight: '700' },
  pos: { color: Palette.success, fontWeight: '600' },
  neg: { color: Palette.error, fontWeight: '600' },
  concepts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conceptChip: {
    backgroundColor: Palette.softAccent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  conceptText: { color: Palette.warning, fontSize: 12, fontWeight: '600' },
});
