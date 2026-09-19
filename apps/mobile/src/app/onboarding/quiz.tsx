import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OptionCard } from '@/components/OptionCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProgressDots } from '@/components/ProgressDots';
import { Screen } from '@/components/Screen';
import quiz from '@/fixtures/onboarding-quiz.json';
import { inferLevel, savePlan, type Level } from '@/lib/learner';
import { Palette } from '@/constants/theme';

type Option = { id: string; text: string; correct: boolean };
type Question = {
  id: string;
  concept_id: string;
  prompt: string;
  options: Option[];
};

export default function OnboardingQuiz() {
  const router = useRouter();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const questions = quiz.questions as Question[];
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const q = questions[index];

  const finish = async (finalAnswers: Record<string, string>) => {
    const byConcept: Record<string, { correct: number; total: number }> = {};
    let correctCount = 0;
    for (const question of questions) {
      const pick = finalAnswers[question.id];
      const opt = question.options.find((o) => o.id === pick);
      const ok = !!opt?.correct;
      if (ok) correctCount += 1;
      const slot = byConcept[question.concept_id] ?? { correct: 0, total: 0 };
      slot.total += 1;
      if (ok) slot.correct += 1;
      byConcept[question.concept_id] = slot;
    }
    const percentCorrect = Math.round((correctCount / questions.length) * 100);
    const level: Level = inferLevel(percentCorrect);
    const ranked = Object.entries(byConcept)
      .map(([id, s]) => ({ id, score: s.correct / s.total }))
      .sort((a, b) => a.score - b.score);
    const focusConceptIds = ranked.slice(0, 3).map((r) => r.id);

    await savePlan({
      level,
      focusConceptIds,
      percentCorrect,
      answeredAt: new Date().toISOString(),
    });

    router.replace({
      pathname: '/onboarding/plan',
      params: { retake: retake === '1' ? '1' : '0' },
    });
  };

  const onNext = () => {
    if (!selected) return;
    const nextAnswers = { ...answers, [q.id]: selected };
    setAnswers(nextAnswers);
    if (index >= questions.length - 1) {
      void finish(nextAnswers);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  };

  const isLast = index >= questions.length - 1;

  return (
    <Screen
      title="Diagnostic"
      subtitle={quiz.description}
      safeEdges={['top', 'bottom']}
      footer={
        <PrimaryButton label={isLast ? 'See my plan' : 'Next question'} onPress={onNext} disabled={!selected} />
      }
    >
      <ProgressDots total={questions.length} current={index} />
      <Text style={styles.prompt}>{q.prompt}</Text>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {selected ? 'Answer selected — tap Next to continue.' : 'Pick one answer.'}
      </Text>
      <View style={styles.options}>
        {q.options.map((o, i) => (
          <OptionCard
            key={o.id}
            index={i}
            label={o.text}
            selected={selected === o.id}
            onPress={() => setSelected(o.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { color: Palette.text, fontSize: 20, fontWeight: '700', lineHeight: 28 },
  hint: { color: Palette.muted, fontSize: 13, marginTop: -8 },
  options: { gap: 10 },
});
