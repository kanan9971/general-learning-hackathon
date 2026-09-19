import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getMarketsFeed, type MarketsFeed } from '@/api/client';
import { getInterests, type MarketInterests } from '@/lib/interests';

// One shared feed for every Markets page, so moving between pages doesn't refetch each time.
const TTL_MS = 5 * 60 * 1000;
let cache: { key: string; at: number; feed: MarketsFeed } | null = null;

export function useMarketsFeed() {
  const [state, setState] = useState<{ feed: MarketsFeed | null; interests: MarketInterests | null; error: string | null }>({
    feed: cache?.feed ?? null,
    interests: null,
    error: null,
  });

  const load = useCallback(async (force = false) => {
    const interests = await getInterests();
    const key = JSON.stringify(interests);
    if (!force && cache && cache.key === key && Date.now() - cache.at < TTL_MS) {
      setState({ feed: cache.feed, interests, error: null });
      return;
    }
    try {
      const feed = await getMarketsFeed({ interests: interests.sections, watch: interests.watch });
      cache = { key, at: Date.now(), feed };
      setState({ feed, interests, error: null });
    } catch (e) {
      setState((s) => ({ ...s, interests, error: e instanceof Error ? e.message : 'Could not load markets' }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { ...state, reload: () => load(true) };
}
