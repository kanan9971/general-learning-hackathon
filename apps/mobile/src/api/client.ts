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

// ---- Markets feed ----
export type MarketSectionId =
  | 'macro'
  | 'rates'
  | 'fx'
  | 'commodities'
  | 'equities'
  | 'sectors'
  | 'companies'
  | 'portfolio';
export type MarketGroup = 'macro' | 'micro' | 'company' | 'portfolio';
export type ProviderStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export type Move = {
  fact_id: string;
  symbol: string;
  label: string;
  section: MarketSectionId;
  asset_class: string;
  level: number;
  level_unit: string;
  change: number;
  change_unit: '%' | 'bp';
  change_5d?: number | null;
  source: 'yahoo' | 'treasury' | 'golden';
  as_of: string;
  unusual: boolean;
  score: number;
};

export type Headline = {
  id: string;
  title: string;
  summary: string;
  url: string;
  publisher: string;
  published_at?: string | null;
  sections: MarketSectionId[];
  tickers: string[];
  concept_ids: string[];
  is_official: boolean;
};

export type GuideStep = { from_: string; to: string; why: string };

export type SectionGuide = {
  id: MarketSectionId;
  group: MarketGroup;
  title: string;
  tagline: string;
  desk: string;
  how_it_works: string[];
  key_drivers: { name: string; why: string }[];
  transmission: GuideStep[];
  strategies: {
    name: string;
    idea: string;
    how_expressed: string;
    what_breaks_it: string;
    concept_ids: string[];
  }[];
  watch: string[];
  glossary: Record<string, string>;
  concept_ids: string[];
};

export type MarketSection = {
  id: MarketSectionId;
  group: MarketGroup;
  title: string;
  tagline: string;
  pinned: boolean;
  moves: Move[];
  headlines: Headline[];
  guide: SectionGuide;
  attribution?: {
    portfolio_return_pct: number;
    contributions: { symbol: string; weight: number; return_pct: number; contribution_pct: number }[];
    sectors: Record<string, number>;
  } | null;
  note?: string | null;
};

export type MarketsFeed = {
  as_of: string | null;
  data_mode: DataMode;
  generated_at: string;
  providers: Record<'prices' | 'treasury' | 'fed_news' | 'wsj_news' | 'ticker_news', ProviderStatus>;
  primer: { title: string; intro: string; steps: GuideStep[] };
  top_moves: Move[];
  sections: MarketSection[];
  interest_options: { id: MarketSectionId; group: MarketGroup; title: string; tagline: string }[];
  portfolio_source: string;
};

export type SectionExplanation = {
  summary: string;
  drivers: { explanation: string; fact_ids: string[]; headline_ids: string[] }[];
  chain: GuideStep[];
  desk_views: { strategy: string; rationale: string; risk: string }[];
  watch_next: string[];
  confidence: 'low' | 'medium' | 'high';
  confidence_reason: string;
  concept_ids: string[];
};

export type ExplainSectionResponse = {
  section_id: MarketSectionId;
  as_of: string | null;
  data_mode: DataMode;
  explanation: SectionExplanation;
  moves: Move[];
  headlines: Headline[];
  generated_by: 'llm' | 'fallback';
};

export const getMarketsFeed = (params: { interests: string[]; watch: string[] }) => {
  const q = new URLSearchParams();
  if (params.interests.length) q.set('interests', params.interests.join(','));
  if (params.watch.length) q.set('watch', params.watch.join(','));
  const qs = q.toString();
  return request<MarketsFeed>(`/v1/markets/feed${qs ? `?${qs}` : ''}`);
};

export const explainMarketSection = (
  sectionId: MarketSectionId,
  body: { level: Level; watch: string[] },
) => request<ExplainSectionResponse>(`/v1/markets/sections/${sectionId}/explain`, body);

export type MarketOverview = {
  headline: string;
  summary: string;
  key_points: {
    section_id: MarketSectionId;
    point: string;
    explanation: string;
    evidence: { fact_ids: string[]; headline_ids: string[] };
    supported: boolean;
  }[];
  connections: { from_: string; to: string; why: string; fact_ids: string[] }[];
  desk_views: { desk: string; strategy: string; rationale: string; risk: string; fact_ids: string[] }[];
  watch_next: string[];
  confidence: 'low' | 'medium' | 'high';
  confidence_reason: string;
  concept_ids: string[];
};

export type OverviewResponse = {
  as_of: string | null;
  data_mode: DataMode;
  overview: MarketOverview;
  moves: Move[];
  headlines: Headline[];
  generated_by: 'llm' | 'fallback';
  generated_at: string;
};

export const getMarketOverview = (body: { level: Level; interests: MarketSectionId[]; watch: string[] }) =>
  request<OverviewResponse>('/v1/markets/overview', body);
