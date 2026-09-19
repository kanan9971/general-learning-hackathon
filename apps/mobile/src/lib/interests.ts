import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MarketSectionId } from '@/api/client';

/** What the learner follows in the Markets tab. Stored on-device (like the learner plan). */
export type MarketInterests = {
  sections: MarketSectionId[];
  watch: string[]; // tickers for company analysis
};

const KEY = 'deskready.marketInterests';
export const DEFAULT_INTERESTS: MarketInterests = { sections: ['macro', 'rates', 'companies'], watch: [] };

export async function getInterests(): Promise<MarketInterests> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_INTERESTS;
    const v = JSON.parse(raw) as Partial<MarketInterests>;
    return { sections: v.sections ?? DEFAULT_INTERESTS.sections, watch: v.watch ?? [] };
  } catch {
    return DEFAULT_INTERESTS;
  }
}

export async function saveInterests(v: MarketInterests): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(v));
}
