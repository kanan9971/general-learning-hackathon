import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getFixture } from '@/api/client';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { conceptLabel } from '@/lib/learner';
import { Palette } from '@/constants/theme';

type LessonPayload = {
  lesson: {
    concept_id: string;
    level: string;
    sections: { kind: string; heading: string; text: string; source_ids: string[] }[];
    check_question: string;
  };
  citations: { source_id: string; title: string; publisher: string }[];
  follow_up: string;
};

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
  const { concept } = useLocalSearchParams<{ concept?: string }>();
  const [payload, setPayload] = useState<LessonPayload | null>(null);

  useEffect(() => {
    getFixture<LessonPayload>('lesson')
      .then(setPayload)
      .catch(() => setPayload(FALLBACK));
  }, []);

  if (!payload) {
    return (
      <Screen title="Lesson" safeEdges={['bottom']}>
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
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
      <LabelledSection kind="teaching">
        {sections.map((s, i) => (
          <View key={s.heading} style={[styles.section, i > 0 && styles.sectionDivider]}>
            <View style={styles.sectionHead}>
              <ThemedText type="sectionTitle" style={{ flex: 1 }}>
                {s.heading}
              </ThemedText>
              <Chip
                label={s.kind}
                tone={s.kind === 'supported' ? 'success' : 'neutral'}
                size="sm"
              />
            </View>
            <ThemedText>{s.text}</ThemedText>
            {s.source_ids.length ? (
              <Text style={styles.sources}>Sources: {s.source_ids.join(', ')}</Text>
            ) : null}
          </View>
        ))}
      </LabelledSection>

      <SectionHeader title="Citations" meta={`${payload.citations.length} sources`} />
      <Card style={styles.citeCard}>
        {payload.citations.map((c, i) => (
          <View key={c.source_id} style={[styles.citeRow, i > 0 && styles.sectionDivider]}>
            <Text style={styles.citeId}>{c.source_id}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.citeTitle}>{c.title}</Text>
              <Text style={styles.citePublisher}>{c.publisher}</Text>
            </View>
          </View>
        ))}
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
  section: { gap: 6, paddingVertical: 4 },
  sectionDivider: { borderTopWidth: 1, borderTopColor: Palette.border, paddingTop: 12, marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sources: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
  citeCard: { paddingVertical: 4, gap: 0 },
  citeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  citeId: {
    color: Palette.primary,
    fontWeight: '700',
    fontSize: 12,
    minWidth: 28,
    paddingTop: 2,
  },
  citeTitle: { color: Palette.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  citePublisher: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
});
