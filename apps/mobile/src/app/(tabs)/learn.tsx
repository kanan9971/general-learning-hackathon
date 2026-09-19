import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { CycleStatus, Roadmap } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileButton } from '@/components/ProfileButton';
import { RoadmapTree } from '@/components/Roadmap';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { localToday, useCycle } from '@/lib/daily';
import { openNode, testOut, useRoadmap } from '@/lib/useRoadmap';
import { restartDailyCycle } from '@/api/client';

const DAY_COLOR: Record<string, string> = {
  met: Palette.success,
  partial: Palette.warning,
  missed: Palette.error,
  today: Palette.primary,
  rest: Palette.border,
  future: Palette.border,
};

/**
 * Learn: your long cycle. The roadmap is built from what you do every day: this page shows whether you are
 * hitting the daily goals (streak, calendar, phases) and which topics they are moving.
 */
export default function LearnRoadmap() {
  const router = useRouter();
  const { roadmap, error, loading, reload } = useRoadmap();
  const { cycle, reload: reloadCycle } = useCycle();

  // "You are here" follows today's focus topic, not just the weakest one.
  const shown: Roadmap | null = roadmap
    ? { ...roadmap, nodes: roadmap.nodes.map((n) => ({ ...n, recommended: cycle ? n.id === cycle.focus_node_id : n.recommended })) }
    : null;

  const restart = async () => {
    await restartDailyCycle(roadmap?.level, localToday()).catch(() => null);
    void reloadCycle();
  };

  return (
    <Screen title="Learn" subtitle="Your cycle and roadmap" right={<ProfileButton />} footer={<Disclaimer />}>
      {loading && !roadmap ? <ActivityIndicator color={Palette.primary} /> : null}
      {error && !roadmap ? (
        <Card tone="error">
          <ThemedText type="smallBold">Couldn&apos;t load your roadmap</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}. Is the backend running?
          </ThemedText>
          <PrimaryButton label="Try again" variant="secondary" onPress={() => void reload()} />
        </Card>
      ) : null}

      {cycle ? <CycleCard cycle={cycle} onRestart={() => void restart()} /> : null}

      {roadmap ? (
        <>
          {roadmap.needs_placement ? (
            <Card tone="accent">
              <ThemedText type="kicker" style={{ color: Palette.warning }}>
                Personalise it
              </ThemedText>
              <ThemedText type="smallBold">Take the 5-minute placement quiz</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {roadmap.rationale}
              </ThemedText>
              <PrimaryButton label="Start placement" onPress={() => router.push('/placement')} />
            </Card>
          ) : (
            <Card tone="info">
              <ThemedText type="kicker" style={{ color: Palette.primary }}>
                Why your cycle looks like this
              </ThemedText>
              <ThemedText type="small">{roadmap.rationale}</ThemedText>
            </Card>
          )}

          <SectionHeader title="Topics in your cycle" meta="each daily session moves these" />
          {shown ? <RoadmapTree roadmap={shown} onOpen={(n) => openNode(router, n)} onTestOut={(n) => testOut(router, n)} /> : null}
          {!roadmap.needs_placement ? (
            <PrimaryButton label="Retake placement" variant="ghost" onPress={() => router.push('/placement')} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function CycleCard({ cycle, onRestart }: { cycle: CycleStatus; onRestart: () => void }) {
  const pct = Math.round((cycle.completed_days / Math.max(cycle.total_days, 1)) * 100);
  const verdictTone = cycle.verdict === 'on_track' ? 'success' : cycle.verdict === 'slipping' ? 'accent' : 'error';
  const verdictText = cycle.verdict === 'on_track' ? 'On track' : cycle.verdict === 'slipping' ? `${cycle.behind_by} days behind` : `${cycle.behind_by} days behind`;
  return (
    <>
      <Card tone={cycle.complete ? 'success' : 'info'}>
        <View style={styles.between}>
          <ThemedText type="kicker" style={{ color: Palette.primary }}>
            {cycle.complete ? 'Cycle complete' : `Day ${cycle.day_number} of ${cycle.total_days}`}
          </ThemedText>
          <Chip label={verdictText} tone={verdictTone} size="sm" />
        </View>
        <Text style={styles.phase}>
          Week {cycle.phase_index + 1}: {cycle.phase_title}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]} />
        </View>
        <View style={styles.between}>
          <ThemedText type="caption" themeColor="textSecondary">
            {cycle.completed_days} goal days done · {cycle.week_minutes} min this week
          </ThemedText>
          <Text style={styles.streak}>
            🔥 {cycle.streak} · best {cycle.best_streak}
          </Text>
        </View>
        {cycle.complete ? <PrimaryButton label="Start the next cycle" onPress={onRestart} /> : null}
      </Card>

      <SectionHeader title="Last 14 days" meta="a green day = goal hit" first />
      <View style={styles.calendar}>
        {cycle.calendar.map((d) => (
          <View key={d.date} style={styles.day}>
            <View style={[styles.dayDot, { backgroundColor: DAY_COLOR[d.status], opacity: d.status === 'rest' || d.status === 'future' ? 0.5 : 1 }]}>
              <Text style={styles.dayNum}>{d.date.slice(-2)}</Text>
            </View>
            <Text style={styles.dayLabel}>{d.weekday.slice(0, 1)}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Your 8-week path" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {cycle.phases.map((p) => (
          <View
            key={p.index}
            style={[
              styles.phaseCard,
              p.state === 'current' && { borderColor: Palette.primary, borderWidth: 2, backgroundColor: Palette.softInfo },
              p.state === 'done' && { borderColor: Palette.success, backgroundColor: Palette.softSuccess },
            ]}
          >
            <Text style={styles.phaseWeek}>
              {p.state === 'done' ? '✓ ' : ''}Week {p.index + 1}
            </Text>
            <Text style={styles.phaseTitle} numberOfLines={2}>
              {p.title}
            </Text>
            <View style={styles.miniTrack}>
              <View style={[styles.miniFill, { width: `${(p.days_done / p.days_total) * 100}%`, backgroundColor: p.state === 'done' ? Palette.success : Palette.primary }]} />
            </View>
            <Text style={styles.phaseMeta}>
              {p.days_done}/{p.days_total} days
            </Text>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  phase: { color: Palette.text, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  track: { height: 8, borderRadius: Radius.sm, backgroundColor: Palette.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: Radius.sm, backgroundColor: Palette.primary },
  streak: { color: Palette.text, fontSize: 13, fontWeight: '800' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 3, width: '12.5%' },
  dayDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayNum: { color: Palette.white, fontSize: 11, fontWeight: '800' },
  dayLabel: { color: Palette.muted, fontSize: 10, fontWeight: '700' },
  phaseCard: {
    width: 128,
    padding: 10,
    gap: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  phaseWeek: { color: Palette.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  phaseTitle: { color: Palette.text, fontSize: 13, fontWeight: '800', lineHeight: 17, minHeight: 34 },
  miniTrack: { height: 5, borderRadius: 3, backgroundColor: Palette.border, overflow: 'hidden' },
  miniFill: { height: 5, borderRadius: 3 },
  phaseMeta: { color: Palette.muted, fontSize: 10.5, fontWeight: '600' },
});
