import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel } from '@/lib/learner';
import { Palette } from '@/constants/theme';

type Result = {
  conceptId: string;
  correct: boolean;
  questionId: string;
  selected: string;
};

export default function FeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ correct?: string; total?: string; results?: string }>();
  const correct = Number(params.correct ?? 0);
  const total = Number(params.total ?? 1);
  const percent = Math.round((correct / Math.max(total, 1)) * 100);

  let results: Result[] = [];
  try {
    results = JSON.parse(params.results ?? '[]') as Result[];
  } catch {
    results = [];
  }

  const hits = results.filter((r) => r.correct);
  const misses = results.filter((r) => !r.correct);
  const teachConcept = misses[0]?.conceptId ?? hits[0]?.conceptId ?? 'real-yields';

  return (
    <Screen title="Feedback" subtitle="Mastery on Learn was updated from this quiz.">
      <View style={styles.scoreCard}>
        <Text style={styles.score}>{percent}%</Text>
        <Text style={styles.scoreSub}>
          {correct} of {total} correct
        </Text>
      </View>

      <LabelledSection kind="you">
        <ThemedText type="smallBold">Hits</ThemedText>
        {hits.length ? (
          hits.map((r) => (
            <ThemedText key={r.questionId} style={{ color: Palette.success }}>
              ✓ {conceptLabel(r.conceptId)}
            </ThemedText>
          ))
        ) : (
          <ThemedText themeColor="textSecondary">None this round</ThemedText>
        )}
      </LabelledSection>

      <LabelledSection kind="teaching">
        <ThemedText type="smallBold">Needs work</ThemedText>
        {misses.length ? (
          misses.map((r) => (
            <ThemedText key={r.questionId} style={{ color: Palette.error }}>
              ✕ {conceptLabel(r.conceptId)}
            </ThemedText>
          ))
        ) : (
          <ThemedText themeColor="textSecondary">Nice — no misses</ThemedText>
        )}
      </LabelledSection>

      <PrimaryButton
        label={`Teach me: ${conceptLabel(teachConcept)}`}
        onPress={() =>
          router.push({ pathname: '/lesson', params: { concept: teachConcept } })
        }
      />
      <PrimaryButton
        label="Back to Learn"
        variant="secondary"
        onPress={() => router.replace('/(tabs)/learn')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreCard: {
    alignItems: 'center',
    backgroundColor: Palette.softSuccess,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 20,
    gap: 4,
  },
  score: { color: Palette.success, fontSize: 48, fontWeight: '800' },
  scoreSub: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
});
