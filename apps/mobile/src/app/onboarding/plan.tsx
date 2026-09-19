import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel, getPlan, type LearnerPlan } from '@/lib/learner';
import { Palette } from '@/constants/theme';

export default function OnboardingPlan() {
  const router = useRouter();
  const [plan, setPlan] = useState<LearnerPlan | null>(null);

  useEffect(() => {
    getPlan().then(setPlan);
  }, []);

  const continueNext = () => {
    router.replace('/(tabs)/learn');
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
      title="Your starting point"
      subtitle="Your roadmap is now built around this. Every answer keeps updating it."
      safeEdges={['top', 'bottom']}
      footer={
        <PrimaryButton
          label="See my roadmap"
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
          {plan.percentCorrect}% across the placement quiz
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Where to focus first
        </ThemedText>
        <ChipRow>
          {plan.focusConceptIds.map((id) => (
            <Chip key={id} label={conceptLabel(id)} tone="info" outlined />
          ))}
        </ChipRow>
        <ThemedText type="small" themeColor="textSecondary">
          Your roadmap pulls these topics forward. Practising them moves the bars.
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
