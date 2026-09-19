import { useLocalSearchParams } from 'expo-router';

import { MarketLab } from '@/components/MarketLab';
import type { MarketSectionId } from '@/api/client';

export default function LabRoute() {
  const { section, kinds, daily, focus } = useLocalSearchParams<{ section?: MarketSectionId; kinds?: string; daily?: string; focus?: string }>();
  return <MarketLab mode="lab" section={section} kinds={kinds} daily={daily === '1'} focus={(focus as MarketSectionId) || undefined} />;
}
