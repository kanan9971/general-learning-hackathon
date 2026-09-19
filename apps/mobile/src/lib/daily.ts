import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getDailyCycle, getDailyToday, type CycleStatus, type DailyToday } from '@/api/client';
import { getPlan } from '@/lib/learner';

/** The learner's own calendar date (YYYY-MM-DD). The server treats weekdays as market days. */
export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today's session, refreshed on focus so finishing a block elsewhere ticks it off here. */
export function useDaily() {
  const [state, setState] = useState<{ today: DailyToday | null; error: string | null; loading: boolean }>({
    today: null,
    error: null,
    loading: true,
  });
  const load = useCallback(async () => {
    try {
      const plan = await getPlan();
      setState({ today: await getDailyToday(plan?.level, localToday()), error: null, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'Could not load today', loading: false }));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { ...state, reload: load, setToday: (t: DailyToday) => setState({ today: t, error: null, loading: false }) };
}

/** The long cycle (phases, calendar, streak), refreshed on focus. */
export function useCycle() {
  const [cycle, setCycle] = useState<CycleStatus | null>(null);
  const load = useCallback(async () => {
    try {
      const plan = await getPlan();
      setCycle(await getDailyCycle(plan?.level, localToday()));
    } catch {
      setCycle(null);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { cycle, reload: load };
}
