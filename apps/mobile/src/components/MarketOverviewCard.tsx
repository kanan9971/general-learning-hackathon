import { StyleSheet, Text, View } from 'react-native';

import type { OverviewResponse } from '@/api/client';
import { StepsDiagram } from '@/components/Diagrams';
import { Chip } from '@/components/Chip';
import { Evidence } from '@/components/Evidence';
import { LabelledSection } from '@/components/LabelledSection';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

/** The AI cross-market overview. Every key point shows the evidence it rests on. */
export type OverviewView = 'story' | 'evidence' | 'desks';

export function MarketOverviewCard({
  data,
  sectionTitles,
  view = 'story',
}: {
  data: OverviewResponse;
  sectionTitles: Record<string, string>;
  view?: OverviewView;
}) {
  const o = data.overview;
  const moves = new Map(data.moves.map((m) => [m.fact_id, m]));
  const headlines = new Map(data.headlines.map((h) => [h.id, h]));

  return (
    <>
      {view === 'story' ? (
        <>
      <LabelledSection kind="interpretation" title={o.headline}>
        <ThemedText>{o.summary}</ThemedText>
        <View style={styles.confRow}>
          <Chip label={`${o.confidence} confidence`} tone="accent" size="sm" />
          <ThemedText type="caption" themeColor="textSecondary" style={{ flex: 1 }}>
            {o.confidence_reason}
          </ThemedText>
        </View>
        {data.generated_by === 'fallback' ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Template overview: the AI explainer was unavailable, so this lists the facts only.
          </ThemedText>
        ) : null}
      </LabelledSection>

      <ThemedText type="sectionTitle">How today connects</ThemedText>
      <StepsDiagram steps={o.connections.map((c) => ({ from: c.from_, to: c.to, why: c.why }))} />
        </>
      ) : null}

      {view === 'evidence' ? (
      <LabelledSection kind="interpretation" title="Key points & evidence">
        {o.key_points.map((p, i) => (
          <View key={i} style={[styles.point, i > 0 && styles.divider]}>
            <View style={styles.pointHead}>
              <Chip label={sectionTitles[p.section_id] ?? p.section_id} tone="info" size="sm" />
              {!p.supported ? <Chip label="unsupported" tone="error" size="sm" /> : null}
            </View>
            <Text style={styles.pointTitle}>{p.point}</Text>
            <ThemedText type="small">{p.explanation}</ThemedText>
            <Evidence
              factIds={p.evidence.fact_ids}
              headlineIds={p.evidence.headline_ids}
              moves={moves}
              headlines={headlines}
            />
          </View>
        ))}
      </LabelledSection>

      ) : null}

      {view === 'desks' ? (
        <>
      <LabelledSection kind="interpretation" title="How desks might think about it">
        {o.desk_views.map((v, i) => (
          <View key={i} style={[styles.point, i > 0 && styles.divider]}>
            <Text style={styles.desk}>{v.desk}</Text>
            <Text style={styles.pointTitle}>{v.strategy}</Text>
            <ThemedText type="small">{v.rationale}</ThemedText>
            <ThemedText type="small" style={{ color: Palette.error }}>
              Wrong if: {v.risk}
            </ThemedText>
            {v.fact_ids.length ? (
              <Evidence factIds={v.fact_ids} headlineIds={[]} moves={moves} headlines={headlines} />
            ) : null}
          </View>
        ))}
      </LabelledSection>

      {o.watch_next.length ? (
        <LabelledSection kind="interpretation" title="Watch next">
          {o.watch_next.map((w) => (
            <ThemedText key={w} type="small">
              • {w}
            </ThemedText>
          ))}
        </LabelledSection>
      ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  point: { gap: 6, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: Palette.border },
  pointHead: { flexDirection: 'row', gap: 6 },
  pointTitle: { color: Palette.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  desk: { color: Palette.secondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
