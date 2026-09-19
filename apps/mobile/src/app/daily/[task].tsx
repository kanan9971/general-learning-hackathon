import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  completeDailyTask,
  submitDailyAnalysis,
  type AnalysisFeedback,
  type DailyToday,
  type Level,
  type TaskKind,
} from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { FlowDiagram, StepsDiagram } from '@/components/Diagrams';
import { HeadlineItem } from '@/components/HeadlineItem';
import { LabelledSection } from '@/components/LabelledSection';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RuleCard } from '@/components/RuleCard';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Radius } from '@/constants/theme';
import { localToday, useDaily } from '@/lib/daily';
import { conceptLabel, getPlan } from '@/lib/learner';
import { useMarketsFeed } from '@/lib/useMarketsFeed';

const TITLES: Record<TaskKind, string> = {
  brief: 'Morning brief',
  focus: "Today's focus",
  analysis: 'Analyst note',
  practice: 'Practice',
  review: 'Review',
  recap: 'Weekly recap',
};

/** One page for every block of the daily session; the block id in the route picks the view. */
export default function DailyBlock() {
  const { task } = useLocalSearchParams<{ task: TaskKind }>();
  const router = useRouter();
  const { today, error, setToday } = useDaily();
  const [level, setLevel] = useState<Level | undefined>();
  useEffect(() => {
    getPlan().then((p) => setLevel(p?.level));
  }, []);

  const t = today?.tasks.find((x) => x.id === task);
  const back = () => router.replace('/(tabs)');

  if (!today || !t) {
    return (
      <Screen safeEdges={['bottom']}>
        <Stack.Screen options={{ title: TITLES[task] ?? 'Session' }} />
        {error ? <ThemedText>{error}</ThemedText> : today && !t ? <ThemedText>This block isn&apos;t part of today&apos;s session.</ThemedText> : <ActivityIndicator color={Palette.primary} />}
      </Screen>
    );
  }

  const props = { today, level, setToday, back, done: t.status === 'done', result: t.result ?? null };
  return (
    <Screen title={t.title} subtitle={`${t.minutes} min · ${t.blurb}`} safeEdges={['bottom']} footer={<Disclaimer />}>
      <Stack.Screen options={{ title: TITLES[task] }} />
      {task === 'brief' ? <Brief {...props} /> : null}
      {task === 'focus' ? <Focus {...props} /> : null}
      {task === 'analysis' ? <Analysis {...props} /> : null}
      {task === 'practice' ? <Practice {...props} /> : null}
      {task === 'review' ? <Review {...props} /> : null}
      {task === 'recap' ? <Recap {...props} /> : null}
    </Screen>
  );
}

type P = {
  today: DailyToday;
  level?: Level;
  setToday: (t: DailyToday) => void;
  back: () => void;
  done: boolean;
  result: Record<string, unknown> | null;
};

function useSubmit(setToday: (t: DailyToday) => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<DailyToday>) => {
    setBusy(true);
    setErr(null);
    try {
      setToday(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run };
}

function Done({ text, back }: { text: string; back: () => void }) {
  return (
    <Card tone="success">
      <ThemedText type="smallBold">✓ {text}</ThemedText>
      <PrimaryButton label="Back to today" onPress={back} />
    </Card>
  );
}

function Input({ value, onChange, placeholder, tall }: { value: string; onChange: (v: string) => void; placeholder: string; tall?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Palette.muted}
      multiline
      style={[styles.input, tall && { minHeight: 110 }]}
    />
  );
}

function Err({ text }: { text: string | null }) {
  return text ? (
    <ThemedText type="small" style={{ color: Palette.error }}>
      {text}
    </ThemedText>
  ) : null;
}

// ---- 1 · Brief: look, then commit to your own read before the AI's ----
function Brief({ today, level, setToday, back, done, result }: P) {
  const router = useRouter();
  const [call, setCall] = useState('');
  const { busy, err, run } = useSubmit(setToday);
  return (
    <>
      <LabelledSection kind="fact" title="1 · Look">
        {today.top_moves.map((m, i) => (
          <MoveRow key={m.fact_id} move={m} divider={i > 0} />
        ))}
      </LabelledSection>
      <PrimaryButton label="Open the market map" variant="secondary" onPress={() => router.push({ pathname: '/connect', params: { tab: 'map' } })} />
      <SectionHeader title="2 · Your call" meta="before you see the AI's" />
      {done ? (
        <>
          <Card>
            <ThemedText type="kicker" style={{ color: Palette.primary }}>
              You wrote
            </ThemedText>
            <ThemedText type="small">{String(result?.call ?? '')}</ThemedText>
          </Card>
          <PrimaryButton label="Now compare with the AI overview" variant="secondary" onPress={() => router.push('/overview')} />
          <Done text="Brief done" back={back} />
        </>
      ) : (
        <>
          <Input value={call} onChange={setCall} tall placeholder="What is the market's main story today, and what do you expect next? Two sentences is enough." />
          <Err text={err} />
          <PrimaryButton
            label={busy ? 'Saving…' : 'Lock in my read'}
            disabled={call.trim().length < 20}
            loading={busy}
            onPress={() => void run(() => completeDailyTask('brief', { level, today: localToday(), call }))}
          />
        </>
      )}
    </>
  );
}

// ---- 2 · Focus: today's roadmap topic, tied to what moved ----
function Focus({ today, level, setToday, back, done }: P) {
  const router = useRouter();
  const { feed } = useMarketsFeed();
  const { busy, err, run } = useSubmit(setToday);
  const section = feed?.sections.find((s) => s.id === today.focus_section_id);
  const g = section?.guide;
  const complete = () => void run(() => completeDailyTask('focus', { level, today: localToday() }));
  return (
    <>
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.primary }}>
          Week {today.phase.index + 1} · {today.phase.title}
        </ThemedText>
        <Text style={styles.big}>{today.focus_title}</Text>
      </Card>
      {g ? (
        <>
          <LabelledSection kind="teaching" title="The big idea">
            <Text style={styles.idea}>{g.mental_model}</Text>
          </LabelledSection>
          {g.rules[0] ? <RuleCard rule={g.rules[0]} /> : null}
          <StepsDiagram steps={g.transmission.map((s) => ({ from: s.from_, to: s.to, why: s.why }))} />
          {section && section.moves.length ? (
            <LabelledSection kind="fact" title="How it looks today">
              {section.moves.slice(0, 3).map((m, i) => (
                <MoveRow key={m.fact_id} move={m} divider={i > 0} />
              ))}
            </LabelledSection>
          ) : null}
          <PrimaryButton label="Open the full topic" variant="secondary" onPress={() => router.push({ pathname: '/market/[section]', params: { section: g.id } })} />
        </>
      ) : today.focus_node_id === 'connect' && feed ? (
        <>
          <ThemedText type="small">{feed.primer.intro}</ThemedText>
          <FlowDiagram
            nodes={[{ label: feed.primer.steps[0].from_, tone: 'shock' }, ...feed.primer.steps.map((s, i) => ({ label: s.to, tone: (i === feed.primer.steps.length - 1 ? 'goal' : 'neutral') as 'goal' | 'neutral' }))]}
            edges={feed.primer.steps.map((s) => s.why)}
          />
        </>
      ) : today.focus_node_id === 'interview' || today.focus_node_id === 'crossasset' ? (
        <PrimaryButton
          label={today.focus_node_id === 'interview' ? 'Practise explaining out loud' : 'Try cross-asset what-ifs'}
          variant="secondary"
          onPress={() => router.push({ pathname: '/lab', params: { kinds: today.focus_node_id === 'interview' ? 'explain' : 'scenario' } })}
        />
      ) : !feed ? (
        <ActivityIndicator color={Palette.primary} />
      ) : null}
      <Err text={err} />
      {done ? <Done text="Focus done" back={back} /> : <PrimaryButton label={busy ? 'Saving…' : "I've read this"} icon="checkmark" loading={busy} onPress={complete} />}
    </>
  );
}

// ---- 3 · Analyst note: the core block, graded against today's real data ----
function Analysis({ today, level, setToday, back, done, result }: P) {
  const a = today.analysis;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState<AnalysisFeedback | null>(null);
  const [showModel, setShowModel] = useState(false);

  if (!a) {
    return (
      <Card>
        <ThemedText type="small">Analyst notes are written on market days. Today is a recap day.</ThemedText>
        <PrimaryButton label="Back to today" onPress={back} />
      </Card>
    );
  }
  const ready = a.prompts.every((p) => (answers[p.id] ?? '').trim().length >= 12);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await submitDailyAnalysis({ level, today: localToday(), answers });
      setFb(res);
      setToday(res.today);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not grade your note');
    } finally {
      setBusy(false);
    }
  };

  if (fb) {
    const tone = fb.passed ? (fb.observed === 'correct' ? 'success' : 'accent') : 'error';
    return (
      <>
        <Card tone={tone}>
          <View style={styles.between}>
            <Text style={styles.score}>{fb.score}</Text>
            <Chip label={fb.passed ? (fb.observed === 'correct' ? 'Strong note' : 'Passed') : 'Not yet'} tone={tone} />
          </View>
          <ThemedText type="small">
            {fb.graded_by === 'fallback'
              ? 'The AI grader was unavailable, so this counts for effort only.'
              : fb.passed
                ? 'This counts toward today’s goal.'
                : 'Revise the weak parts and resubmit; it counts once it reaches 45.'}
          </ThemedText>
        </Card>
        <SectionHeader title="By prompt" first />
        <Card style={{ gap: 12 }}>
          {fb.prompt_scores.map((p) => (
            <View key={p.prompt_id} style={{ gap: 4 }}>
              <View style={styles.between}>
                <Text style={styles.pTitle}>{a.prompts.find((x) => x.id === p.prompt_id)?.title}</Text>
                <Text style={styles.pScore}>{p.score}/4</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(p.score / 4) * 100}%`, backgroundColor: p.score >= 3 ? Palette.success : p.score === 2 ? Palette.warning : Palette.error }]} />
              </View>
              <ThemedText type="caption" themeColor="textSecondary">
                {p.comment}
              </ThemedText>
            </View>
          ))}
        </Card>
        {fb.strengths.length ? (
          <Card tone="success">
            <ThemedText type="kicker" style={{ color: Palette.success }}>
              You did well
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
        <PrimaryButton label={showModel ? 'Hide the model note' : 'See a model note'} variant="secondary" onPress={() => setShowModel((v) => !v)} />
        {showModel ? (
          <LabelledSection kind="teaching" title="A model note">
            <ThemedText type="small">{fb.model_note}</ThemedText>
          </LabelledSection>
        ) : null}
        {fb.passed ? <PrimaryButton label="Back to today" onPress={back} /> : <PrimaryButton label="Revise my note" onPress={() => setFb(null)} />}
      </>
    );
  }

  return (
    <>
      {done ? (
        <Card tone="success">
          <ThemedText type="smallBold">✓ Done today: {String(result?.score ?? '')}/100 on {String(result?.target ?? 'the biggest move')}</ThemedText>
          <PrimaryButton label="Back to today" onPress={back} />
        </Card>
      ) : null}
      <LabelledSection kind="fact" title="Today's biggest move">
        <MoveRow move={a.target} showFiveDay />
      </LabelledSection>
      {a.related.length ? (
        <LabelledSection kind="fact" title="What else moved">
          {a.related.map((m, i) => (
            <MoveRow key={m.fact_id} move={m} divider={i > 0} />
          ))}
        </LabelledSection>
      ) : null}
      <SectionHeader title="Headlines to use as evidence" />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {a.headlines.map((h, i) => (
          <HeadlineItem key={h.id} item={h} compact divider={i > 0} />
        ))}
      </Card>
      <SectionHeader title="Write your note" meta="5 short parts, graded against the data above" />
      {a.prompts.map((p, i) => (
        <View key={p.id} style={{ gap: 6 }}>
          <Text style={styles.pTitle}>
            {i + 1}. {p.title}
          </Text>
          <ThemedText type="caption" themeColor="textSecondary">
            {p.hint}
          </ThemedText>
          <Input value={answers[p.id] ?? ''} onChange={(v) => setAnswers((m) => ({ ...m, [p.id]: v }))} placeholder="One or two sentences" />
        </View>
      ))}
      <Err text={err} />
      <PrimaryButton label={busy ? 'Grading… (~10s)' : done ? 'Submit a new version' : 'Submit my note'} disabled={!ready} loading={busy} onPress={() => void submit()} />
    </>
  );
}

// ---- 4 · Practice: five questions on today's market ----
function Practice({ today, done, result, back }: P) {
  const router = useRouter();
  return (
    <>
      <Card tone="info">
        <ThemedText type="smallBold">Five questions, built from today&apos;s real moves</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          What-ifs, predictions and chains, weighted to {today.focus_title}. Finish the set and this block ticks itself off.
        </ThemedText>
      </Card>
      {done ? (
        <Done text={`Practice done: ${String(result?.correct ?? 0)} of ${String(result?.answered ?? 0)} correct`} back={back} />
      ) : null}
      <PrimaryButton
        label={done ? 'Do another set' : "Start today's set"}
        onPress={() => router.push({ pathname: '/lab', params: { daily: '1', focus: today.focus_section_id ?? '' } })}
      />
    </>
  );
}

// ---- 5 · Review: spaced review, then set tomorrow's watch item ----
function Review({ today, level, setToday, back, done, result }: P) {
  const router = useRouter();
  const [watch, setWatch] = useState('');
  const { busy, err, run } = useSubmit(setToday);
  return (
    <>
      <LabelledSection kind="teaching" title="Due for review">
        {today.due_concepts.length ? (
          <ChipRow>
            {today.due_concepts.map((c) => (
              <Chip key={c} label={conceptLabel(c)} tone="accent" />
            ))}
          </ChipRow>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing is due. You are up to date.
          </ThemedText>
        )}
      </LabelledSection>
      {today.due_concepts.length ? (
        <PrimaryButton
          label="Quick review quiz"
          variant="secondary"
          onPress={() => router.push({ pathname: '/quiz', params: { formats: 'mcq,short_answer', concepts: today.due_concepts.join(','), customs: '', level: level ?? 'beginner' } })}
        />
      ) : null}
      <SectionHeader title="Plan tomorrow" />
      {done ? (
        <>
          <Card>
            <ThemedText type="kicker" style={{ color: Palette.primary }}>
              You will watch
            </ThemedText>
            <ThemedText type="small">{String(result?.watch ?? '')}</ThemedText>
          </Card>
          <Done text="Review done" back={back} />
        </>
      ) : (
        <>
          <Input value={watch} onChange={setWatch} placeholder="One thing you will watch next: a data release, a level, a headline…" />
          <Err text={err} />
          <PrimaryButton label={busy ? 'Saving…' : 'Save and finish'} disabled={watch.trim().length < 5} loading={busy} onPress={() => void run(() => completeDailyTask('review', { level, today: localToday(), watch }))} />
        </>
      )}
    </>
  );
}

// ---- Weekend: look back at the week ----
function Recap({ today, level, setToday, back, done }: P) {
  const { busy, err, run } = useSubmit(setToday);
  const w = today.week;
  return (
    <>
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.primary }}>
          Your week
        </ThemedText>
        {w ? (
          <>
            <Text style={styles.big}>
              {w.days_met} of {w.market_days} market days completed
            </Text>
            <ThemedText type="small" themeColor="textSecondary">
              {w.notes_written} analyst note{w.notes_written === 1 ? '' : 's'}
              {w.avg_note_score != null ? ` · average ${w.avg_note_score}/100` : ''} · {w.minutes} minutes
            </ThemedText>
          </>
        ) : null}
        <ThemedText type="small">
          Streak {today.streak} days · best {today.best_streak}. Next week: {today.phase.title}.
        </ThemedText>
      </Card>
      <Err text={err} />
      {done ? <Done text="Recap done" back={back} /> : <PrimaryButton label={busy ? 'Saving…' : 'Mark recap done'} icon="checkmark" loading={busy} onPress={() => void run(() => completeDailyTask('recap', { level, today: localToday() }))} />}
    </>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  big: { color: Palette.text, fontFamily: Fonts.displaySemi, fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: -0.4 },
  idea: { color: Palette.text, fontSize: 17, lineHeight: 25, fontWeight: '600' },
  score: { color: Palette.text, fontFamily: Fonts.display, fontSize: 44, fontWeight: '700', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  pTitle: { color: Palette.text, fontSize: 15, fontWeight: '700' },
  pScore: { color: Palette.muted, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: Palette.surfaceSunken, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  input: {
    minHeight: 76,
    borderWidth: 1.5,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
    backgroundColor: Palette.surface,
    textAlignVertical: 'top',
  },
});
