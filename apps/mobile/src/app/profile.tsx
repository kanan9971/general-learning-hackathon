import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { HubTile, TileGrid } from '@/components/HubTile';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { getPlan, type LearnerPlan } from '@/lib/learner';

/** Level, demo teaching book, progress, interests, placement. Paper classroom is the Portfolio tab. */
export default function ProfileScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<LearnerPlan | null>(null);
  useEffect(() => {
    getPlan().then(setPlan);
  }, []);

  return (
    <Screen safeEdges={['bottom']} footer={<Disclaimer />}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Your level
        </ThemedText>
        <ThemedText type="display" style={{ textTransform: 'capitalize' }}>
          {plan?.level ?? 'Not placed yet'}
        </ThemedText>
        {plan ? <Chip label={`${plan.percentCorrect}% on placement`} tone="neutral" size="sm" /> : null}
      </Card>

      <SectionHeader title="Your stuff" />
      <TileGrid>
        <HubTile
          tone="info"
          icon="pie-chart-outline"
          title="Demo book"
          subtitle="Teaching holdings on the Markets tab"
          onPress={() => router.push({ pathname: '/market/[section]', params: { section: 'portfolio' } })}
        />
        <HubTile tone="info" icon="stats-chart-outline" title="Progress" subtitle="Mastery, attempts, streak" onPress={() => router.push('/progress')} />
        <HubTile tone="accent" icon="options-outline" title="Interests" subtitle="Markets and tickers you follow" onPress={() => router.push('/interests')} />
        <HubTile tone="success" icon="list-outline" title="Quiz topics" subtitle="Choose what the endless quiz covers" onPress={() => router.push('/topics')} />
        <HubTile
          wide
          tone="error"
          icon="refresh-circle-outline"
          title="Retake placement"
          subtitle="Re-run the adaptive quiz and rebuild your roadmap"
          onPress={() => router.push('/placement')}
        />
      </TileGrid>
    </Screen>
  );
}
