import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getFixture, getTutorLesson, type TutorLesson } from '@/api/client';
import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel, getPlan } from '@/lib/learner';
import { Palette } from '@/constants/theme';

type LessonPayload = TutorLesson;

const FALLBACK: LessonPayload = {
  lesson: {
    concept_id: 'real-yields',
    level: 'beginner',
    sections: [
      {
        kind: 'supported',
        heading: 'Definition',
        text: 'Real yield is roughly nominal yield minus expected inflation — the inflation-adjusted return lenders demand.',
        source_ids: ['S1'],
      },
      {
        kind: 'synthesis',
        heading: 'Why it matters today',
        text: 'When inflation surprises higher, markets often reprice rate expectations and real yields, which can pressure long-duration growth equities.',
        source_ids: [],
      },
    ],
    check_question: 'If expected inflation rises and nominal yields are unchanged, what happens to real yields?',
  },
  citations: [{ source_id: 'S1', title: 'DeskReady foundation lesson', publisher: 'DeskReady' }],
  follow_up: 'How would a rise in real yields show up in a rates-vs-tech story?',
};

export default function LessonScreen() {
  const router = useRouter();
  const { concept, misconception } = useLocalSearchParams<{ concept?: string; misconception?: string }>();
  const [payload, setPayload] = useState<LessonPayload | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const plan = await getPlan();
      try {
        // Live RAG tutor: retrieves sources and cites them.
        const live = await getTutorLesson({
          concept_id: concept ?? 'real-yields',
          level: plan?.level ?? 'beginner',
          misconception: misconception || undefined,
        });
        if (!cancelled) setPayload(live);
      } catch {
        // Backend unreachable: fall back to the canned lesson so the demo never dead-ends.
        const canned = await getFixture<LessonPayload>('lesson').catch(() => FALLBACK);
        if (!cancelled) {
          setOffline(true);
          setPayload(canned);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [concept, misconception]);

  if (!payload) {
    return (
      <Screen title="Lesson">
        <Text style={{ color: Palette.muted }}>Loading…</Text>
      </Screen>
    );
  }

  const conceptId = concept ?? payload.lesson.concept_id;

  return (
    <Screen title={conceptLabel(conceptId)} subtitle={`Level: ${payload.lesson.level}`}>
      {offline ? (
        <Text style={styles.notice}>Offline: showing a saved sample lesson, not a live one.</Text>
      ) : null}
      {payload.lesson.insufficient_evidence ? (
        <Text style={styles.notice}>
          Not enough sourced material on this concept yet. Everything below is AI explanation, not from sources.
        </Text>
      ) : null}
      <LabelledSection kind="teaching">
        {payload.lesson.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <ThemedText type="smallBold">
              {s.heading} · {s.kind}
            </ThemedText>
            <ThemedText>{s.text}</ThemedText>
            {s.source_ids.length ? (
              <ThemedText type="small" themeColor="textSecondary">
                Sources: {s.source_ids.join(', ')}
              </ThemedText>
            ) : null}
          </View>
        ))}
      </LabelledSection>

      <View style={styles.citeCard}>
        <Text style={styles.citeTitle}>Citations</Text>
        {payload.citations.length === 0 ? <Text style={styles.citeLine}>No sources cited.</Text> : null}
        {payload.citations.map((c) => (
          <View key={c.source_id} style={styles.cite}>
            <Text style={styles.citeLine}>
              [{c.source_id}] {c.title}
              {c.section_path ? ` › ${c.section_path.split(' > ').pop()}` : ''} — {c.publisher}
            </Text>
            {c.excerpt ? <Text style={styles.citeExcerpt}>“{c.excerpt}”</Text> : null}
            {c.url ? (
              <Text style={styles.citeLink} onPress={() => Linking.openURL(c.url!)}>
                Open source
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <LabelledSection kind="you">
        <ThemedText type="smallBold">Check question</ThemedText>
        <ThemedText>{payload.lesson.check_question}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Follow-up: {payload.follow_up}
        </ThemedText>
      </LabelledSection>

      <PrimaryButton label="Done — go to Learn" onPress={() => router.replace('/(tabs)/learn')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4, marginBottom: 8 },
  citeCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  citeTitle: { color: Palette.secondary, fontWeight: '700', fontSize: 12 },
  citeLine: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  cite: { gap: 2, marginBottom: 6 },
  citeExcerpt: { color: Palette.muted, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  citeLink: { color: Palette.secondary, fontSize: 12, fontWeight: '600' },
  notice: { color: Palette.secondary, fontSize: 13, lineHeight: 18 },
});
