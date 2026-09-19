import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getLearnProgress, type LearnProgress } from '@/api/client';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { HubTile, TileGrid } from '@/components/HubTile';
import { ProfileButton } from '@/components/ProfileButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Card } from '@/components/Card';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { getPlan } from '@/lib/learner';
import { useRoadmap } from '@/lib/useRoadmap';

/** Practice: every way to be tested, in one place. Pick a mode, or let it target your weak spots. */
export default function PracticeScreen() {
  const router = useRouter();
  const { roadmap } = useRoadmap();
  const [progress, setProgress] = useState<LearnProgress | null>(null);
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  useFocusEffect(
    useCallback(() => {
      getLearnProgress().then(setProgress).catch(() => setProgress(null));
      getPlan().then((p) => setLevel(p?.level ?? 'beginner'));
    }, []),
  );

  const lab = (params?: Record<string, string>) => router.push({ pathname: '/lab', params });
  const weak = roadmap?.nodes.find((n) => n.state === 'priority' && n.section_id);
  const due = progress?.due_reviews ?? [];
  const topics = (roadmap?.nodes ?? []).filter((n) => n.section_id);

  return (
    <Screen title="Practice" subtitle="Test what you understand" right={<ProfileButton />} footer={<Disclaimer />}>
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.primary }}>
          Quick set
        </ThemedText>
        <ThemedText type="smallBold">6 questions, about 5 minutes</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A mix of what-ifs, predictions and explanations on today&apos;s real market, tuned to your level.
        </ThemedText>
        <PrimaryButton label="Start a quick set" onPress={() => lab()} />
      </Card>

      <SectionHeader title="Focus on" />
      <TileGrid>
        <HubTile
          tone="accent"
          icon="alert-circle-outline"
          title="My weak spots"
          subtitle={weak ? `Start with ${weak.title}` : 'Nothing weak yet'}
          onPress={() => (weak?.section_id ? lab({ section: weak.section_id }) : lab())}
        />
        <HubTile
          tone="teal"
          icon="refresh-outline"
          title="Due for review"
          subtitle={due.length ? `${due.length} concept${due.length === 1 ? '' : 's'} due` : 'All caught up'}
          badge={due.length ? String(due.length) : undefined}
          onPress={() =>
            router.push({
              pathname: '/quiz',
              params: { formats: 'mcq,short_answer', concepts: due.slice(0, 4).join(','), customs: '', level },
            })
          }
        />
      </TileGrid>

      <SectionHeader title="Pick a mode" />
      <TileGrid>
        <HubTile tone="error" icon="shuffle-outline" title="What-if scenarios" subtitle="Change one thing, predict the ripple" onPress={() => lab({ kinds: 'scenario' })} />
        <HubTile tone="success" icon="trending-up-outline" title="Predict the move" subtitle="Call it before you see it" onPress={() => lab({ kinds: 'predict' })} />
        <HubTile tone="info" icon="git-branch-outline" title="Order the chain" subtitle="Rebuild cause and effect" onPress={() => lab({ kinds: 'chain' })} />
        <HubTile tone="teal" icon="chatbubble-ellipses-outline" title="Explain it" subtitle="Write it in your own words" onPress={() => lab({ kinds: 'explain' })} />
        <HubTile
          wide
          tone="accent"
          icon="infinite-outline"
          title="Endless adaptive quiz"
          subtitle="AI-written what-if questions that keep adapting until you stop"
          onPress={() => router.push('/quiz-setup')}
        />
      </TileGrid>

      {topics.length ? (
        <>
          <SectionHeader title="By topic" meta="tap to practise one" />
          <ChipRow>
            {topics.map((n) => (
              <Pressable key={n.id} onPress={() => n.section_id && lab({ section: n.section_id })} accessibilityRole="button">
                <Chip label={n.title} tone={n.state === 'priority' ? 'accent' : n.state === 'mastered' ? 'success' : 'info'} outlined />
              </Pressable>
            ))}
          </ChipRow>
        </>
      ) : null}
    </Screen>
  );
}
