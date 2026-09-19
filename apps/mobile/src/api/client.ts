// Thin API client. Types will be generated from the backend OpenAPI (scripts/gen_types.sh).
import Constants from 'expo-constants';

import { getAccessToken } from '../lib/auth';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:8000';

export type DataMode = 'live' | 'cache' | 'demo';
export type QuizFormat = 'mcq' | 'case_study' | 'short_answer' | 'analysis';
export type Observed = 'correct' | 'partial' | 'incorrect';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export type Health = {
  status: 'ok' | 'degraded';
  data_mode: DataMode;
  version: string;
  checks: Record<string, boolean>;
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const verb = method ?? (body === undefined ? 'GET' : 'POST');
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method: verb,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      errBody.code ?? 'http_error',
      errBody.message ?? res.statusText,
      !!errBody.retryable,
    );
  }
  return res.json() as Promise<T>;
}

export const getHealth = () => request<Health>('/health');
export const getFixture = <T>(name: string) => request<T>(`/v1/dev/fixtures/${name}`);

// ---- RAG tutor ----
export type Citation = {
  source_id: string;
  title: string;
  publisher: string;
  url?: string | null;
  chunk_id?: string | null;
  section_path?: string | null;
  excerpt?: string | null;
  content_type?: string | null;
};

export type TutorLesson = {
  lesson: {
    concept_id: string;
    level: string;
    sections: {
      kind: 'supported' | 'synthesis' | 'assumption' | 'uncertainty';
      heading: string;
      text: string;
      source_ids: string[];
    }[];
    check_question: string;
    insufficient_evidence?: boolean;
  };
  citations: Citation[];
  follow_up: string;
  generated_by?: 'llm' | 'fallback';
};

export const getTutorLesson = (req: {
  concept_id: string;
  level?: string;
  misconception?: string;
  question?: string;
}) => request<TutorLesson>('/v1/tutor/lesson', req);

// ---- Adaptive quiz ----
export type TopicOption = {
  id: string;
  name: string;
  asset_class?: string | null;
  level?: Level;
  summary?: string | null;
};

export type QuizPreferences = {
  preferred_formats: QuizFormat[];
  preferred_concept_ids: string[];
  custom_topics: string[];
  level: Level;
};

export type QuizPreferencesResponse = {
  preferences: QuizPreferences;
  available_formats: { id: string; label: string }[];
  available_topics: TopicOption[];
};

export type QuizQuestion = {
  id: string;
  sequence: number;
  format: QuizFormat;
  difficulty: number;
  concept_ids: string[];
  custom_topic?: string | null;
  prompt: string;
  options?: { id: string; text: string }[] | null;
  context?: string | null;
  word_range?: [number, number] | null;
  hints?: string[];
};

export type QuizSession = {
  id: string;
  status: 'active' | 'ended';
  formats: QuizFormat[];
  concept_ids: string[];
  custom_topics: string[];
  level: Level;
  answered_count: number;
  correct_count: number;
  ready_count: number;
};

export type AnswerFeedback = {
  observed: Observed;
  score: number;
  explanation: string;
  strengths?: string[];
  gaps?: string[];
  correct_option_id?: string | null;
  review_concept_ids?: string[];
};

export type StartSessionResponse = {
  session: QuizSession;
  question: QuizQuestion;
  queue_depth: number;
};

export type SubmitAnswerResponse = {
  attempt_id: string;
  feedback: AnswerFeedback;
  mastery_updates: {
    concept_id: string;
    observed: Observed;
    mastery_before: number;
    mastery_after: number;
  }[];
  next_question: QuizQuestion | null;
  queue_depth: number;
  session: QuizSession;
};

export type LearnProgress = {
  level: Level;
  concepts: {
    concept_id: string;
    name: string;
    mastery: number;
    attempts: number;
    next_review_at?: string | null;
    is_focus?: boolean;
  }[];
  recommended_concept_ids: string[];
  weak_concept_ids: string[];
  strong_concept_ids: string[];
  due_reviews: string[];
  recent_attempts: {
    question_id: string;
    format: QuizFormat;
    concept_ids: string[];
    observed: Observed;
    score: number;
    submitted_at: string;
  }[];
  streak_days: number;
  recent_scores: number[];
  preferred_formats: QuizFormat[];
  custom_topics: string[];
};

export const getQuizPreferences = () =>
  request<QuizPreferencesResponse>('/v1/quiz/preferences');

export const updateQuizPreferences = (body: Partial<QuizPreferences>) =>
  request<QuizPreferencesResponse>('/v1/quiz/preferences', body, 'PUT');

export const startQuizSession = (body: {
  formats: QuizFormat[];
  concept_ids?: string[];
  custom_topics?: string[];
  level?: Level;
}) => request<StartSessionResponse>('/v1/quiz/sessions', body);

export const submitQuizAnswer = (
  sessionId: string,
  body: { question_id: string; answer: Record<string, unknown> },
) => request<SubmitAnswerResponse>(`/v1/quiz/sessions/${sessionId}/answers`, body);

export const refillQuizSession = (sessionId: string) =>
  request<{
    added: number;
    queue_depth: number;
    session: QuizSession;
    question?: QuizQuestion | null;
  }>(`/v1/quiz/sessions/${sessionId}/refill`, {});

export const endQuizSession = (sessionId: string) =>
  request<{
    session: QuizSession;
    answered_count: number;
    correct_count: number;
    percent_correct: number;
    weak_concept_ids: string[];
  }>(`/v1/quiz/sessions/${sessionId}/end`, {});

export const getLearnProgress = () => request<LearnProgress>('/v1/learn/progress');
