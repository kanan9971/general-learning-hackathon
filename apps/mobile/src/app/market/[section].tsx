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
import { ChainList } from '@/components/ChainList';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Evidence } from '@/components/Evidence';
import { Disclaimer } from '@/components/Disclaimer';
import { HeadlineItem } from '@/components/HeadlineItem';
import { LabelledSection } from '@/components/LabelledSection';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
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
  const practice = () =>
    router.push({
      pathname: '/quiz',
      params: { formats: 'mcq,case_study', concepts: g.concept_ids.join(','), customs: '', level },
    });

  return (
    <Screen
      title={g.title}
      subtitle={g.tagline}
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton label="Practice this section" onPress={practice} />
          <Disclaimer />
        </>
      }
    >
      <Stack.Screen options={{ title: g.title }} />
      <DataModeBadge mode={feed.data_mode} asOf={asOfLabel(feed.as_of)} />

      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.primary }}>
          Who trades this
        </ThemedText>
        <ThemedText type="small">{g.desk}</ThemedText>
      </Card>

      {section.id === 'portfolio' ? <PortfolioBlock section={section} source={feed.portfolio_source} /> : null}

      <SectionHeader title="Today's numbers" meta={section.moves.length ? '1-day change · 5-day' : undefined} />
      <LabelledSection kind="fact">
        {section.moves.length ? (
          section.moves.map((m, i) => <MoveRow key={m.fact_id} move={m} showFiveDay divider={i > 0} />)
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {section.note ?? 'No prices available.'}
          </ThemedText>
        )}
      </LabelledSection>

      <SectionHeader title="Today's desk note" meta="AI · on demand" />
      {note ? (
        <DeskNote note={note} />
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            An AI explanation of what moved in this section and why, how a trading desk might think about it,
            and what to watch next. It only references the numbers above; it never makes up its own.
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

      <SectionHeader title="How this market works" />
      <LabelledSection kind="teaching">
        {g.how_it_works.map((p, i) => (
          <ThemedText key={i} type="small">
            {p}
          </ThemedText>
        ))}
      </LabelledSection>

      <SectionHeader title="What moves it" />
      <Card>
        {g.key_drivers.map((d, i) => (
          <View key={d.name} style={[styles.item, i > 0 && styles.divider]}>
            <Text style={styles.itemTitle}>{d.name}</Text>
            <Text style={styles.itemBody}>{d.why}</Text>
          </View>
        ))}
      </Card>

      <SectionHeader title="The chain reaction" meta="typical cause → effect" />
      <ChainList steps={g.transmission.map((s) => ({ from: s.from_, to: s.to, why: s.why }))} />

      <SectionHeader title="How desks trade it" meta="educational archetypes" />
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
      <LabelledSection kind="interpretation" title="What happened">
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

      <ChainList steps={e.chain.map((s) => ({ from: s.from_, to: s.to, why: s.why }))} />

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
