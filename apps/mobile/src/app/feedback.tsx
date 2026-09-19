import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel } from '@/lib/learner';
import { Fonts, Palette } from '@/constants/theme';

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
  const scoreTone = percent >= 75 ? 'success' : percent >= 40 ? 'accent' : 'error';
  const scoreColor =
    scoreTone === 'success' ? Palette.success : scoreTone === 'accent' ? Palette.warning : Palette.error;

  return (
    <Screen
      title="Feedback"
      subtitle="Mastery on Learn was updated from this quiz."
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton
            label={`Teach me: ${conceptLabel(teachConcept)}`}
            onPress={() => router.push({ pathname: '/lesson', params: { concept: teachConcept } })}
          />
          <PrimaryButton
            label="Back to Learn"
            variant="ghost"
            onPress={() => router.replace('/(tabs)/learn')}
          />
        </>
      }
    >
      <Card tone={scoreTone} style={styles.scoreCard}>
        <Text style={[styles.score, { color: scoreColor }]}>{percent}%</Text>
        <Text style={styles.scoreSub}>
          {correct} of {total} correct
        </Text>
      </Card>

      <SectionHeader title="By concept" meta={`${results.length} questions`} />
      <Card style={styles.list}>
        {results.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No answers recorded.
          </ThemedText>
        ) : (
          results.map((r, i) => (
            <View key={r.questionId} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View
                style={[
                  styles.mark,
                  { backgroundColor: r.correct ? Palette.success : Palette.error },
                ]}
              >
                <Text style={styles.markText}>{r.correct ? '✓' : '✕'}</Text>
              </View>
              <Text style={styles.rowLabel}>{conceptLabel(r.conceptId)}</Text>
              <Text style={[styles.rowStatus, { color: r.correct ? Palette.success : Palette.error }]}>
                {r.correct ? 'Correct' : 'Needs work'}
              </Text>
            </View>
          ))
        )}
      </Card>

      {misses.length === 0 && results.length > 0 ? (
        <Card tone="success">
          <ThemedText type="sectionTitle" style={{ color: Palette.success }}>
            Nice — no misses
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Review a concept below to keep it sharp.
          </ThemedText>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreCard: { alignItems: 'center', paddingVertical: 24, gap: 2 },
  score: { fontFamily: Fonts.display, fontSize: 56, lineHeight: 58, fontWeight: '700', letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  scoreSub: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
  list: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: Palette.border },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  markText: { color: Palette.white, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  rowLabel: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: '600' },
  rowStatus: { fontSize: 13, fontWeight: '700' },
});
