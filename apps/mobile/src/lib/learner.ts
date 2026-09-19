import AsyncStorage from '@react-native-async-storage/async-storage';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export type LearnerPlan = {
  level: Level;
  focusConceptIds: string[];
  percentCorrect: number;
  answeredAt: string;
};

export type MasteryMap = Record<string, number>;

const KEYS = {
  onboarded: 'deskready.onboarded',
  plan: 'deskready.plan',
  mastery: 'deskready.mastery',
} as const;

export async function isOnboarded(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.onboarded);
  return v === 'true';
}

export async function setOnboarded(value = true): Promise<void> {
  await AsyncStorage.setItem(KEYS.onboarded, value ? 'true' : 'false');
}

export async function getPlan(): Promise<LearnerPlan | null> {
  const raw = await AsyncStorage.getItem(KEYS.plan);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LearnerPlan;
  } catch {
    return null;
  }
}

export async function savePlan(plan: LearnerPlan): Promise<void> {
  await AsyncStorage.setItem(KEYS.plan, JSON.stringify(plan));
  await setOnboarded(true);
}

export async function getMastery(): Promise<MasteryMap> {
  const raw = await AsyncStorage.getItem(KEYS.mastery);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MasteryMap;
  } catch {
    return {};
  }
}

export async function saveMastery(map: MasteryMap): Promise<void> {
  await AsyncStorage.setItem(KEYS.mastery, JSON.stringify(map));
}

/** Bump mastery for concepts after a daily quiz. Correct → +0.12, wrong → -0.05, clamp 0–1. */
export async function applyQuizMastery(
  results: { conceptId: string; correct: boolean }[],
): Promise<MasteryMap> {
  const map = await getMastery();
  for (const r of results) {
    const prev = map[r.conceptId] ?? 0.35;
    const next = r.correct ? prev + 0.12 : prev - 0.05;
    map[r.conceptId] = Math.max(0, Math.min(1, next));
  }
  await saveMastery(map);
  return map;
}

export function inferLevel(percentCorrect: number): Level {
  if (percentCorrect < 40) return 'beginner';
  if (percentCorrect < 75) return 'intermediate';
  return 'advanced';
}

export function conceptLabel(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
