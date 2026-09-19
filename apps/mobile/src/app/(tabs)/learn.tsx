import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { CycleStatus, Roadmap } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { HeroCard } from '@/components/HeroCard';
import { Reveal } from '@/components/Motion';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileButton } from '@/components/ProfileButton';
import { ProgressBar } from '@/components/ProgressBar';
import { RoadmapTree } from '@/components/Roadmap';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Elevation, Fonts, OnDark, Palette, Radius } from '@/constants/theme';
import { localToday, useCycle } from '@/lib/daily';
import { openNode, testOut, useRoadmap } from '@/lib/useRoadmap';
import { restartDailyCycle } from '@/api/client';

/**
 * Calendar day looks. Hits are solid, misses are a soft tint (a missed day is information, not an
 * alarm), today is an outlined ring, rest/future days recede.
 */
const DAY_LOOK: Record<string, { bg: string; fg: string; border: string }> = {
  met: { bg: Palette.success, fg: Palette.white, border: Palette.success },
  partial: { bg: Palette.warning, fg: Palette.white, border: Palette.warning },
  missed: { bg: Palette.softError, fg: Palette.error, border: Palette.softError },
  today: { bg: Palette.surface, fg: Palette.primary, border: Palette.primary },
  rest: { bg: Palette.surfaceSunken, fg: Palette.subtle, border: Palette.surfaceSunken },
  future: { bg: Palette.surface, fg: Palette.subtle, border: Palette.border },
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
      <HeroCard tone={cycle.complete ? 'success' : 'primary'}>
        <View style={styles.between}>
          <ThemedText type="kicker" style={{ color: OnDark.muted }}>
            {cycle.complete ? 'Cycle complete' : `Day ${cycle.day_number} of ${cycle.total_days}`}
          </ThemedText>
          <Chip label={verdictText} tone={verdictTone} size="sm" />
        </View>
        <Text style={styles.phase}>
          Week {cycle.phase_index + 1}: {cycle.phase_title}
        </Text>
        <ProgressBar percent={pct} color={OnDark.accent} trackColor={OnDark.track} />
        <View style={styles.between}>
          <ThemedText type="caption" style={{ color: OnDark.muted }}>
            {cycle.completed_days} goal days done · {cycle.week_minutes} min this week
          </ThemedText>
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={14} color={cycle.streak ? OnDark.accent : OnDark.faint} />
            <Text style={styles.streak}>
              {cycle.streak} · best {cycle.best_streak}
            </Text>
          </View>
        </View>
        {cycle.complete ? <PrimaryButton variant="inverted" icon="arrow-forward" label="Start the next cycle" onPress={onRestart} /> : null}
      </HeroCard>

      <SectionHeader title="Last 14 days" meta="a green day = goal hit" first />
      <View style={styles.calendar}>
        {cycle.calendar.map((d, i) => {
          const look = DAY_LOOK[d.status] ?? DAY_LOOK.future;
          return (
            <Reveal key={d.date} index={i} style={styles.day}>
              <View style={[styles.dayDot, { backgroundColor: look.bg, borderColor: look.border }, d.status === 'today' && styles.dayToday]}>
                <Text style={[styles.dayNum, { color: look.fg }]}>{d.date.slice(-2)}</Text>
              </View>
              <Text style={[styles.dayLabel, d.status === 'today' && { color: Palette.primary }]}>{d.weekday.slice(0, 1)}</Text>
            </Reveal>
          );
        })}
      </View>

      <SectionHeader title="Your 8-week path" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={140} decelerationRate="fast" contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
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
            <ProgressBar
              percent={(p.days_done / Math.max(p.days_total, 1)) * 100}
              color={p.state === 'done' ? Palette.success : Palette.primary}
              height={5}
            />
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
  phase: {
    color: OnDark.fg,
    fontFamily: Fonts.displaySemi,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streak: { color: OnDark.fg, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 3, width: '12.5%' },
  dayDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 2, ...Elevation.card },
  dayNum: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayLabel: { color: Palette.muted, fontSize: 10, fontWeight: '700' },
  phaseCard: {
    width: 132,
    padding: 12,
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
    ...Elevation.card,
  },
  phaseWeek: {
    fontFamily: Fonts.mono,
    color: Palette.muted,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  phaseTitle: { color: Palette.text, fontSize: 13, fontWeight: '700', lineHeight: 17, minHeight: 34, letterSpacing: -0.2 },
  phaseMeta: { color: Palette.muted, fontSize: 10.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
