import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getFixture, getTutorLesson, type TutorLesson } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel, getPlan } from '@/lib/learner';
import { Palette, Radius } from '@/constants/theme';

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

const KIND_TONE: Record<string, 'success' | 'accent' | 'neutral'> = {
  supported: 'success',
  synthesis: 'neutral',
  assumption: 'accent',
  uncertainty: 'accent',
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
      <Screen title="Lesson" safeEdges={['bottom']}>
        <ThemedText type="small" themeColor="textSecondary">
          Building your lesson from sources…
        </ThemedText>
      </Screen>
    );
  }

  const conceptId = concept ?? payload.lesson.concept_id;
  const sections = payload.lesson.sections;

  return (
    <Screen
      title={conceptLabel(conceptId)}
      subtitle={`Level: ${payload.lesson.level}`}
      safeEdges={['bottom']}
      footer={<PrimaryButton label="Done — go to Learn" onPress={() => router.replace('/(tabs)/learn')} />}
    >
      {offline ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Offline: showing a saved sample lesson, not a live one.</Text>
        </View>
      ) : null}
      {payload.lesson.insufficient_evidence ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Not enough sourced material on this concept yet. Everything below is AI explanation, not from
            sources.
          </Text>
        </View>
      ) : null}

      <LabelledSection kind="teaching">
        {sections.map((s, i) => (
          <View key={s.heading} style={[styles.section, i > 0 && styles.sectionDivider]}>
            <View style={styles.sectionHead}>
              <ThemedText type="sectionTitle" style={{ flex: 1 }}>
                {s.heading}
              </ThemedText>
              <Chip label={s.kind} tone={KIND_TONE[s.kind] ?? 'neutral'} size="sm" />
            </View>
            <ThemedText>{s.text}</ThemedText>
            {s.source_ids.length ? (
              <Text style={styles.sources}>Sources: {s.source_ids.join(', ')}</Text>
            ) : null}
          </View>
        ))}
      </LabelledSection>

      <SectionHeader
        title="Citations"
        meta={`${payload.citations.length} ${payload.citations.length === 1 ? 'source' : 'sources'}`}
      />
      <Card style={styles.citeCard}>
        {payload.citations.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.citeEmpty}>
            No sources cited.
          </ThemedText>
        ) : null}
        {payload.citations.map((c, i) => {
          const section = c.section_path ? c.section_path.split(' > ').pop() : null;
          return (
            <View key={c.source_id} style={[styles.citeRow, i > 0 && styles.sectionDivider]}>
              <Text style={styles.citeId}>{c.source_id}</Text>
              <View style={styles.citeBody}>
                <Text style={styles.citeTitle}>{c.title}</Text>
                <Text style={styles.citePublisher}>
                  {c.publisher}
                  {section ? ` · ${section}` : ''}
                </Text>
                {c.excerpt ? <Text style={styles.citeExcerpt}>“{c.excerpt}”</Text> : null}
                {c.url ? (
                  <Text
                    style={styles.citeLink}
                    accessibilityRole="link"
                    onPress={() => Linking.openURL(c.url!)}
                  >
                    Open source →
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      <LabelledSection kind="you" title="Check yourself">
        <ThemedText>{payload.lesson.check_question}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Follow-up: {payload.follow_up}
        </ThemedText>
      </LabelledSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: Palette.softAccent,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeText: { color: Palette.warning, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  section: { gap: 6, paddingVertical: 4 },
  sectionDivider: { borderTopWidth: 1, borderTopColor: Palette.border, paddingTop: 12, marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sources: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
  citeCard: { paddingVertical: 4, gap: 0 },
  citeEmpty: { paddingVertical: 8 },
  citeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  citeId: {
    color: Palette.primary,
    fontWeight: '700',
    fontSize: 12,
    minWidth: 28,
    paddingTop: 2,
  },
  citeBody: { flex: 1, gap: 2 },
  citeTitle: { color: Palette.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  citePublisher: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
  citeExcerpt: { color: Palette.muted, fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginTop: 2 },
  citeLink: { color: Palette.primary, fontSize: 13, fontWeight: '700', marginTop: 4 },
});
