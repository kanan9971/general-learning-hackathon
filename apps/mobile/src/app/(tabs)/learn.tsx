import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Disclaimer } from '@/components/Disclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import {
  conceptLabel,
  getMastery,
  getPlan,
  type LearnerPlan,
  type MasteryMap,
} from '@/lib/learner';
import { Palette } from '@/constants/theme';

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
    <Screen title="Learn" subtitle="Living custom plan + mastery from daily quizzes">
      <View style={styles.planCard}>
        <Text style={styles.kicker}>YOUR PLAN</Text>
        {plan ? (
          <>
            <Text style={styles.level}>{plan.level}</Text>
            <Text style={styles.muted}>
              Diagnostic {plan.percentCorrect}% · updated {new Date(plan.answeredAt).toLocaleDateString()}
            </Text>
            <View style={styles.chips}>
              {plan.focusConceptIds.map((id) => (
                <View key={id} style={styles.chip}>
                  <Text style={styles.chipText}>{conceptLabel(id)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.muted}>Complete onboarding to seed your plan.</Text>
        )}
      </View>

      <Text style={styles.section}>Mastery</Text>
      {conceptIds.length === 0 ? (
        <Text style={styles.muted}>Take today’s quiz to start updating mastery.</Text>
      ) : (
        conceptIds.map((id) => {
          const value = mastery[id] ?? (plan?.focusConceptIds.includes(id) ? 0.35 : 0);
          return (
            <View key={id} style={styles.masteryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.masteryName}>{conceptLabel(id)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(value * 100)}%` }]} />
                </View>
              </View>
              <Text style={styles.masteryPct}>{Math.round(value * 100)}%</Text>
            </View>
          );
        })
      )}

      <View style={styles.accentCard}>
        <Text style={styles.accentTitle}>Continue learning</Text>
        <Text style={styles.muted}>Open Today for the next case study and quiz.</Text>
        <PrimaryButton label="Go to Today" onPress={() => router.push('/(tabs)')} />
      </View>

      <PrimaryButton label="Retake diagnostic" variant="secondary" onPress={onRetake} />
      <Text style={styles.hint}>Retake only refreshes your starting plan tone — not daily quiz history.</Text>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  planCard: {
    backgroundColor: Palette.softInfo,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  kicker: { color: Palette.secondary, fontWeight: '700', fontSize: 11, letterSpacing: 0.6 },
  level: { color: Palette.primary, fontSize: 26, fontWeight: '800', textTransform: 'capitalize' },
  muted: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: Palette.surface,
    borderColor: Palette.primary,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: Palette.primary, fontWeight: '600', fontSize: 12 },
  section: { color: Palette.text, fontWeight: '700', fontSize: 15 },
  masteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 10,
    padding: 12,
  },
  masteryName: { color: Palette.text, fontWeight: '600', marginBottom: 6 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.border,
    overflow: 'hidden',
  },
  barFill: { height: 8, backgroundColor: Palette.secondary },
  masteryPct: { color: Palette.secondary, fontWeight: '700', width: 40, textAlign: 'right' },
  accentCard: {
    backgroundColor: Palette.softAccent,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 14,
    gap: 10,
  },
  accentTitle: { color: Palette.warning, fontWeight: '700', fontSize: 15 },
  hint: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
});
