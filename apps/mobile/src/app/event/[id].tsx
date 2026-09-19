import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getFixture } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel } from '@/lib/learner';
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
      <Screen title="Case study" safeEdges={['bottom']}>
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  const relatedFacts = facts.filter((f) => event.fact_ids?.includes(f.fact_id));
  const chain = event.mechanism_chain;

  return (
    <Screen
      title={event.title}
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton label="Go to Quiz" onPress={() => router.push('/(tabs)/practice')} />
          <Disclaimer />
        </>
      }
    >
      <LabelledSection kind="fact">
        {relatedFacts.length ? (
          <View style={styles.factRow}>
            {relatedFacts.map((f) => (
              <View key={f.fact_id} style={styles.fact}>
                <Text style={styles.factLabel}>{f.label ?? f.fact_id}</Text>
                <Text
                  style={[
                    styles.factValue,
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
          </View>
        ) : (
          <ThemedText>Numbers come from the daily snapshot (fixture).</ThemedText>
        )}
      </LabelledSection>

      <LabelledSection kind="interpretation" title="Catalyst">
        <ThemedText>{event.catalyst}</ThemedText>
        <View style={styles.confidenceRow}>
          <Chip label={`${event.confidence} confidence`} tone="accent" size="sm" />
          <ThemedText type="caption" themeColor="textSecondary" style={{ flex: 1 }}>
            {event.confidence_reason}
          </ThemedText>
        </View>
      </LabelledSection>

      <SectionHeader title="Causal chain" meta={`${chain.length} steps`} />
      <Card style={styles.chain}>
        {chain.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepRail}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{i + 1}</Text>
              </View>
              {i < chain.length - 1 ? <View style={styles.stepLine} /> : null}
            </View>
            <View style={[styles.stepBodyWrap, i < chain.length - 1 && styles.stepSpacing]}>
              <Text style={styles.stepFrom}>{step.from_ ?? step.from}</Text>
              <Text style={styles.stepTo}>→ {step.to}</Text>
              <Text style={styles.stepBody}>{step.explanation}</Text>
            </View>
          </View>
        ))}
      </Card>

      <LabelledSection kind="interpretation" title="Alternative explanations">
        {event.alternatives.map((a, i) => (
          <View key={i} style={{ gap: 2 }}>
            <ThemedText>{a.explanation}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Confirm with: {a.evidence_that_would_confirm}
            </ThemedText>
          </View>
        ))}
      </LabelledSection>

      <SectionHeader title="Who it affects" />
      <View style={styles.affectedRow}>
        <Card tone="success" style={styles.affectedCol}>
          <ThemedText type="kicker" style={{ color: Palette.success }}>
            Helped
          </ThemedText>
          {event.positively_affected.map((x) => (
            <Text key={x} style={styles.pos}>
              {x}
            </Text>
          ))}
        </Card>
        <Card tone="error" style={styles.affectedCol}>
          <ThemedText type="kicker" style={{ color: Palette.error }}>
            Pressured
          </ThemedText>
          {event.negatively_affected.map((x) => (
            <Text key={x} style={styles.neg}>
              {x}
            </Text>
          ))}
        </Card>
      </View>

      <SectionHeader title="Concepts in play" />
      <ChipRow>
        {event.concept_ids.map((c) => (
          <Chip key={c} label={conceptLabel(c)} tone="accent" />
        ))}
      </ChipRow>
    </Screen>
  );
}

const styles = StyleSheet.create({
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  fact: { gap: 2, minWidth: 96 },
  factLabel: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  factValue: { color: Palette.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  chain: { gap: 0 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 28 },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: { color: Palette.white, fontWeight: '700', fontSize: 13 },
  stepLine: { flex: 1, width: 2, backgroundColor: Palette.border, marginVertical: 4 },
  stepBodyWrap: { flex: 1, gap: 2 },
  stepSpacing: { paddingBottom: 16 },
  stepFrom: { color: Palette.muted, fontSize: 13, fontWeight: '600' },
  stepTo: { color: Palette.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  stepBody: { color: Palette.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  affectedRow: { flexDirection: 'row', gap: 12 },
  affectedCol: { flex: 1, gap: 4 },
  pos: { color: Palette.success, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  neg: { color: Palette.error, fontWeight: '600', fontSize: 14, lineHeight: 20 },
});
