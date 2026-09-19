/**
 * Diagram primitives built from plain Views (no SVG dependency, so they render identically in
 * Expo Go and on web). They visualise cause -> effect: FlowDiagram (a chain), LinkDiagram (one
 * link), ImpactDiagram (a shock fanning out to effects) and MarketMap (see MarketMap.tsx).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Palette, Radius } from '@/constants/theme';

export type NodeTone = 'neutral' | 'up' | 'down' | 'shock' | 'goal' | 'unknown';

export const TONE: Record<NodeTone, { bg: string; border: string; fg: string }> = {
  neutral: { bg: Palette.surface, border: Palette.border, fg: Palette.text },
  up: { bg: Palette.softSuccess, border: Palette.success, fg: Palette.success },
  down: { bg: Palette.softError, border: Palette.error, fg: Palette.error },
  shock: { bg: Palette.softAccent, border: Palette.warning, fg: Palette.warning },
  goal: { bg: Palette.softInfo, border: Palette.primary, fg: Palette.primary },
  unknown: { bg: Palette.pageBackground, border: Palette.border, fg: Palette.muted },
};

export type FlowNode = { label: string; sub?: string; badge?: string; tone?: NodeTone };

export function Node({ node, compact }: { node: FlowNode; compact?: boolean }) {
  const t = TONE[node.tone ?? 'neutral'];
  return (
    <View style={[styles.node, compact && styles.nodeCompact, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.nodeLabel, compact && { fontSize: 13 }]}>{node.label}</Text>
      {node.badge ? <Text style={[styles.badge, { color: t.fg }]}>{node.badge}</Text> : null}
      {node.sub ? <Text style={styles.sub}>{node.sub}</Text> : null}
    </View>
  );
}

export function Arrow({ caption, tone = 'neutral' }: { caption?: string; tone?: NodeTone }) {
  const c = TONE[tone].border === Palette.border ? Palette.muted : TONE[tone].border;
  return (
    <View style={styles.arrowRow}>
      <View style={styles.arrowCol}>
        <View style={[styles.stem, { backgroundColor: c }]} />
        <Text style={[styles.head, { color: c }]}>▼</Text>
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

/** A chain: node, arrow (with the reason), node, ... Top to bottom in the order things happen. */
export function FlowDiagram({ nodes, edges }: { nodes: FlowNode[]; edges?: string[] }) {
  return (
    <Card>
      {nodes.map((n, i) => (
        <View key={i}>
          <Node node={n} />
          {i < nodes.length - 1 ? <Arrow caption={edges?.[i]} /> : null}
        </View>
      ))}
    </Card>
  );
}

/** Steps as a chain: step[i].from -> step[i].to -> step[i+1].to ..., with each `why` on the arrow. */
export function StepsDiagram({ steps }: { steps: { from: string; to: string; why: string }[] }) {
  if (!steps.length) return null;
  const nodes: FlowNode[] = [{ label: steps[0].from, tone: 'shock' }];
  steps.forEach((s, i) => nodes.push({ label: s.to, tone: i === steps.length - 1 ? 'goal' : 'neutral' }));
  return <FlowDiagram nodes={nodes} edges={steps.map((s) => s.why)} />;
}

/** One cause -> effect link. `to` may be a "?" node while the learner is still predicting. */
export function LinkDiagram({ from, to, caption }: { from: FlowNode; to: FlowNode; caption?: string }) {
  return (
    <View style={styles.linkWrap}>
      <View style={styles.linkRow}>
        <View style={{ flex: 1 }}>
          <Node node={from} compact />
        </View>
        <Text style={styles.linkArrow}>→</Text>
        <View style={{ flex: 1 }}>
          <Node node={to} compact />
        </View>
      </View>
      {caption ? <Text style={styles.linkCaption}>{caption}</Text> : null}
    </View>
  );
}

export type ImpactEffect = {
  label: string;
  dir: 'up' | 'down' | 'flat';
  pick?: string | null; // what the learner chose
  correct?: boolean;
  why?: string;
  badge?: string;
};

const ARROW = { up: '↑', down: '↓', flat: '→' } as const;
const WORD = { up: 'Rise', down: 'Fall', flat: 'Little change' } as const;

/** A shock at the top fanning out to the assets it moves. Shows the learner's pick vs the answer. */
export function ImpactDiagram({ shock, effects }: { shock: string; effects: ImpactEffect[] }) {
  return (
    <Card>
      <Node node={{ label: shock, tone: 'shock', sub: 'the change' }} />
      <View style={styles.trunkWrap}>
        <View style={styles.trunk} />
        <Text style={styles.trunkHead}>▼</Text>
      </View>
      <View style={styles.fan}>
        {effects.map((e, i) => {
          const tone: NodeTone = e.dir === 'up' ? 'up' : e.dir === 'down' ? 'down' : 'unknown';
          const t = TONE[tone];
          return (
            <View key={i} style={[styles.effect, { backgroundColor: t.bg, borderColor: t.border }]}>
              <Text style={[styles.effectArrow, { color: t.fg }]}>{ARROW[e.dir]}</Text>
              <Text style={styles.effectLabel}>{e.label}</Text>
              <Text style={[styles.effectWord, { color: t.fg }]}>{WORD[e.dir]}</Text>
              {e.pick != null ? (
                <Text style={[styles.pick, { color: e.correct ? Palette.success : Palette.error }]}>
                  {e.correct ? '✓ You said ' : '✕ You said '}
                  {WORD[(e.pick as 'up' | 'down' | 'flat')] ?? e.pick}
                </Text>
              ) : null}
              {e.badge ? <Text style={styles.effectBadge}>{e.badge}</Text> : null}
              {e.why ? <Text style={styles.effectWhy}>{e.why}</Text> : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  node: { borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  nodeCompact: { paddingVertical: 8, paddingHorizontal: 10, minHeight: 64, justifyContent: 'center' },
  nodeLabel: { color: Palette.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  badge: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { color: Palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14 },
  arrowCol: { alignItems: 'center', width: 20 },
  stem: { width: 2, height: 12 },
  head: { fontSize: 12, lineHeight: 12, marginTop: -2 },
  caption: { flex: 1, color: Palette.muted, fontSize: 12, lineHeight: 17, fontStyle: 'italic', paddingVertical: 4 },
  linkWrap: { gap: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkArrow: { fontSize: 22, color: Palette.muted, fontWeight: '700' },
  linkCaption: { color: Palette.muted, fontSize: 12, textAlign: 'center' },
  trunkWrap: { alignItems: 'center', height: 26 },
  trunk: { width: 2, height: 14, backgroundColor: Palette.muted },
  trunkHead: { color: Palette.muted, fontSize: 12, lineHeight: 12, marginTop: -2 },
  fan: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  effect: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: 10,
    gap: 3,
  },
  effectArrow: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  effectLabel: { color: Palette.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  effectWord: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  pick: { fontSize: 12, fontWeight: '700' },
  effectBadge: { color: Palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  effectWhy: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
});
