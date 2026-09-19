import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { conceptLabel, getPlan, type LearnerPlan } from '@/lib/learner';
import { Palette } from '@/constants/theme';

export default function OnboardingPlan() {
  const router = useRouter();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const [plan, setPlan] = useState<LearnerPlan | null>(null);

  useEffect(() => {
    getPlan().then(setPlan);
  }, []);

  const continueNext = () => {
    if (retake === '1') {
      router.replace('/(tabs)/learn');
    } else {
      router.replace('/(tabs)');
    }
  };

  if (!plan) {
    return (
      <Screen title="Your plan">
        <Text style={styles.muted}>Building your plan…</Text>
      </Screen>
    );
  }

  return (
    <Screen title="Your custom plan" subtitle="Seeded from your diagnostic. Daily quizzes will keep updating mastery.">
      <View style={styles.card}>
        <Text style={styles.label}>Inferred level</Text>
        <Text style={styles.level}>{plan.level}</Text>
        <Text style={styles.muted}>{plan.percentCorrect}% correct on the diagnostic</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Focus concepts</Text>
        <View style={styles.chips}>
          {plan.focusConceptIds.map((id) => (
            <View key={id} style={styles.chip}>
              <Text style={styles.chipText}>{conceptLabel(id)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.muted}>
          These show up first on Learn. Today’s case studies and quizzes will refine them.
        </Text>
      </View>

      <PrimaryButton
        label={retake === '1' ? 'Back to Learn' : 'Continue to Today'}
        onPress={continueNext}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.surface,
    borderColor: Palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  label: { color: Palette.secondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  level: { color: Palette.primary, fontSize: 28, fontWeight: '800', textTransform: 'capitalize' },
  muted: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: Palette.softInfo,
    borderColor: Palette.primary,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: Palette.primary, fontWeight: '600', fontSize: 13 },
});
