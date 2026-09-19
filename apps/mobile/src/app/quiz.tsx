import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { OptionCard } from '@/components/OptionCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProgressDots } from '@/components/ProgressDots';
import { Screen } from '@/components/Screen';
import dailyQuiz from '@/fixtures/daily-quiz.json';
import { applyQuizMastery } from '@/lib/learner';
import { Palette } from '@/constants/theme';

type Option = { id: string; text: string; correct: boolean };
type Question = {
  id: string;
  concept_id: string;
  prompt: string;
  options: Option[];
};

export default function DailyQuizScreen() {
  const router = useRouter();
  const questions = dailyQuiz.questions as Question[];
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const q = questions[index];

  const finish = async (finalAnswers: Record<string, string>) => {
    const results = questions.map((question) => {
      const pick = finalAnswers[question.id];
      const opt = question.options.find((o) => o.id === pick);
      return {
        conceptId: question.concept_id,
        correct: !!opt?.correct,
        questionId: question.id,
        selected: pick ?? '',
      };
    });
    await applyQuizMastery(results.map((r) => ({ conceptId: r.conceptId, correct: r.correct })));
    const correct = results.filter((r) => r.correct).length;
    router.replace({
      pathname: '/feedback',
      params: {
        correct: String(correct),
        total: String(questions.length),
        results: JSON.stringify(results),
      },
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
      title={dailyQuiz.title}
      subtitle="Short MCQs grounded in today's case study."
      safeEdges={['bottom']}
      footer={
        <PrimaryButton label={isLast ? 'Submit answers' : 'Next question'} onPress={onNext} disabled={!selected} />
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
