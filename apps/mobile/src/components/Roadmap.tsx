import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Roadmap as RoadmapData, RoadmapNode, RoadmapNodeState } from '@/api/client';
import { Palette, Radius } from '@/constants/theme';

const COLS = 3; // widest tier has three nodes; every cell is 1/3 of the width so connector math is exact
const LINE = '#B7C3D2';

const STYLE: Record<RoadmapNodeState, { bg: string; border: string; bar: string; label: string }> = {
  not_started: { bg: Palette.surface, border: Palette.border, bar: Palette.border, label: 'Not started' },
  in_progress: { bg: Palette.softInfo, border: Palette.primary, bar: Palette.primary, label: 'In progress' },
  priority: { bg: Palette.softAccent, border: Palette.warning, bar: Palette.warning, label: 'Weak spot' },
  mastered: { bg: Palette.softSuccess, border: Palette.success, bar: Palette.success, label: 'Mastered' },
};

/** Horizontal centre of node k in a row of n, as a fraction of the full width. */
const cx = (k: number, n: number) => 0.5 + (k - (n - 1) / 2) / COLS;

function Connectors({ from, to, lit }: { from: RoadmapNode[]; to: RoadmapNode[]; lit: Set<string> }) {
  const segs: { key: string; style: object }[] = [];
  to.forEach((child, ci) => {
    child.requires.forEach((pid) => {
      const pi = from.findIndex((p) => p.id === pid);
      if (pi < 0) return; // only draws links between neighbouring rows; longer ones are shown as hints
      const xa = cx(pi, from.length);
      const xb = cx(ci, to.length);
      const color = lit.has(pid) ? Palette.success : LINE;
      const k = `${pid}>${child.id}`;
      segs.push({ key: `${k}a`, style: { left: `${xa * 100}%`, top: 0, height: 15, width: 2, marginLeft: -1, backgroundColor: color } });
      if (Math.abs(xa - xb) > 0.001) {
        segs.push({
          key: `${k}b`,
          style: { left: `${Math.min(xa, xb) * 100}%`, width: `${Math.abs(xa - xb) * 100}%`, top: 14, height: 2, backgroundColor: color },
        });
      }
      segs.push({ key: `${k}c`, style: { left: `${xb * 100}%`, top: 15, height: 15, width: 2, marginLeft: -1, backgroundColor: color } });
    });
  });
  return (
    <View style={styles.connectors}>
      {segs.map((s) => (
        <View key={s.key} style={[styles.seg, s.style]} />
      ))}
    </View>
  );
}

function Node({
  node,
  onOpen,
  onTestOut,
}: {
  node: RoadmapNode;
  onOpen: (n: RoadmapNode) => void;
  onTestOut: (n: RoadmapNode) => void;
}) {
  const st = STYLE[node.state];
  const pct = Math.round(node.progress * 100);
  return (
    <View style={styles.cell}>
      {node.recommended ? (
        <View style={styles.here}>
          <Text style={styles.hereText}>YOU ARE HERE</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${node.title}. ${st.label}, ${pct} percent.`}
        onPress={() => onOpen(node)}
        style={({ pressed }) => [
          styles.node,
          node.collapsed && styles.nodeCollapsed,
          { backgroundColor: st.bg, borderColor: node.recommended ? Palette.primary : st.border },
          node.recommended && styles.nodeHere,
          pressed && { opacity: 0.75 },
        ]}
      >
        <Text style={styles.title} numberOfLines={2}>
          {node.state === 'mastered' ? '✓ ' : ''}
          {node.title}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(node.state === 'not_started' ? 0 : 6, pct)}%`, backgroundColor: st.bar }]} />
        </View>
        {!node.collapsed ? (
          <Text style={[styles.meta, node.state === 'priority' && { color: Palette.warning }]} numberOfLines={1}>
            {node.state === 'not_started' ? st.label : `${st.label} · ${pct}%`}
          </Text>
        ) : (
          <Text style={styles.meta}>Known · tap to review</Text>
        )}
      </Pressable>
      {node.test_out ? (
        <Pressable onPress={() => onTestOut(node)} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.testOut}>Test out ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The personalised roadmap: a prerequisite tree, top to bottom. Nodes fill as your mastery grows, weak
 * spots are outlined in orange, what you already know is collapsed, and "you are here" marks the next step.
 */
export function RoadmapTree({
  roadmap,
  onOpen,
  onTestOut,
}: {
  roadmap: RoadmapData;
  onOpen: (n: RoadmapNode) => void;
  onTestOut: (n: RoadmapNode) => void;
}) {
  const tiers = Array.from(new Set(roadmap.nodes.map((n) => n.tier))).sort((a, b) => a - b);
  const rows = tiers.map((t) => roadmap.nodes.filter((n) => n.tier === t).sort((a, b) => a.order - b.order));
  const lit = new Set(roadmap.nodes.filter((n) => n.state === 'mastered').map((n) => n.id));

  return (
    <View>
      {rows.map((row, ri) => (
        <View key={ri}>
          {ri > 0 ? <Connectors from={rows[ri - 1]} to={row} lit={lit} /> : null}
          <View style={[styles.row, { width: `${(row.length / COLS) * 100}%` }]}>
            {row.map((n) => (
              <Node key={n.id} node={n} onOpen={onOpen} onTestOut={onTestOut} />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.legend}>
        {(['mastered', 'in_progress', 'priority', 'not_started'] as RoadmapNodeState[]).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: STYLE[s].bar }]} />
            <Text style={styles.legendText}>{STYLE[s].label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'center' },
  cell: { flex: 1, paddingHorizontal: 4, alignItems: 'stretch', gap: 4 },
  node: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 6,
    minHeight: 84,
    justifyContent: 'space-between',
  },
  nodeCollapsed: { minHeight: 64, opacity: 0.85 },
  nodeHere: { borderWidth: 3 },
  title: { color: Palette.text, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  track: { height: 6, borderRadius: 3, backgroundColor: Palette.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  meta: { color: Palette.muted, fontSize: 10.5, fontWeight: '600' },
  here: { alignSelf: 'center', backgroundColor: Palette.primary, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  hereText: { color: Palette.white, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  testOut: { color: Palette.primary, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  connectors: { height: 30, width: '100%' },
  seg: { position: 'absolute' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 6, borderRadius: 3 },
  legendText: { color: Palette.muted, fontSize: 11, fontWeight: '600' },
});
