import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import {
  conceptLabel,
  getMastery,
  getPlan,
  type LearnerPlan,
  type MasteryMap,
} from '@/lib/learner';
import { Palette, Radius } from '@/constants/theme';

export default function LearnScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<LearnerPlan | null>(null);
  const [mastery, setMastery] = useState<MasteryMap>({});

  useFocusEffect(
    useCallback(() => {
      Promise.all([getPlan(), getMastery()]).then(([p, m]) => {
        setPlan(p);
        setMastery(m);
      });
    }, []),
  );

  const onRetake = () => {
    const go = () => router.push({ pathname: '/onboarding/quiz', params: { retake: '1' } });
    const message = 'This refreshes your starting plan. Daily quiz progress is kept.';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`Retake diagnostic?\n\n${message}`)) go();
      return;
    }
    Alert.alert('Retake diagnostic?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retake', onPress: go },
    ]);
  };

  const conceptIds = Array.from(
    new Set([...(plan?.focusConceptIds ?? []), ...Object.keys(mastery)]),
  );

  return (
    <Screen
      title="Learn"
      subtitle="Living custom plan + mastery from daily quizzes"
      footer={
        <>
          <PrimaryButton label="Go to Today" onPress={() => router.push('/(tabs)')} />
          <Disclaimer />
        </>
      }
    >
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Your plan
        </ThemedText>
        {plan ? (
          <>
            <View style={styles.planHead}>
              <Text style={styles.level}>{plan.level}</Text>
              <Chip label={`${plan.percentCorrect}% on diagnostic`} tone="neutral" size="sm" />
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              Updated {new Date(plan.answeredAt).toLocaleDateString()}
            </ThemedText>
            <ChipRow>
              {plan.focusConceptIds.map((id) => (
                <Chip key={id} label={conceptLabel(id)} tone="info" outlined />
              ))}
            </ChipRow>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Complete onboarding to seed your plan.
          </ThemedText>
        )}
      </Card>

      <SectionHeader title="Mastery" meta={conceptIds.length ? `${conceptIds.length} concepts` : undefined} />
      {conceptIds.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Take today’s quiz to start updating mastery.
          </ThemedText>
        </Card>
      ) : (
        <Card style={styles.table}>
          {conceptIds.map((id, i) => {
            const value = mastery[id] ?? (plan?.focusConceptIds.includes(id) ? 0.35 : 0);
            const pct = Math.round(value * 100);
            const isFocus = plan?.focusConceptIds.includes(id);
            return (
              <View key={id} style={[styles.masteryRow, i > 0 && styles.rowDivider]}>
                <View style={styles.masteryHead}>
                  <Text style={styles.masteryName}>{conceptLabel(id)}</Text>
                  {isFocus ? <Text style={styles.focusTag}>FOCUS</Text> : null}
                  <Text style={styles.masteryPct}>{pct}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <SectionHeader title="Continue learning" />
      <Card tone="accent">
        <ThemedText type="sectionTitle" style={{ color: Palette.warning }}>
          Next up: today’s case study
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Open Today for the case study and the quiz that updates the bars above.
        </ThemedText>
      </Card>

      <SectionHeader title="Plan settings" />
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Retaking the diagnostic only refreshes your starting plan tone — daily quiz history is kept.
        </ThemedText>
        <PrimaryButton label="Retake diagnostic" variant="secondary" onPress={onRetake} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  level: { color: Palette.primary, fontSize: 28, lineHeight: 34, fontWeight: '800', textTransform: 'capitalize' },
  table: { paddingVertical: 4, gap: 0 },
  masteryRow: { paddingVertical: 12, gap: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: Palette.border },
  masteryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  masteryName: { flex: 1, color: Palette.text, fontWeight: '600', fontSize: 15 },
  focusTag: { color: Palette.secondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  masteryPct: {
    color: Palette.secondary,
    fontWeight: '700',
    fontSize: 15,
    minWidth: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 8,
    borderRadius: Radius.sm,
    backgroundColor: Palette.border,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: Radius.sm, backgroundColor: Palette.secondary },
});
