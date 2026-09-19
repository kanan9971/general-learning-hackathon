import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getLearnProgress, type LearnProgress } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel, getPlan, type LearnerPlan } from '@/lib/learner';
import { Palette, Radius } from '@/constants/theme';

export default function ProgressScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<LearnerPlan | null>(null);
  const [progress, setProgress] = useState<LearnProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        const p = await getPlan();
        if (!cancelled) setPlan(p);
        try {
          const live = await getLearnProgress();
          if (!cancelled) setProgress(live);
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Could not load progress');
            setProgress(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const onRetake = () => {
    const go = () => router.push('/placement');
    const message = 'This re-runs the placement quiz and reshapes your roadmap. Your progress is kept and blended in.';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`Retake placement?\n\n${message}`)) go();
      return;
    }
    Alert.alert('Retake placement?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retake', onPress: go },
    ]);
  };

  const level = progress?.level ?? plan?.level ?? 'beginner';
  const concepts = progress?.concepts ?? [];
  const recommended = progress?.recommended_concept_ids ?? plan?.focusConceptIds ?? [];

  return (
    <Screen
      title="Your progress"
      subtitle="Mastery from every quiz, lab and placement answer"
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton label="Practise" onPress={() => router.push('/(tabs)/practice')} />
          <Disclaimer />
        </>
      }
    >
      {loading ? <ActivityIndicator color={Palette.primary} /> : null}
      {error ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{error} — showing onboarding plan only.</Text>
        </View>
      ) : null}

      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Your plan
        </ThemedText>
        <View style={styles.planHead}>
          <Text style={styles.level}>{level}</Text>
          {plan ? <Chip label={`${plan.percentCorrect}% placement`} tone="neutral" size="sm" /> : null}
        </View>
        {progress?.custom_topics?.length ? (
          <ChipRow>
            {progress.custom_topics.map((t) => (
              <Chip key={t} label={t} tone="accent" outlined />
            ))}
          </ChipRow>
        ) : null}
        {plan?.focusConceptIds?.length ? (
          <ChipRow>
            {plan.focusConceptIds.map((id) => (
              <Chip key={id} label={conceptLabel(id)} tone="info" outlined />
            ))}
          </ChipRow>
        ) : null}
      </Card>

      <SectionHeader
        title="Recommended next"
        meta={recommended.length ? `${recommended.length}` : undefined}
      />
      <Card tone="accent">
        {recommended.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Practise to unlock personalised recommendations.
          </ThemedText>
        ) : (
          <>
            <ChipRow>
              {recommended.map((id) => (
                <Chip key={id} label={conceptLabel(id)} tone="accent" />
              ))}
            </ChipRow>
            <ThemedText type="small" themeColor="textSecondary">
              Based on weak mastery, due reviews, and recent mistakes.
            </ThemedText>
          </>
        )}
      </Card>

      <SectionHeader title="Mastery" meta={concepts.length ? `${concepts.length} concepts` : undefined} />
      {concepts.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Every answer updates these bars. Start from the Practice tab.
          </ThemedText>
        </Card>
      ) : (
        <Card style={styles.table}>
          {concepts.map((c, i) => {
            const pct = Math.round(c.mastery * 100);
            return (
              <View key={c.concept_id} style={[styles.masteryRow, i > 0 && styles.rowDivider]}>
                <View style={styles.masteryHead}>
                  <Text style={styles.masteryName}>{c.name || conceptLabel(c.concept_id)}</Text>
                  {c.is_focus ? <Text style={styles.focusTag}>FOCUS</Text> : null}
                  <Text style={styles.masteryPct}>{pct}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <ThemedText type="caption" themeColor="textSecondary">
                  {c.attempts} attempt{c.attempts === 1 ? '' : 's'}
                </ThemedText>
              </View>
            );
          })}
        </Card>
      )}

      {progress?.recent_attempts?.length ? (
        <>
          <SectionHeader title="Recent attempts" />
          <Card style={styles.table}>
            {progress.recent_attempts.slice(0, 6).map((a, i) => (
              <View key={`${a.question_id}-${i}`} style={[styles.masteryRow, i > 0 && styles.rowDivider]}>
                <View style={styles.masteryHead}>
                  <Text style={styles.masteryName}>
                    {a.concept_ids[0] ? conceptLabel(a.concept_ids[0]) : a.format}
                  </Text>
                  <Text
                    style={[
                      styles.masteryPct,
                      {
                        color:
                          a.observed === 'correct'
                            ? Palette.success
                            : a.observed === 'partial'
                              ? Palette.warning
                              : Palette.error,
                      },
                    ]}
                  >
                    {a.score}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Plan settings" />
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Retaking placement reshapes your roadmap. Your mastery history is kept.
        </ThemedText>
        <PrimaryButton label="Retake placement quiz" variant="secondary" onPress={onRetake} />
        <PrimaryButton
          label="Choose topics"
          variant="ghost"
          onPress={() => router.push('/topics' as '/quiz')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: {
    backgroundColor: Palette.softAccent,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warnText: { color: Palette.warning, fontSize: 13, fontWeight: '600' },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  level: {
    color: Palette.primary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  table: { paddingVertical: 4, gap: 0 },
  masteryRow: { paddingVertical: 12, gap: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: Palette.border },
  masteryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  masteryName: { flex: 1, color: Palette.text, fontWeight: '600', fontSize: 15 },
  focusTag: { color: Palette.secondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  masteryPct: {
    color: Palette.secondary,
    fontWeight: '700',
    fontSize: 15,
    minWidth: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 8,
    borderRadius: Radius.sm,
    backgroundColor: Palette.border,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: Radius.sm, backgroundColor: Palette.secondary },
});
