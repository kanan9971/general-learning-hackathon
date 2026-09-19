import { useCallback, useState } from 'react';
import { useFocusEffect, type useRouter } from 'expo-router';

import { getRoadmap, type Roadmap, type RoadmapNode } from '@/api/client';
import { getPlan } from '@/lib/learner';

/** The learner's personalised roadmap, refreshed whenever the screen is focused (answers move it). */
export function useRoadmap() {
  const [state, setState] = useState<{ roadmap: Roadmap | null; error: string | null; loading: boolean }>({
    roadmap: null,
    error: null,
    loading: true,
  });

  const load = useCallback(async () => {
    try {
      const plan = await getPlan();
      const roadmap = await getRoadmap(plan?.level);
      setState({ roadmap, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'Could not load your roadmap', loading: false }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { ...state, reload: load };
}

type Router = ReturnType<typeof useRouter>;

/** Where tapping a roadmap node goes. */
export function openNode(router: Router, n: RoadmapNode) {
  if (n.action === 'connect') return router.push('/connect');
  if (n.action === 'lab_explain') return router.push({ pathname: '/lab', params: { kinds: 'explain' } });
  if (n.action === 'lab_scenario') return router.push({ pathname: '/lab', params: { kinds: 'scenario' } });
  if (n.section_id) return router.push({ pathname: '/market/[section]', params: { section: n.section_id } });
}

/** "Test out": a short check on this topic; answering well marks it known and moves the roadmap on. */
export function testOut(router: Router, n: RoadmapNode) {
  if (n.section_id) router.push({ pathname: '/lab', params: { section: n.section_id, kinds: 'driver,chain,scenario' } });
}
