import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { DailyTask } from '@/api/client';
import { Card } from '@/components/Card';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { HeroCard } from '@/components/HeroCard';
import { HubTile, TileGrid } from '@/components/HubTile';
import { LabelledSection } from '@/components/LabelledSection';
import { AnimatedPressable, Reveal } from '@/components/Motion';
import { MoveRow } from '@/components/MoveRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileButton } from '@/components/ProfileButton';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Elevation, Fonts, OnDark, Palette, Radius } from '@/constants/theme';
import { asOfLabel } from '@/lib/format';
import { useDaily } from '@/lib/daily';

/** Today: your 30-45 minute desk session. New every day, built from today's market and your roadmap. */
export default function TodayScreen() {
  const router = useRouter();
  const { today: t, error, loading, reload } = useDaily();
  const open = (task: DailyTask) => router.push({ pathname: '/daily/[task]', params: { task: task.id } });
  const next = t?.tasks.find((x) => x.status === 'todo');
  const donePct = t ? Math.round((t.minutes_done / Math.max(t.minutes_planned, 1)) * 100) : 0;
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Screen title="Today" subtitle={date} right={<ProfileButton />} footer={<Disclaimer />}>
      {loading && !t ? <ActivityIndicator color={Palette.primary} /> : null}
      {error && !t ? (
        <Card tone="error">
          <ThemedText type="smallBold">Couldn&apos;t build today&apos;s session</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}. Is the backend running?
          </ThemedText>
          <PrimaryButton label="Try again" variant="secondary" onPress={() => void reload()} />
        </Card>
      ) : null}

      {t ? (
        <>
          {/* The session */}
          <Reveal index={0}>
            <HeroCard tone={t.goal_met ? 'success' : 'primary'}>
              <View style={styles.between}>
                <ThemedText type="kicker" style={{ color: OnDark.muted }}>
                  {t.goal_met ? 'Day complete' : t.is_market_day ? "Today's session" : 'Weekend recap'}
                </ThemedText>
                <View style={styles.streak}>
                  <Ionicons name="flame" size={12} color={t.streak ? OnDark.accent : OnDark.faint} />
                  <ThemedText type="kicker" style={{ color: t.streak ? OnDark.accent : OnDark.muted }}>
                    {t.streak}-day streak
                  </ThemedText>
                </View>
              </View>
              <Text style={styles.theme}>{t.theme}</Text>
              <ThemedText type="kicker" style={{ color: OnDark.muted }}>
                Week {t.phase.index + 1} · {t.phase.title} · day {t.day_number} of {t.total_goal_days}
              </ThemedText>
              <ProgressBar percent={donePct} color={OnDark.accent} trackColor={OnDark.track} />
              <ThemedText type="caption" style={{ color: OnDark.muted }}>
                {t.minutes_done} of {t.minutes_planned} min ·{' '}
                {t.is_market_day ? 'goal: a passing analyst note and a practice set' : 'goal: the recap and the review'}
              </ThemedText>
              {t.verdict !== 'on_track' ? (
                <View style={styles.warn}>
                  <Text style={styles.warnText}>
                    {t.behind_by} goal days behind. Your cycle stretches to fit; nothing resets. Two sessions this week
                    gets you back.
                  </Text>
                </View>
              ) : null}
              {!t.goal_met && next ? (
                <PrimaryButton variant="inverted" icon="arrow-forward" label={`Start: ${next.title}`} onPress={() => open(next)} style={styles.heroCta} />
              ) : null}
            </HeroCard>
          </Reveal>

          {t.cycle_complete ? (
            <Card tone="accent">
              <ThemedText type="smallBold">You finished the whole cycle. Start the next one from Learn.</ThemedText>
            </Card>
          ) : null}

          {/* The blocks */}
          <SectionHeader title="The blocks" meta={`${t.tasks.filter((x) => x.status === 'done').length}/${t.tasks.length} done`} first />
          <View style={{ gap: 10 }}>
            {t.tasks.map((task, i) => {
              const done = task.status === 'done';
              const isNext = !t.goal_met && next?.id === task.id;
              return (
                <Reveal key={task.id} index={i}>
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel={`${task.title}, ${task.minutes} minutes, ${done ? 'done' : 'to do'}`}
                    onPress={() => open(task)}
                    haptic="selection"
                    lift={2}
                    pressScale={0.985}
                    style={({ pressed, hovered }) => [styles.block, done && styles.blockDone, isNext && styles.blockNext, (pressed || hovered) && styles.blockPressed]}
                  >
                    <View style={[styles.badge, done && { backgroundColor: Palette.success, borderColor: Palette.success }]}>
                      {done ? <Ionicons name="checkmark" size={16} color={Palette.white} /> : <Text style={styles.badgeText}>{i + 1}</Text>}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.blockTitle}>{task.title}</Text>
                      <Text style={styles.blockBlurb}>{task.blurb}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={styles.min}>{task.minutes} min</Text>
                      <Ionicons name="chevron-forward" size={16} color={Palette.muted} />
                    </View>
                  </AnimatedPressable>
                </Reveal>
              );
            })}
          </View>

          {/* Today's market, briefly */}
          <SectionHeader title="Today's market" />
          <DataModeBadge mode={t.data_mode} asOf={asOfLabel(t.as_of)} />
          <LabelledSection kind="fact" title="Biggest moves">
            {t.top_moves.map((m, i) => (
              <MoveRow key={m.fact_id} move={m} divider={i > 0} />
            ))}
          </LabelledSection>
          <TileGrid>
            <HubTile tone="teal" icon="sparkles-outline" title="AI overview" subtitle="What happened and why" onPress={() => router.push('/overview')} />
            <HubTile tone="info" icon="map-outline" title="Market map" subtitle="Moves on one diagram" onPress={() => router.push({ pathname: '/connect', params: { tab: 'map' } })} />
          </TileGrid>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  theme: {
    color: OnDark.fg,
    fontFamily: Fonts.displaySemi,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  warn: { backgroundColor: OnDark.accentTint, borderLeftWidth: 3, borderLeftColor: OnDark.accent, borderRadius: Radius.sm, padding: 12 },
  warnText: { color: OnDark.fg, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  heroCta: { marginTop: 6 },
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    minHeight: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
    ...Elevation.card,
  },
  blockDone: { backgroundColor: Palette.softSuccess, borderColor: Palette.success },
  blockNext: { borderColor: Palette.primary, borderWidth: 2 },
  blockPressed: { borderColor: Palette.primary, ...Elevation.raised },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Palette.primary, fontWeight: '700' },
  blockTitle: { color: Palette.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  blockBlurb: { color: Palette.muted, fontSize: 12, lineHeight: 17 },
  min: { color: Palette.muted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
