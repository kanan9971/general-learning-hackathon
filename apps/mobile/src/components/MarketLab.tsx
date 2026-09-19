import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  type Move,
  answerMarketLab,
  getMarketLab,
  completeDailyTask,
  getPlacementNext,
  restartDailyCycle,
  type LabKind,
  type Level,
  type LabFeedback,
  type LabQuestion,
  type LabSet,
  type MarketSectionId,
  type Observed,
  type PlacementStep,
} from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { FlowDiagram, ImpactDiagram, LinkDiagram, Node, StepsDiagram, type NodeTone } from '@/components/Diagrams';
import { LabelledSection } from '@/components/LabelledSection';
import { MoveRow } from '@/components/MoveRow';
import { OptionCard } from '@/components/OptionCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { localToday } from '@/lib/daily';
import { asOfLabel, signed } from '@/lib/format';
import { getInterests } from '@/lib/interests';
import { conceptLabel, getPlan, savePlan } from '@/lib/learner';

const KIND_LABEL: Record<LabQuestion['kind'], string> = {
  scenario: 'What if?',
  predict: 'Predict',
  driver: 'Pick the driver',
  chain: 'Order the chain',
  explain: 'Explain',
};

type Answer = string | string[] | Record<string, string>;

/**
 * The question runner. `mode="lab"` is a practice set; `mode="placement"` is the adaptive placement quiz that
 * builds the personalised roadmap (one question per topic, difficulty adapts, answers seed mastery).
 */
export function MarketLab({
  mode = 'lab',
  section,
  kinds,
  onboarding,
  daily,
  focus,
}: {
  mode?: 'lab' | 'placement';
  section?: MarketSectionId;
  kinds?: string;
  onboarding?: boolean;
  /** Today's practice block: 5 questions weighted to `focus`; finishing the set ticks the block off. */
  daily?: boolean;
  focus?: MarketSectionId;
}) {
  const router = useRouter();
  const placement = mode === 'placement';
  const edges: ('top' | 'bottom')[] = onboarding ? ['top', 'bottom'] : ['bottom']; // no app header before onboarding ends
  const kindList = kinds ? (kinds.split(',').filter(Boolean) as LabKind[]) : undefined;
  const [level, setLevel] = useState<Level>('beginner');
  const [watch, setWatch] = useState<string[]>([]);
  const [set, setSet] = useState<LabSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<{ q: LabQuestion; fb: LabFeedback }[]>([]);

  // Per-question state
  const [pick, setPick] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<LabFeedback | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [history, setHistory] = useState<{ question_id: string; observed: Observed }[]>([]);
  const [placementTotal, setPlacementTotal] = useState(9);
  const [placementResult, setPlacementResult] = useState<PlacementStep | null>(null);

  const load = useCallback(async () => {
    setSet(null);
    setError(null);
    setI(0);
    setResults([]);
    setFeedback(null);
    setHistory([]);
    setPlacementResult(null);
    try {
      if (placement) {
        const step = await getPlacementNext([]);
        setPlacementTotal(step.total);
        setSet({ as_of: null, data_mode: 'demo', questions: step.question ? [step.question] : [] });
        return;
      }
      const [interests, plan] = await Promise.all([getInterests(), getPlan()]);
      const lvl = plan?.level ?? 'beginner';
      setLevel(lvl);
      setWatch(interests.watch);
      setSet(
        await getMarketLab({
          level: lvl,
          section,
          kinds: kindList,
          interests: daily && focus ? [focus] : interests.sections,
          watch: interests.watch,
          count: daily || kindList?.length === 1 ? 5 : 6,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build questions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, kinds, placement, daily, focus]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = set?.questions[i];
  const answer: Answer | null = !q
    ? null
    : q.kind === 'scenario'
      ? q.parts.every((p) => picks[p.id])
        ? picks
        : null
      : q.kind === 'chain'
      ? order.length === q.items.length
        ? order
        : null
      : q.kind === 'explain'
        ? text.trim().length >= 8
          ? text.trim()
          : null
        : pick;

  const reset = () => {
    setPick(null);
    setOrder([]);
    setPicks({});
    setText('');
    setFeedback(null);
    setShowModel(false);
  };

  const submit = async () => {
    if (!q || answer == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const fb = await answerMarketLab({ question_id: q.id, answer, level, section, watch, placement });
      setFeedback(fb);
      setResults((r) => [...r, { q, fb }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check your answer');
    } finally {
      setSubmitting(false);
    }
  };

  const next = async () => {
    if (!placement || !q || !feedback) {
      reset();
      setI((n) => n + 1);
      return;
    }
    // Placement: ask the server for the next question; difficulty adapts to how you are doing.
    const newHistory = [...history, { question_id: q.id, observed: feedback.observed }];
    setSubmitting(true);
    try {
      const step = await getPlacementNext(newHistory);
      setHistory(newHistory);
      if (step.done) {
        setPlacementResult(step);
      } else if (step.question) {
        setSet((cur) => (cur ? { ...cur, questions: [...cur.questions, step.question!] } : cur));
        reset();
        setI((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the next question');
    } finally {
      setSubmitting(false);
    }
  };

  const skipPlacement = async () => {
    await savePlan({ level: 'beginner', focusConceptIds: [], percentCorrect: 0, answeredAt: new Date().toISOString() });
    router.replace(onboarding ? '/(tabs)' : '/(tabs)/learn');
  };

  const finishPlacement = async () => {
    if (!placementResult) return;
    await savePlan({
      level: placementResult.level ?? 'beginner',
      focusConceptIds: placementResult.focus_concept_ids,
      percentCorrect: placementResult.percent ?? 0,
      answeredAt: new Date().toISOString(),
    });
    if (!onboarding) await restartDailyCycle(placementResult.level ?? undefined, localToday()).catch(() => null);
    router.replace(onboarding ? '/onboarding/plan' : '/(tabs)/learn');
  };

  if (!set) {
    return (
      <Screen safeEdges={edges}>
        {error ? (
          <Card tone="error">
            <ThemedText type="smallBold">Couldn&apos;t start the lab</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
            <PrimaryButton label="Try again" variant="secondary" onPress={() => void load()} />
            {placement ? <PrimaryButton label="Skip for now" variant="ghost" onPress={() => void skipPlacement()} /> : null}
          </Card>
        ) : (
          <ActivityIndicator color={Palette.primary} />
        )}
      </Screen>
    );
  }

  if (placementResult) return <PlacementSummary step={placementResult} edges={edges} onDone={() => void finishPlacement()} />;

  if (!q)
    return (
      <Summary
        results={results}
        onAgain={() => void load()}
        onDone={() => router.back()}
        router={router}
        onShown={
          daily
            ? () =>
                void completeDailyTask('practice', {
                  level,
                  today: localToday(),
                  answered: results.length,
                  correct: results.filter((r) => r.fb.observed === 'correct').length,
                }).catch(() => null)
            : undefined
        }
        dailyDone={daily}
      />
    );

  const total = placement ? placementTotal : set.questions.length;
  return (
    <Screen
      title={placement ? `Placement · ${i + 1} of ${total}` : `Question ${i + 1} of ${total}`}
      subtitle={placement ? 'It adapts to you, and shapes your roadmap' : "Today's market, tested"}
      safeEdges={edges}
      footer={
        <>
          {feedback ? (
            <PrimaryButton
              label={submitting ? 'Loading…' : i + 1 < total ? 'Next question' : placement ? 'See my level' : 'See my results'}
              onPress={() => void next()}
              disabled={submitting}
            />
          ) : (
            <PrimaryButton
              label={
                submitting ? 'Checking…' : q.kind === 'predict' || q.kind === 'scenario' ? 'Lock in my prediction' : 'Check my answer'
              }
              onPress={() => void submit()}
              disabled={answer == null || submitting}
            />
          )}
          <Disclaimer />
        </>
      }
    >
      <View style={styles.topRow}>
        {placement ? <View /> : <DataModeBadge mode={set.data_mode} asOf={asOfLabel(set.as_of)} />}
        <View style={styles.dots}>
          {Array.from({ length: total }).map((_, n) => (
            <View
              key={n}
              style={[styles.dot, n < i && styles.dotDone, n === i && styles.dotNow]}
            />
          ))}
        </View>
      </View>

      <View style={styles.tagRow}>
        <Chip label={KIND_LABEL[q.kind]} tone="info" size="sm" />
        {q.surprise ? <Chip label="today broke the pattern" tone="accent" size="sm" /> : null}
      </View>

      {q.kind === 'predict' && q.facts[0] && !feedback ? (
        <LinkDiagram
          from={{ label: q.facts[0].label, badge: signed(q.facts[0].change, q.facts[0].change_unit), tone: q.facts[0].change >= 0 ? 'up' : 'down' }}
          to={{ label: 'Your call', badge: '?', tone: 'unknown' }}
          caption="Today's move on the left. What follows on the right?"
        />
      ) : q.kind === 'scenario' && !feedback ? (
        <>
          <Node node={{ label: q.title ?? 'What if…', sub: 'the change', tone: 'shock' }} />
          {q.facts.length ? (
            <LabelledSection kind="fact" title="Today's real move, for reference">
              {q.facts.map((m, n) => (
                <MoveRow key={m.fact_id} move={m} divider={n > 0} />
              ))}
            </LabelledSection>
          ) : null}
        </>
      ) : q.facts.length && !feedback ? (
        <LabelledSection kind="fact" title="What we know so far">
          {q.facts.map((m, n) => (
            <MoveRow key={m.fact_id} move={m} divider={n > 0} />
          ))}
        </LabelledSection>
      ) : null}

      <ThemedText type="subtitle">{q.prompt}</ThemedText>
      {q.context && !feedback ? (
        <ThemedText type="small" themeColor="textSecondary">
          {q.context}
        </ThemedText>
      ) : null}

      {q.kind === 'predict' ? (
        <View style={styles.predictRow}>
          {q.options.map((o) => (
            <PredictButton
              key={o.id}
              up={o.id === 'up'}
              label={o.text}
              selected={pick === o.id}
              disabled={!!feedback}
              onPress={() => setPick(o.id)}
            />
          ))}
        </View>
      ) : null}

      {q.kind === 'scenario' ? (
        <View style={{ gap: 10 }}>
          {q.parts.map((p) => (
            <View key={p.id} style={styles.partRow}>
              <Text style={styles.partLabel}>{p.label}</Text>
              <View style={styles.seg}>
                {q.options.map((o) => {
                  const on = picks[p.id] === o.id;
                  const c = o.id === 'up' ? Palette.success : o.id === 'down' ? Palette.error : Palette.muted;
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: !!feedback }}
                      onPress={() => !feedback && setPicks((m) => ({ ...m, [p.id]: o.id }))}
                      style={[styles.segBtn, on && { backgroundColor: c, borderColor: c }]}
                    >
                      <Text style={[styles.segText, on && { color: Palette.white }]}>
                        {o.id === 'up' ? '↑ ' : o.id === 'down' ? '↓ ' : '→ '}
                        {o.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {q.kind === 'driver'
        ? q.options.map((o, n) => (
            <OptionCard
              key={o.id}
              index={n}
              label={o.text}
              selected={pick === o.id}
              onPress={() => !feedback && setPick(o.id)}
            />
          ))
        : null}

      {q.kind === 'chain' ? (
        <ChainPicker q={q} order={order} setOrder={setOrder} locked={!!feedback} />
      ) : null}

      {q.kind === 'explain' ? (
        <View style={{ gap: 6 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            editable={!feedback}
            multiline
            placeholder="Explain the mechanism in your own words: what causes what, and why?"
            placeholderTextColor={Palette.muted}
            style={styles.input}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            {text.trim().split(/\s+/).filter(Boolean).length} words
            {q.word_range ? ` · aim for ${q.word_range[0]}-${q.word_range[1]}` : ''}
          </ThemedText>
        </View>
      ) : null}

      {q.hint && !feedback && q.kind !== 'explain' ? (
        <ThemedText type="caption" themeColor="textSecondary">
          Hint: {q.hint}
        </ThemedText>
      ) : null}

      {error ? (
        <ThemedText type="small" style={{ color: Palette.error }}>
          {error}
        </ThemedText>
      ) : null}

      {feedback ? (
        <FeedbackPanel q={q} fb={feedback} showModel={showModel} onToggleModel={() => setShowModel((v) => !v)} />
      ) : null}
    </Screen>
  );
}

function moveNode(m: Move) {
  return { label: m.label, badge: signed(m.change, m.change_unit), tone: (m.change > 0 ? 'up' : m.change < 0 ? 'down' : 'neutral') as NodeTone };
}

/** Chain items are "A → B" strings; turn them into a node chain A, B, C... */
function chainNodes(steps: string[]) {
  const parts = steps.map((t) => t.split(' \u2192 '));
  const nodes = [{ label: parts[0][0], tone: 'shock' as NodeTone }];
  parts.forEach((p, i) => nodes.push({ label: p[1] ?? p[0], tone: (i === parts.length - 1 ? 'goal' : 'neutral') as NodeTone }));
  return nodes;
}

function PredictButton({
  up,
  label,
  selected,
  disabled,
  onPress,
}: {
  up: boolean;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const color = up ? Palette.success : Palette.error;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={disabled ? undefined : onPress}
      style={[
        styles.predictBtn,
        { borderColor: selected ? color : Palette.border, backgroundColor: selected ? (up ? Palette.softSuccess : Palette.softError) : Palette.surface },
      ]}
    >
      <Text style={[styles.arrow, { color }]}>{up ? '↑' : '↓'}</Text>
      <Text style={[styles.predictLabel, { color: selected ? color : Palette.text }]}>{label}</Text>
    </Pressable>
  );
}

function ChainPicker({
  q,
  order,
  setOrder,
  locked,
}: {
  q: LabQuestion;
  order: string[];
  setOrder: (o: string[]) => void;
  locked: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {q.items.map((it) => {
        const pos = order.indexOf(it.id);
        return (
          <Pressable
            key={it.id}
            accessibilityRole="button"
            onPress={() => {
              if (locked) return;
              setOrder(pos >= 0 ? order.filter((x) => x !== it.id) : [...order, it.id]);
            }}
            style={[styles.chainItem, pos >= 0 && styles.chainItemOn]}
          >
            <View style={[styles.chainBadge, pos >= 0 && { backgroundColor: Palette.primary }]}>
              <Text style={[styles.chainBadgeText, pos >= 0 && { color: Palette.white }]}>{pos >= 0 ? pos + 1 : ''}</Text>
            </View>
            <Text style={styles.chainText}>{it.text}</Text>
          </Pressable>
        );
      })}
      {!locked && order.length ? <PrimaryButton label="Start over" variant="ghost" onPress={() => setOrder([])} /> : null}
    </View>
  );
}

function FeedbackPanel({
  q,
  fb,
  showModel,
  onToggleModel,
}: {
  q: LabQuestion;
  fb: LabFeedback;
  showModel: boolean;
  onToggleModel: () => void;
}) {
  const tone = fb.observed === 'correct' ? 'success' : fb.observed === 'partial' ? 'accent' : 'error';
  const verdict = fb.observed === 'correct' ? 'Correct' : fb.observed === 'partial' ? 'Partly there' : 'Not quite';
  const r = fb.reveal;
  const steps = q.kind === 'chain' ? r.correct_order.map((id) => q.items.find((x) => x.id === id)?.text ?? id) : [];
  return (
    <View style={{ gap: 12 }}>
      <Card tone={tone}>
        <View style={styles.verdictRow}>
          <Chip label={verdict} tone={tone} />
          {fb.graded_by === 'llm' ? <Chip label={`${fb.score}/100 · AI graded`} tone="neutral" size="sm" /> : null}
          {fb.graded_by === 'fallback' ? <Chip label="rough check" tone="neutral" size="sm" /> : null}
        </View>
        <ThemedText type="small">{fb.explanation}</ThemedText>
      </Card>

      {q.kind === 'predict' && r.facts.length ? (
        <>
          <SectionHeader title="What actually happened" first />
          {r.facts.length >= 2 ? (
            <LinkDiagram
              from={moveNode(r.facts[0])}
              to={moveNode(r.facts[1])}
              caption={r.followed == null ? 'The second market barely moved.' : r.followed ? 'Followed the usual link.' : 'Broke the usual link.'}
            />
          ) : null}
          {r.followed != null ? (
            <Card tone={r.followed ? 'success' : 'accent'}>
              <ThemedText type="smallBold">
                {r.followed ? 'Today followed the usual pattern.' : 'Today broke the usual pattern.'}
              </ThemedText>
              {!r.followed && r.exception ? (
                <ThemedText type="small" themeColor="textSecondary">
                  When the rule can fail: {r.exception}
                </ThemedText>
              ) : null}
            </Card>
          ) : (
            <ThemedText type="caption" themeColor="textSecondary">
              The second market barely moved, so today neither confirms nor breaks the rule.
            </ThemedText>
          )}
        </>
      ) : null}

      {q.kind === 'chain' && steps.length ? (
        <>
          <SectionHeader title="The correct chain" first />
          <FlowDiagram nodes={chainNodes(steps)} />
        </>
      ) : null}

      {q.kind === 'scenario' ? (
        <>
          <SectionHeader title="What the ripple looks like" first />
          <ImpactDiagram
            shock={r.shock ?? q.title ?? 'The change'}
            effects={r.parts.map((p) => ({
              label: p.label,
              dir: p.expected,
              pick: p.picked ?? 'none',
              correct: p.correct,
              why: p.why,
              badge: r.facts.find((m) => m.fact_id === p.fact_id) ? `today: ${signed(r.facts.find((m) => m.fact_id === p.fact_id)!.change, r.facts.find((m) => m.fact_id === p.fact_id)!.change_unit)}` : undefined,
            }))}
          />
          {r.chain.length ? (
            <>
              <SectionHeader title="Why: the chain reaction" />
              <StepsDiagram steps={r.chain.map((c) => ({ from: c.from_, to: c.to, why: c.why }))} />
            </>
          ) : null}
          {r.facts.length && r.facts_note ? (
            <>
              <ThemedText type="caption" themeColor="textSecondary">
                {r.facts_note}
              </ThemedText>
              <LabelledSection kind="fact">
                {r.facts.map((m, n) => (
                  <MoveRow key={m.fact_id} move={m} divider={n > 0} />
                ))}
              </LabelledSection>
            </>
          ) : null}
          {r.exception ? (
            <Card tone="accent">
              <ThemedText type="kicker" style={{ color: Palette.warning }}>
                When it would NOT happen
              </ThemedText>
              <ThemedText type="small">{r.exception}</ThemedText>
            </Card>
          ) : null}
        </>
      ) : null}

      {q.kind === 'explain' ? (
        <>
          {fb.strengths.length ? (
            <Card tone="success">
              <ThemedText type="kicker" style={{ color: Palette.success }}>
                You got right
              </ThemedText>
              {fb.strengths.map((s) => (
                <ThemedText key={s} type="small">
                  • {s}
                </ThemedText>
              ))}
            </Card>
          ) : null}
          {fb.gaps.length ? (
            <Card tone="accent">
              <ThemedText type="kicker" style={{ color: Palette.warning }}>
                To strengthen
              </ThemedText>
              {fb.gaps.map((s) => (
                <ThemedText key={s} type="small">
                  • {s}
                </ThemedText>
              ))}
            </Card>
          ) : null}
          {r.model_answer ? (
            <>
              <PrimaryButton
                label={showModel ? 'Hide model answer' : 'See a model answer'}
                variant="secondary"
                onPress={onToggleModel}
              />
              {showModel ? (
                <LabelledSection kind="teaching" title="Model answer">
                  <ThemedText type="small">{r.model_answer}</ThemedText>
                </LabelledSection>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {fb.mastery.length ? (
        <ChipRow>
          {fb.mastery.map((m) => (
            <Chip
              key={m.concept_id}
              tone={m.mastery_after >= m.mastery_before ? 'success' : 'error'}
              size="sm"
              label={`${conceptLabel(m.concept_id)} ${Math.round(m.mastery_before * 100)}% → ${Math.round(m.mastery_after * 100)}%`}
            />
          ))}
        </ChipRow>
      ) : null}
    </View>
  );
}

function Summary({
  results,
  onAgain,
  onDone,
  router,
  onShown,
  dailyDone,
}: {
  results: { q: LabQuestion; fb: LabFeedback }[];
  onAgain: () => void;
  onDone: () => void;
  router: ReturnType<typeof useRouter>;
  onShown?: () => void;
  dailyDone?: boolean;
}) {
  useEffect(() => {
    onShown?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const points = results.reduce((a, r) => a + (r.fb.observed === 'correct' ? 1 : r.fb.observed === 'partial' ? 0.5 : 0), 0);
  const pct = results.length ? Math.round((points / results.length) * 100) : 0;
  const verdict =
    pct >= 80 ? 'You understand how this hangs together.' : pct >= 50 ? 'Solid base, a few gaps to close.' : 'Good start: the mechanism is the thing to revisit.';
  const weak = Array.from(
    new Set(results.filter((r) => r.fb.observed !== 'correct').flatMap((r) => r.q.concept_ids)),
  ).slice(0, 4);
  const byKind = (['scenario', 'predict', 'driver', 'chain', 'explain'] as const)
    .map((k) => {
      const rs = results.filter((r) => r.q.kind === k);
      if (!rs.length) return null;
      const ok = rs.filter((r) => r.fb.observed === 'correct').length;
      return { k, ok, n: rs.length };
    })
    .filter((x): x is { k: LabKind; ok: number; n: number } => !!x);

  return (
    <Screen
      title="Your results"
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton label={dailyDone ? "Back to today" : "Another set"} onPress={dailyDone ? () => router.replace('/(tabs)') : onAgain} />
          <PrimaryButton label={dailyDone ? "Another set" : "Back"} variant="secondary" onPress={dailyDone ? onAgain : onDone} />
          <Disclaimer />
        </>
      }
    >
      <Card tone={pct >= 80 ? 'success' : pct >= 50 ? 'info' : 'accent'}>
        <ThemedText type="display">{pct}%</ThemedText>
        <ThemedText type="smallBold">{verdict}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {results.filter((r) => r.fb.observed === 'correct').length} of {results.length} fully correct. Your concept
          mastery on the Learn tab was updated from these answers.
        </ThemedText>
      </Card>

      <SectionHeader title="By skill" />
      <Card>
        {byKind.map(({ k, ok, n }, idx) => (
          <View key={k} style={[styles.skillRow, idx > 0 && styles.skillDivider]}>
            <Text style={styles.skillName}>{KIND_LABEL[k]}</Text>
            <Text style={styles.skillScore}>
              {ok}/{n}
            </Text>
          </View>
        ))}
      </Card>

      {weak.length ? (
        <>
          <SectionHeader title="Worth revisiting" meta="tap to learn" />
          <ChipRow>
            {weak.map((c) => (
              <Pressable
                key={c}
                onPress={() => router.push({ pathname: '/lesson', params: { concept: c } })}
                accessibilityRole="button"
              >
                <Chip label={conceptLabel(c)} tone="accent" outlined />
              </Pressable>
            ))}
          </ChipRow>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.border },
  dotDone: { backgroundColor: Palette.secondary },
  dotNow: { backgroundColor: Palette.primary, width: 20 },
  tagRow: { flexDirection: 'row', gap: 6 },
  predictRow: { flexDirection: 'row', gap: 12 },
  predictBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 18,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  arrow: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  predictLabel: { fontSize: 16, fontWeight: '700' },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
    backgroundColor: Palette.surface,
    textAlignVertical: 'top',
  },
  partRow: {
    gap: 6,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  partLabel: { color: Palette.text, fontSize: 15, fontWeight: '700' },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Palette.border,
    backgroundColor: Palette.pageBackground,
  },
  segText: { color: Palette.text, fontSize: 12, fontWeight: '700' },
  chainItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  chainItemOn: { borderColor: Palette.primary, backgroundColor: Palette.softInfo },
  chainBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainBadgeText: { color: Palette.primary, fontWeight: '800' },
  chainText: { flex: 1, color: Palette.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  skillDivider: { borderTopWidth: 1, borderTopColor: Palette.border },
  skillName: { color: Palette.text, fontSize: 15, fontWeight: '600' },
  skillScore: { color: Palette.primary, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});


function PlacementSummary({ step, onDone, edges }: { step: PlacementStep; onDone: () => void; edges: ('top' | 'bottom')[] }) {
  const level = step.level ?? 'beginner';
  const mark = (o: Observed) => (o === 'correct' ? '✓' : o === 'partial' ? '~' : '✕');
  const color = (o: Observed) => (o === 'correct' ? Palette.success : o === 'partial' ? Palette.warning : Palette.error);
  return (
    <Screen
      title="Your starting point"
      safeEdges={edges}
      footer={
        <>
          <PrimaryButton label="Build my roadmap" onPress={onDone} />
          <Disclaimer />
        </>
      }
    >
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Placed at
        </ThemedText>
        <ThemedText type="display" style={{ textTransform: 'capitalize' }}>
          {level}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {step.percent}% across {step.total} topics. Your roadmap now skips what you know and starts where the gaps
          are.
        </ThemedText>
      </Card>
      <SectionHeader title="By topic" />
      <Card>
        {step.topics.map((t, n) => (
          <View key={t.section_id} style={[styles.skillRow, n > 0 && styles.skillDivider]}>
            <Text style={styles.skillName}>{t.title}</Text>
            <Text style={[styles.skillScore, { color: color(t.observed) }]}>{mark(t.observed)}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
