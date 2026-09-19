import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  explainMarketSection,
  type ExplainSectionResponse,
  type Level,
  type MarketSection,
  type MarketSectionId,
  type Move,
} from '@/api/client';
import { Accordion } from '@/components/Accordion';
import { Card } from '@/components/Card';
import { StepsDiagram } from '@/components/Diagrams';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { Evidence } from '@/components/Evidence';
import { HeadlineItem } from '@/components/HeadlineItem';
import { HubTile, TileGrid } from '@/components/HubTile';
import { LabelledSection } from '@/components/LabelledSection';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RuleCard } from '@/components/RuleCard';
import { Screen } from '@/components/Screen';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { asOfLabel, signed } from '@/lib/format';
import { useMarketsFeed } from '@/lib/useMarketsFeed';
import { conceptLabel, getPlan } from '@/lib/learner';

type Tab = 'learn' | 'today' | 'test' | 'desk';

export default function MarketSectionScreen() {
  const { section: sectionId } = useLocalSearchParams<{ section: MarketSectionId }>();
  const router = useRouter();
  const { feed, interests, error } = useMarketsFeed();
  const [level, setLevel] = useState<Level>('beginner');
  const [tab, setTab] = useState<Tab>('learn');
  const [note, setNote] = useState<ExplainSectionResponse | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    getPlan().then((p) => setLevel(p?.level ?? 'beginner'));
  }, []);

  const section = feed?.sections.find((s) => s.id === sectionId);
  const watch = interests?.watch ?? [];

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
  const tabs: { id: Tab; label: string }[] = hasData
    ? [
        { id: 'learn', label: 'Learn' },
        { id: 'today', label: 'Today' },
        { id: 'test', label: 'Test' },
        { id: 'desk', label: 'Desk' },
      ]
    : [
        { id: 'learn', label: 'Learn' },
        { id: 'test', label: 'Test' },
        { id: 'desk', label: 'Desk' },
      ];
  const lab = (kinds?: string) => router.push({ pathname: '/lab', params: kinds ? { section: g.id, kinds } : { section: g.id } });

  return (
    <Screen
      title={g.title}
      subtitle={g.tagline}
      safeEdges={['bottom']}
      resetKey={tab}
      footer={
        tab === 'test' ? undefined : (
          <>
            <PrimaryButton label="Test my understanding" onPress={() => setTab('test')} />
            <Disclaimer />
          </>
        )
      }
    >
      <Stack.Screen options={{ title: g.title }} />
      <SegmentedTabs<Tab> tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'learn' ? (
        <>
          <LabelledSection kind="teaching" title="The big idea">
            <Text style={styles.bigIdea}>{g.mental_model}</Text>
            <ThemedText type="caption" themeColor="textSecondary">
              Who works on this: {g.desk}
            </ThemedText>
          </LabelledSection>
          <Accordion
            defaultOpen="how"
            items={[
              {
                id: 'how',
                title: 'How it works',
                meta: 'the mechanics in plain language',
                children: (
                  <>
                    {g.how_it_works.map((p, i) => (
                      <ThemedText key={i} type="small">
                        {p}
                      </ThemedText>
                    ))}
                  </>
                ),
              },
              {
                id: 'rules',
                title: 'Rules of thumb',
                meta: `${g.rules.length} if → then rules, and when they fail`,
                children: (
                  <>
                    {g.rules.map((r) => (
                      <RuleCard key={r.when} rule={r} />
                    ))}
                  </>
                ),
              },
              {
                id: 'drivers',
                title: 'What moves it',
                meta: `${g.key_drivers.length} drivers`,
                children: (
                  <>
                    {g.key_drivers.map((d) => (
                      <View key={d.name} style={styles.item}>
                        <Text style={styles.itemTitle}>{d.name}</Text>
                        <Text style={styles.itemBody}>{d.why}</Text>
                      </View>
                    ))}
                  </>
                ),
              },
              {
                id: 'chain',
                title: 'The chain reaction',
                meta: 'a diagram: cause → effect, in order',
                children: <StepsDiagram steps={g.transmission.map((s) => ({ from: s.from_, to: s.to, why: s.why }))} />,
              },
            ]}
          />
        </>
      ) : null}

      {tab === 'today' ? (
        <>
          <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} />
          <Accordion
            defaultOpen="numbers"
            items={[
              {
                id: 'numbers',
                title: "Today's numbers",
                meta: section.moves.length ? `${section.moves.length} instruments · 1-day and 5-day change` : 'no prices right now',
                children: (
                  <>
                    {section.id === 'portfolio' ? <PortfolioBlock section={section} source={feed.portfolio_source} /> : null}
                    {section.moves.length ? (
                      section.moves.map((m, i) => <MoveRow key={m.fact_id} move={m} showFiveDay divider={i > 0} />)
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary">
                        {section.note ?? 'No prices available.'}
                      </ThemedText>
                    )}
                  </>
                ),
              },
              {
                id: 'note',
                title: 'Why did it move? (AI desk note)',
                meta: 'with the data and headlines it relies on',
                children: note ? (
                  <DeskNote note={note} />
                ) : (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      Read the numbers first and form your own view; then compare with the AI explanation.
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
                  </>
                ),
              },
              {
                id: 'news',
                title: 'Headlines',
                meta: 'Fed · WSJ · Yahoo Finance',
                children: section.headlines.length ? (
                  <Card style={{ paddingVertical: 4, gap: 0 }}>
                    {section.headlines.map((h, i) => (
                      <HeadlineItem key={h.id} item={h} divider={i > 0} />
                    ))}
                  </Card>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No recent headlines for this section.
                  </ThemedText>
                ),
              },
            ]}
          />
        </>
      ) : null}

      {tab === 'test' ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Pick how you want to be tested. Each is built from {hasData ? "today's real data" : 'this topic'}, and your
            answers update your Learn progress.
          </ThemedText>
          <TileGrid>
            <HubTile
              tone="error"
              icon="shuffle-outline"
              title="What-if scenarios"
              subtitle="Change one thing, predict the ripple"
              onPress={() => lab('scenario')}
            />
            {hasData ? (
              <HubTile
                tone="success"
                icon="trending-up-outline"
                title="Predict the move"
                subtitle="Call it before you see it"
                onPress={() => lab('predict')}
              />
            ) : null}
            <HubTile
              tone="info"
              icon="flask-outline"
              title="Mixed set"
              subtitle="A bit of everything"
              onPress={() => lab()}
            />
            <HubTile
              tone="teal"
              icon="chatbubble-ellipses-outline"
              title="Explain it"
              subtitle="Write it in your own words"
              onPress={() => lab('explain')}
            />
            <HubTile
              wide
              tone="accent"
              icon="help-circle-outline"
              title="Concept quiz"
              subtitle="Adaptive questions on the ideas in this topic"
              onPress={() =>
                router.push({
                  pathname: '/quiz',
                  params: { formats: 'mcq,case_study', concepts: g.concept_ids.join(','), customs: '', level },
                })
              }
            />
          </TileGrid>
          <Disclaimer />
        </>
      ) : null}

      {tab === 'desk' ? (
        <Accordion
          defaultOpen="strategies"
          items={[
            {
              id: 'strategies',
              title: 'How desks trade it',
              meta: 'educational archetypes, not advice',
              children: (
                <>
                  {g.strategies.map((st) => (
                    <Card key={st.name}>
                      <Text style={styles.stratTitle}>{st.name}</Text>
                      <ThemedText type="small">{st.idea}</ThemedText>
                      <View style={styles.kv}>
                        <Text style={styles.k}>How it&apos;s expressed</Text>
                        <Text style={styles.itemBody}>{st.how_expressed}</Text>
                      </View>
                      <View style={styles.kv}>
                        <Text style={[styles.k, { color: Palette.error }]}>What breaks it</Text>
                        <Text style={styles.itemBody}>{st.what_breaks_it}</Text>
                      </View>
                      <ChipRow>
                        {st.concept_ids.map((c) => (
                          <Chip key={c} label={conceptLabel(c)} tone="accent" size="sm" />
                        ))}
                      </ChipRow>
                    </Card>
                  ))}
                </>
              ),
            },
            {
              id: 'mistakes',
              title: 'Classic beginner mistakes',
              meta: `${g.mistakes.length} to avoid`,
              children: (
                <>
                  {g.mistakes.map((m) => (
                    <ThemedText key={m} type="small">
                      • {m}
                    </ThemedText>
                  ))}
                </>
              ),
            },
            {
              id: 'interview',
              title: 'Interview questions',
              meta: 'practise answering out loud',
              children: (
                <>
                  {g.interview.map((m) => (
                    <ThemedText key={m} type="small">
                      • {m}
                    </ThemedText>
                  ))}
                  <PrimaryButton label="Practise in the Lab" variant="secondary" onPress={() => lab('explain')} />
                </>
              ),
            },
            {
              id: 'watch',
              title: 'What to watch',
              children: (
                <>
                  {g.watch.map((w) => (
                    <ThemedText key={w} type="small">
                      • {w}
                    </ThemedText>
                  ))}
                </>
              ),
            },
            ...(Object.keys(g.glossary).length
              ? [
                  {
                    id: 'gloss',
                    title: 'Jargon buster',
                    meta: `${Object.keys(g.glossary).length} terms`,
                    children: (
                      <>
                        {Object.entries(g.glossary).map(([term, def]) => (
                          <View key={term} style={styles.item}>
                            <Text style={styles.itemTitle}>{term}</Text>
                            <Text style={styles.itemBody}>{def}</Text>
                          </View>
                        ))}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
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
