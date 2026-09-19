import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  endQuizSession,
  refillQuizSession,
  startQuizSession,
  submitQuizAnswer,
  type AnswerFeedback,
  type QuizFormat,
  type QuizQuestion,
  type QuizSession,
} from '@/api/client';
import { Card } from '@/components/Card';
import { LabelledSection } from '@/components/LabelledSection';
import { OptionCard } from '@/components/OptionCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel } from '@/lib/learner';
import { Palette, Radius } from '@/constants/theme';

type Phase = 'loading' | 'answering' | 'feedback' | 'empty';

export default function InfiniteQuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    formats?: string;
    concepts?: string;
    customs?: string;
    level?: string;
  }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nextRef = useRef<QuizQuestion | null>(null);
  const refillInFlight = useRef(false);

  const formats = (params.formats?.split(',').filter(Boolean) ?? ['mcq']) as QuizFormat[];
  const concepts = params.concepts?.split(',').filter(Boolean) ?? [];
  const customs = params.customs?.split('|').filter(Boolean) ?? [];
  const level = (params.level as 'beginner' | 'intermediate' | 'advanced') || 'beginner';

  const ensureRefill = useCallback(async (sessionId: string, depth: number) => {
    if (depth >= 2 || refillInFlight.current) return;
    refillInFlight.current = true;
    try {
      const r = await refillQuizSession(sessionId);
      setSession(r.session);
    } catch {
      /* keep going from remaining queue */
    } finally {
      refillInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase('loading');
      setError(null);
      try {
        const res = await startQuizSession({
          formats,
          concept_ids: concepts,
          custom_topics: customs,
          level,
        });
        if (cancelled) return;
        setSession(res.session);
        setQuestion(res.question);
        setPhase('answering');
        void ensureRefill(res.session.id, res.queue_depth);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not start quiz');
          setPhase('empty');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async () => {
    if (!session || !question || submitting) return;
    const isMcq = question.format === 'mcq';
    if (isMcq && !selectedOption) return;
    if (!isMcq && !textAnswer.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitQuizAnswer(session.id, {
        question_id: question.id,
        answer: isMcq ? { option_id: selectedOption } : { text: textAnswer.trim() },
      });
      setFeedback(res.feedback);
      setSession(res.session);
      nextRef.current = res.next_question;
      setPhase('feedback');
      void ensureRefill(session.id, res.queue_depth);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const onContinue = async () => {
    setFeedback(null);
    setSelectedOption(null);
    setTextAnswer('');
    const next = nextRef.current;
    nextRef.current = null;
    if (next) {
      setQuestion(next);
      setPhase('answering');
      if (session) void ensureRefill(session.id, Math.max(0, (session.ready_count || 1) - 1));
      return;
    }
    if (!session) {
      setPhase('empty');
      return;
    }
    setPhase('loading');
    try {
      const r = await refillQuizSession(session.id);
      setSession(r.session);
      if (r.question) {
        setQuestion(r.question);
        setPhase('answering');
      } else {
        setError('Caught up — tap Retry to generate more questions.');
        setPhase('empty');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Queue empty');
      setPhase('empty');
    }
  };

  const confirmEnd = () => {
    const go = async () => {
      if (session) {
        try {
          await endQuizSession(session.id);
        } catch {
          /* ignore */
        }
      }
      router.replace('/(tabs)/learn');
    };
    const message = 'Your progress is saved. End this quiz session?';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(message)) void go();
      return;
    }
    Alert.alert('End quiz?', message, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: () => void go() },
    ]);
  };

  const retryStart = () => {
    router.replace({
      pathname: '/quiz',
      params: {
        formats: formats.join(','),
        concepts: concepts.join(','),
        customs: customs.join('|'),
        level,
      },
    });
  };

  if (phase === 'loading') {
    return (
      <Screen title="Quiz" safeEdges={['bottom']}>
        <ActivityIndicator color={Palette.primary} />
        <ThemedText type="small" themeColor="textSecondary">
          Preparing your next questions…
        </ThemedText>
      </Screen>
    );
  }

  if (phase === 'empty') {
    return (
      <Screen
        title="Quiz"
        safeEdges={['bottom']}
        footer={
          <>
            <PrimaryButton label="Retry" onPress={retryStart} />
            <PrimaryButton label="Back to launcher" variant="ghost" onPress={() => router.replace('/(tabs)')} />
          </>
        }
      >
        <Card tone="accent">
          <ThemedText type="sectionTitle" style={{ color: Palette.warning }}>
            {error ?? 'No questions ready'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Check your connection and try again. Your earlier answers were saved.
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  if (!question || !session) {
    return (
      <Screen title="Quiz" safeEdges={['bottom']}>
        <ThemedText>Missing session.</ThemedText>
      </Screen>
    );
  }

  const topic =
    question.custom_topic ||
    (question.concept_ids[0] ? conceptLabel(question.concept_ids[0]) : 'Practice');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        title={`Q${session.answered_count + (phase === 'feedback' ? 0 : 1)}`}
        subtitle={`${topic} · ${question.format.replace('_', ' ')} · difficulty ${question.difficulty}`}
        safeEdges={['bottom']}
        footer={
          phase === 'feedback' ? (
            <>
              <PrimaryButton label="Continue" onPress={() => void onContinue()} />
              <PrimaryButton label="End quiz" variant="ghost" onPress={confirmEnd} />
            </>
          ) : (
            <>
              <PrimaryButton
                label={submitting ? 'Checking…' : 'Submit answer'}
                onPress={() => void onSubmit()}
                disabled={
                  submitting ||
                  (question.format === 'mcq' ? !selectedOption : !textAnswer.trim())
                }
              />
              <PrimaryButton label="End quiz" variant="ghost" onPress={confirmEnd} />
            </>
          )
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            Session · {session.correct_count}/{session.answered_count || 0} strong
          </Text>
        </View>

        {question.context ? (
          <LabelledSection kind="fact" title="Scenario">
            <ThemedText>{question.context}</ThemedText>
          </LabelledSection>
        ) : null}

        <Text style={styles.prompt}>{question.prompt}</Text>

        {question.hints?.length ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Hint: {question.hints[0]}
          </ThemedText>
        ) : null}

        {phase === 'answering' && question.format === 'mcq' && question.options ? (
          <View style={styles.options}>
            {question.options.map((o, i) => (
              <OptionCard
                key={o.id}
                index={i}
                label={o.text}
                selected={selectedOption === o.id}
                onPress={() => setSelectedOption(o.id)}
              />
            ))}
          </View>
        ) : null}

        {phase === 'feedback' && question.format === 'mcq' && question.options ? (
          <View style={styles.options}>
            {question.options.map((o, i) => {
              let state: 'idle' | 'correct' | 'incorrect' | 'missed' = 'idle';
              if (feedback?.correct_option_id === o.id) state = 'correct';
              else if (selectedOption === o.id && feedback?.observed !== 'correct') state = 'incorrect';
              return (
                <OptionCard
                  key={o.id}
                  index={i}
                  label={o.text}
                  selected={selectedOption === o.id}
                  state={state}
                  onPress={() => undefined}
                />
              );
            })}
          </View>
        ) : null}

        {phase === 'answering' && question.format !== 'mcq' ? (
          <TextInput
            value={textAnswer}
            onChangeText={setTextAnswer}
            placeholder="Type your answer…"
            placeholderTextColor={Palette.muted}
            style={styles.textArea}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Your answer"
          />
        ) : null}

        {phase === 'feedback' && feedback ? (
          <Card
            tone={
              feedback.observed === 'correct'
                ? 'success'
                : feedback.observed === 'partial'
                  ? 'accent'
                  : 'error'
            }
          >
            <ThemedText type="sectionTitle">
              {feedback.observed === 'correct'
                ? 'Solid'
                : feedback.observed === 'partial'
                  ? 'Partially there'
                  : 'Needs work'}{' '}
              · {feedback.score}
            </ThemedText>
            <ThemedText>{feedback.explanation}</ThemedText>
            {feedback.gaps?.length ? (
              <ThemedText type="small" themeColor="textSecondary">
                Gaps: {feedback.gaps.join(' · ')}
              </ThemedText>
            ) : null}
            {feedback.review_concept_ids?.[0] ? (
              <PrimaryButton
                label={`Teach me: ${conceptLabel(feedback.review_concept_ids[0])}`}
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/lesson',
                    params: { concept: feedback.review_concept_ids![0] },
                  })
                }
                style={{ marginTop: 8 }}
              />
            ) : null}
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  prompt: { color: Palette.text, fontSize: 20, fontWeight: '700', lineHeight: 28 },
  options: { gap: 10 },
  textArea: {
    minHeight: 140,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 16,
    color: Palette.text,
    lineHeight: 22,
  },
  error: { color: Palette.error, fontWeight: '600', fontSize: 13 },
});
