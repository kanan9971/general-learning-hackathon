import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
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
      <Screen title="Your plan" safeEdges={['top', 'bottom']}>
        <ThemedText type="small" themeColor="textSecondary">
          Building your plan…
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen
      title="Your custom plan"
      subtitle="Seeded from your diagnostic. Daily quizzes will keep updating mastery."
      safeEdges={['top', 'bottom']}
      footer={
        <PrimaryButton
          label={retake === '1' ? 'Back to Learn' : 'Continue to Today'}
          onPress={continueNext}
        />
      }
    >
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Inferred level
        </ThemedText>
        <Text style={styles.level}>{plan.level}</Text>
        <ThemedText type="small" themeColor="textSecondary">
          {plan.percentCorrect}% correct on the diagnostic
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Focus concepts
        </ThemedText>
        <ChipRow>
          {plan.focusConceptIds.map((id) => (
            <Chip key={id} label={conceptLabel(id)} tone="info" outlined />
          ))}
        </ChipRow>
        <ThemedText type="small" themeColor="textSecondary">
          These show up first on Learn. Today’s case studies and quizzes will refine them.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  level: {
    color: Palette.primary,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
});
