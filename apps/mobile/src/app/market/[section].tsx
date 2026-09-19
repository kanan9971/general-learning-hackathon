import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  explainMarketSection,
  getMarketsFeed,
  type ExplainSectionResponse,
  type Level,
  type MarketSection,
  type MarketSectionId,
  type MarketsFeed,
  type Move,
} from '@/api/client';
import { Card } from '@/components/Card';
import { StepsDiagram } from '@/components/Diagrams';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { Evidence } from '@/components/Evidence';
import { HeadlineItem } from '@/components/HeadlineItem';
import { LabelledSection } from '@/components/LabelledSection';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RuleCard } from '@/components/RuleCard';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { StepHeader } from '@/components/StepHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { asOfLabel, signed } from '@/lib/format';
import { getInterests } from '@/lib/interests';
import { conceptLabel, getPlan } from '@/lib/learner';

export default function MarketSectionScreen() {
  const { section: sectionId } = useLocalSearchParams<{ section: MarketSectionId }>();
  const router = useRouter();
  const [feed, setFeed] = useState<MarketsFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('beginner');
  const [watch, setWatch] = useState<string[]>([]);
  const [note, setNote] = useState<ExplainSectionResponse | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [i, plan] = await Promise.all([getInterests(), getPlan()]);
      setWatch(i.watch);
      setLevel(plan?.level ?? 'beginner');
      try {
        setFeed(await getMarketsFeed({ interests: i.sections, watch: i.watch }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this section');
      }
    })();
  }, []);

  const section = feed?.sections.find((s) => s.id === sectionId);

  const loadNote = async () => {
    setNoteLoading(true);
    setNoteError(null);
    try {
      setNote(await explainMarketSection(sectionId, { level, watch }));
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : 'The desk note is unavailable');
    } finally {
      setNoteLoading(false);
    }
  };

  if (!section || !feed) {
    return (
      <Screen safeEdges={['bottom']}>
        {error ? <ThemedText>{error}</ThemedText> : <ActivityIndicator color={Palette.primary} />}
      </Screen>
    );
  }

  const g = section.guide;
  const hasData = g.group !== 'foundations'; // foundations teach concepts; there are no prices to look at
  let step = 1;
  const openLab = () => router.push({ pathname: '/lab', params: { section: g.id } });

  return (
    <Screen
      title={g.title}
      subtitle={g.tagline}
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton label="Test my understanding" onPress={openLab} />
          <PrimaryButton
            label="Concept quiz"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/quiz',
                params: { formats: 'mcq,case_study', concepts: g.concept_ids.join(','), customs: '', level },
              })
            }
          />
          <Disclaimer />
        </>
      }
    >
      <Stack.Screen options={{ title: g.title }} />
      {hasData ? <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} /> : null}

      <LabelledSection kind="teaching" title="The big idea">
        <Text style={styles.bigIdea}>{g.mental_model}</Text>
        <ThemedText type="caption" themeColor="textSecondary">
          Who works on this: {g.desk}
        </ThemedText>
      </LabelledSection>

      {/* 1 · UNDERSTAND */}
      <StepHeader n={step++} title="Understand" subtitle="How it works, and the rules traders carry in their heads" />
      <LabelledSection kind="teaching">
        {g.how_it_works.map((p, i) => (
          <ThemedText key={i} type="small">
            {p}
          </ThemedText>
        ))}
      </LabelledSection>

      <SectionHeader title="Rules of thumb" meta="if → then, and when they fail" />
      {g.rules.map((r) => (
        <RuleCard key={r.when} rule={r} />
      ))}

      <SectionHeader title="What moves it" />
      <Card>
        {g.key_drivers.map((d, i) => (
          <View key={d.name} style={[styles.item, i > 0 && styles.divider]}>
            <Text style={styles.itemTitle}>{d.name}</Text>
            <Text style={styles.itemBody}>{d.why}</Text>
          </View>
        ))}
      </Card>

      <SectionHeader title="The chain reaction" meta="cause → effect, in order" />
      <StepsDiagram steps={g.transmission.map((s) => ({ from: s.from_, to: s.to, why: s.why }))} />

      {/* 2 · SEE IT TODAY */}
      {hasData ? (
        <>
          <StepHeader n={step++} title="See it today" subtitle="Real numbers, an AI explanation with evidence, headlines" />
          {section.id === 'portfolio' ? <PortfolioBlock section={section} source={feed.portfolio_source} /> : null}

          <LabelledSection kind="fact" title="Today's numbers">
            {section.moves.length ? (
              section.moves.map((m, i) => <MoveRow key={m.fact_id} move={m} showFiveDay divider={i > 0} />)
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {section.note ?? 'No prices available.'}
              </ThemedText>
            )}
          </LabelledSection>

          {note ? (
            <DeskNote note={note} />
          ) : (
            <Card>
              <ThemedText type="smallBold">Why did it move? Ask the desk note.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                An AI explanation of today&apos;s moves in this section, with the data and headlines it relies on. Read
                the numbers above first and form your own view; then compare.
              </ThemedText>
              {noteError ? (
                <ThemedText type="small" style={{ color: Palette.error }}>
                  {noteError}
                </ThemedText>
              ) : null}
              {noteLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={Palette.primary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Reading today&apos;s headlines… (~10s)
                  </ThemedText>
                </View>
              ) : (
                <PrimaryButton label="Explain today" variant="secondary" onPress={() => void loadNote()} />
              )}
            </Card>
          )}

          <SectionHeader title="Headlines" meta="Fed · WSJ · Yahoo Finance" />
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {section.headlines.length ? (
              section.headlines.map((h, i) => <HeadlineItem key={h.id} item={h} divider={i > 0} />)
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 12 }}>
                No recent headlines for this section.
              </ThemedText>
            )}
          </Card>
        </>
      ) : null}

      {/* 3 · TEST YOURSELF */}
      <StepHeader
        n={step++}
        title="Test yourself"
        subtitle={hasData ? "Not recall: reasoning, on today's real data" : 'Check you can reason with it, not just recite it'}
      />
      <Card tone="info">
        <ThemedText type="smallBold">The Market Lab checks you actually understand:</ThemedText>
        {(hasData
          ? [
              ['What if?', 'change one thing (a Fed cut, an oil shock) and predict the ripple across assets'],
              ['Predict', "call the direction before seeing what happened, then compare with today's real move"],
              ['Pick the driver', 'tell real drivers from ones that belong to other markets'],
              ['Order the chain', 'put a cause-and-effect chain back in sequence'],
              ['Explain', 'write the mechanism in your own words; AI grades it against the evidence'],
            ]
          : [
              ['What if?', 'change one thing and predict the ripple'],
              ['Pick the driver', 'tell real drivers from lookalikes'],
              ['Order the chain', 'put a cause-and-effect chain back in sequence'],
              ['Explain', 'answer interview-style questions in your own words'],
            ]
        ).map(([k, v]) => (
          <ThemedText key={k} type="small">
            <Text style={styles.bold}>{k}</Text> · {v}
          </ThemedText>
        ))}
        <PrimaryButton label="Start the Market Lab" onPress={openLab} />
        <PrimaryButton
          label="What-if scenarios only"
          variant="secondary"
          onPress={() => router.push({ pathname: '/lab', params: { section: g.id, kinds: 'scenario' } })}
        />
      </Card>

      {/* 4 · THINK LIKE A DESK */}
      <StepHeader n={step++} title="Think like a desk" subtitle="How professionals use this, and where beginners slip" />
      <SectionHeader title="How desks trade it" meta="educational archetypes, not advice" first />
      {g.strategies.map((s) => (
        <Card key={s.name}>
          <Text style={styles.stratTitle}>{s.name}</Text>
          <ThemedText type="small">{s.idea}</ThemedText>
          <View style={styles.kv}>
            <Text style={styles.k}>How it&apos;s expressed</Text>
            <Text style={styles.itemBody}>{s.how_expressed}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={[styles.k, { color: Palette.error }]}>What breaks it</Text>
            <Text style={styles.itemBody}>{s.what_breaks_it}</Text>
          </View>
          <ChipRow>
            {s.concept_ids.map((c) => (
              <Chip key={c} label={conceptLabel(c)} tone="accent" size="sm" />
            ))}
          </ChipRow>
        </Card>
      ))}

      {g.mistakes.length ? (
        <Card tone="accent">
          <ThemedText type="kicker" style={{ color: Palette.warning }}>
            Classic beginner mistakes
          </ThemedText>
          {g.mistakes.map((m) => (
            <ThemedText key={m} type="small">
              • {m}
            </ThemedText>
          ))}
        </Card>
      ) : null}

      {g.interview.length ? (
        <Card tone="info">
          <ThemedText type="kicker" style={{ color: Palette.primary }}>
            Interview questions to practise out loud
          </ThemedText>
          {g.interview.map((m) => (
            <ThemedText key={m} type="small">
              • {m}
            </ThemedText>
          ))}
        </Card>
      ) : null}

      <SectionHeader title="What to watch" />
      <Card>
        {g.watch.map((w) => (
          <ThemedText key={w} type="small">
            • {w}
          </ThemedText>
        ))}
      </Card>

      {Object.keys(g.glossary).length ? (
        <>
          <SectionHeader title="Jargon buster" />
          <Card>
            {Object.entries(g.glossary).map(([term, def], i) => (
              <View key={term} style={[styles.item, i > 0 && styles.divider]}>
                <Text style={styles.itemTitle}>{term}</Text>
                <Text style={styles.itemBody}>{def}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function DeskNote({ note }: { note: ExplainSectionResponse }) {
  const e = note.explanation;
  const byFact = new Map<string, Move>(note.moves.map((m) => [m.fact_id, m]));
  const byHeadline = new Map(note.headlines.map((h) => [h.id, h]));
  return (
    <>
      <LabelledSection kind="interpretation" title="What happened (AI desk note)">
        <ThemedText>{e.summary}</ThemedText>
        <View style={styles.confRow}>
          <Chip label={`${e.confidence} confidence`} tone="accent" size="sm" />
          <ThemedText type="caption" themeColor="textSecondary" style={{ flex: 1 }}>
            {e.confidence_reason}
          </ThemedText>
        </View>
        {note.generated_by === 'fallback' ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Template note: the AI explainer was unavailable.
          </ThemedText>
        ) : null}
      </LabelledSection>

      <LabelledSection kind="interpretation" title="Likely drivers & evidence">
        {e.drivers.map((d, i) => (
          <View key={i} style={{ gap: 6 }}>
            <ThemedText type="small">{d.explanation}</ThemedText>
            <Evidence factIds={d.fact_ids} headlineIds={d.headline_ids} moves={byFact} headlines={byHeadline} />
          </View>
        ))}
      </LabelledSection>

      <StepsDiagram steps={e.chain.map((s) => ({ from: s.from_, to: s.to, why: s.why }))} />

      <LabelledSection kind="interpretation" title="How a desk might think about it">
        {e.desk_views.map((v) => (
          <View key={v.strategy} style={{ gap: 2 }}>
            <Text style={styles.itemTitle}>{v.strategy}</Text>
            <ThemedText type="small">{v.rationale}</ThemedText>
            <ThemedText type="small" style={{ color: Palette.error }}>
              Wrong if: {v.risk}
            </ThemedText>
          </View>
        ))}
      </LabelledSection>

      {e.watch_next.length ? (
        <LabelledSection kind="interpretation" title="Watch next">
          {e.watch_next.map((w) => (
            <ThemedText key={w} type="small">
              • {w}
            </ThemedText>
          ))}
        </LabelledSection>
      ) : null}
    </>
  );
}

function PortfolioBlock({ section, source }: { section: MarketSection; source: string }) {
  const a = section.attribution;
  if (!a) {
    return (
      <Card tone="accent">
        <ThemedText type="small">{section.note ?? 'Attribution unavailable.'}</ThemedText>
      </Card>
    );
  }
  const pnl = a.portfolio_return_pct;
  return (
    <LabelledSection kind="fact" title={source === 'demo' ? 'Demo book · connect a broker later' : 'Your book'}>
      <Text style={[styles.pnl, { color: pnl > 0 ? Palette.success : pnl < 0 ? Palette.error : Palette.text }]}>
        {signed(pnl, '%')}
      </Text>
      <ThemedText type="caption" themeColor="textSecondary">
        Day return = Σ weight × return, calculated from prices (not AI)
      </ThemedText>
      {a.contributions.map((c, i) => (
        <View key={c.symbol} style={[styles.contribRow, i > 0 && styles.divider]}>
          <Text style={styles.sym}>{c.symbol}</Text>
          <Text style={styles.itemBody}>
            {(c.weight * 100).toFixed(0)}% · {signed(c.return_pct, '%')}
          </Text>
          <Text style={[styles.contrib, { color: c.contribution_pct >= 0 ? Palette.success : Palette.error }]}>
            {signed(c.contribution_pct, '%')}
          </Text>
        </View>
      ))}
      <ChipRow>
        {Object.entries(a.sectors).map(([name, w]) => (
          <Chip key={name} label={`${name} ${(w * 100).toFixed(0)}%`} tone="info" size="sm" />
        ))}
      </ChipRow>
    </LabelledSection>
  );
}

const styles = StyleSheet.create({
  bigIdea: { color: Palette.text, fontSize: 18, lineHeight: 27, fontWeight: '600' },
  bold: { fontWeight: '800', color: Palette.text },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  item: { gap: 2, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: Palette.border },
  itemTitle: { color: Palette.text, fontSize: 15, fontWeight: '700' },
  itemBody: { color: Palette.muted, fontSize: 13, lineHeight: 18, flex: 1 },
  stratTitle: { color: Palette.primary, fontSize: 16, fontWeight: '800' },
  kv: { gap: 2 },
  k: { color: Palette.secondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  pnl: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  contribRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  sym: { color: Palette.primary, fontWeight: '800', fontSize: 15, width: 52 },
  contrib: { fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] },
});
