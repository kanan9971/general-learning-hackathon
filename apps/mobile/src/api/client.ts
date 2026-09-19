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
  | 'portfolio'
  | 'desk'
  | 'valuation'
  | 'risk';
export type MarketGroup = 'macro' | 'micro' | 'company' | 'portfolio' | 'foundations';
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
  mental_model: string;
  rules: { when: string; then: string; why: string; exception: string }[];
  mistakes: string[];
  interview: string[];
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


// ---- Market Lab ----
export type LabKind = 'predict' | 'driver' | 'chain' | 'explain' | 'scenario';

export type LabQuestion = {
  id: string;
  kind: LabKind;
  section_id: MarketSectionId;
  title?: string | null;
  prompt: string;
  context?: string | null;
  facts: Move[];
  options: { id: string; text: string }[];
  items: { id: string; text: string }[];
  parts: { id: string; label: string }[];
  hint?: string | null;
  word_range?: [number, number] | null;
  concept_ids: string[];
  difficulty: number;
  surprise: boolean;
};

export type LabSet = { as_of: string | null; data_mode: DataMode; questions: LabQuestion[] };

export type LabFeedback = {
  question_id: string;
  correct: boolean;
  observed: Observed;
  score: number;
  explanation: string;
  strengths: string[];
  gaps: string[];
  reveal: {
    facts: Move[];
    facts_note?: string | null;
    shock?: string | null;
    chain: { from_: string; to: string; why: string }[];
    parts: {
      id: string;
      label: string;
      expected: 'up' | 'down' | 'flat';
      picked?: string | null;
      correct: boolean;
      why: string;
      fact_id?: string | null;
    }[];
    textbook?: string | null;
    followed?: boolean | null;
    exception?: string | null;
    correct_order: string[];
    model_answer?: string | null;
  };
  mastery: { concept_id: string; mastery_before: number; mastery_after: number }[];
  graded_by: 'rule' | 'llm' | 'fallback';
  concept_ids: string[];
};

export const getMarketLab = (body: {
  level: Level;
  kinds?: LabKind[];
  section?: MarketSectionId;
  interests: MarketSectionId[];
  watch: string[];
  count?: number;
}) => request<LabSet>('/v1/markets/lab', body);

export const answerMarketLab = (body: {
  question_id: string;
  placement?: boolean;
  answer: string | string[] | Record<string, string>;
  level: Level;
  section?: MarketSectionId;
  watch: string[];
}) => request<LabFeedback>('/v1/markets/lab/answer', body);


// ---- Roadmap + placement ----
export type RoadmapNodeState = 'not_started' | 'in_progress' | 'priority' | 'mastered';

export type RoadmapNode = {
  id: string;
  title: string;
  tagline: string;
  tier: number;
  order: number;
  requires: string[];
  action: 'section' | 'connect' | 'lab_explain' | 'lab_scenario';
  section_id?: MarketSectionId | null;
  concept_ids: string[];
  progress: number;
  coverage: number;
  state: RoadmapNodeState;
  recommended: boolean;
  collapsed: boolean;
  test_out: boolean;
  hint?: string | null;
};

export type Roadmap = {
  level: Level;
  track: string;
  rationale: string;
  needs_placement: boolean;
  next_id?: string | null;
  mastered_count: number;
  total_count: number;
  nodes: RoadmapNode[];
};

export type PlacementStep = {
  done: boolean;
  index: number;
  total: number;
  question?: LabQuestion | null;
  level?: Level | null;
  percent?: number | null;
  topics: { section_id: MarketSectionId; title: string; observed: Observed; difficulty: number }[];
  focus_concept_ids: string[];
};

export const getRoadmap = (level?: Level) =>
  request<Roadmap>(`/v1/roadmap${level ? `?level=${level}` : ''}`);

export const getPlacementNext = (history: { question_id: string; observed: Observed }[]) =>
  request<PlacementStep>('/v1/roadmap/placement/next', { history });

// ---- Daily session + learning cycle ----
export type TaskKind = 'brief' | 'focus' | 'analysis' | 'practice' | 'review' | 'recap';
export type Verdict = 'on_track' | 'slipping' | 'behind';

export type DailyTask = {
  id: TaskKind;
  kind: TaskKind;
  title: string;
  blurb: string;
  minutes: number;
  status: 'todo' | 'done';
  result?: Record<string, unknown> | null;
  done_at?: string | null;
};

export type NotePrompt = { id: string; title: string; hint: string };

export type DailyToday = {
  date: string;
  weekday: string;
  is_market_day: boolean;
  theme: string;
  day_number: number;
  total_goal_days: number;
  phase: { index: number; title: string; theme: string; topics: { id: string; title: string; section_id?: MarketSectionId | null }[] };
  focus_node_id: string;
  focus_title: string;
  focus_section_id?: MarketSectionId | null;
  tasks: DailyTask[];
  minutes_planned: number;
  minutes_done: number;
  goal_met: boolean;
  streak: number;
  best_streak: number;
  verdict: Verdict;
  behind_by: number;
  cycle_complete: boolean;
  as_of: string | null;
  data_mode: DataMode;
  top_moves: Move[];
  analysis?: { target: Move; related: Move[]; headlines: Headline[]; prompts: NotePrompt[] } | null;
  week?: { days_met: number; market_days: number; notes_written: number; avg_note_score: number | null; minutes: number } | null;
  due_concepts: string[];
};

export type AnalysisFeedback = {
  score: number;
  observed: Observed;
  passed: boolean;
  prompt_scores: { prompt_id: string; score: number; comment: string }[];
  strengths: string[];
  gaps: string[];
  model_note: string;
  graded_by: 'llm' | 'fallback';
  today: DailyToday;
};

export type CycleStatus = {
  started_on: string;
  level: Level;
  completed_days: number;
  total_days: number;
  day_number: number;
  phase_index: number;
  phase_title: string;
  focus_node_id: string;
  streak: number;
  best_streak: number;
  verdict: Verdict;
  behind_by: number;
  week_minutes: number;
  complete: boolean;
  phases: { index: number; title: string; theme: string; topics: string[]; days_done: number; days_total: number; state: 'done' | 'current' | 'upcoming' }[];
  calendar: { date: string; weekday: string; status: 'met' | 'partial' | 'missed' | 'today' | 'future' | 'rest'; minutes: number }[];
};

const q = (o: Record<string, string | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const getDailyToday = (level: Level | undefined, today: string) => request<DailyToday>(`/v1/daily/today${q({ level, today })}`);
export const getDailyCycle = (level: Level | undefined, today: string) => request<CycleStatus>(`/v1/daily/cycle${q({ level, today })}`);
export const restartDailyCycle = (level: Level | undefined, today: string) =>
  request<CycleStatus>(`/v1/daily/cycle/restart${q({ level, today })}`, {});
export const completeDailyTask = (
  taskId: TaskKind,
  body: { level?: Level; today: string; call?: string; watch?: string; answered?: number; correct?: number },
) => request<DailyToday>(`/v1/daily/tasks/${taskId}/complete`, body);
export const submitDailyAnalysis = (body: { level?: Level; today: string; answers: Record<string, string> }) =>
  request<AnalysisFeedback>('/v1/daily/analysis', body);

// ---- Paper classroom (simulated fills; not live brokerage) ----
export type PaperSide = 'buy' | 'sell' | 'short' | 'cover';
export type TicketKind = 'market' | 'limit' | 'stop';
export type InstrumentKind = 'equity' | 'option';
export type FillStatus = 'filled' | 'working' | 'cancelled';
export type OptionRight = 'call' | 'put';

export type PaperLot = {
  id: string;
  kind: InstrumentKind;
  symbol: string;
  quantity: number;
  cost_basis: number;
  market_price: number | null;
  market_value: number | null;
  unrealized_pct: number | null;
  option_right: OptionRight | null;
  option_strike: number | null;
  option_expiry: string | null;
};

export type PaperFill = {
  id: string;
  symbol: string;
  side: PaperSide;
  quantity: number;
  fill_price: number | null;
  notional: number | null;
  ticket_kind: TicketKind;
  limit_price: number | null;
  status: FillStatus;
  instrument_kind: InstrumentKind;
  option_right: OptionRight | null;
  option_strike: number | null;
  option_expiry: string | null;
  fact_id: string | null;
  as_of_date: string | null;
  filled_at: string;
  analysis_ready: boolean;
};

export type ListedOption = {
  underlying: string;
  right: OptionRight;
  strike: number;
  expiry: string;
  mark: number;
};

export type PaperBook = {
  level: Level;
  cash_usd: number;
  starting_cash: number;
  equity_value: number;
  nav: number;
  data_mode: DataMode;
  as_of: string | null;
  source: 'paper';
  attribution: { portfolio_return_pct: number; contributions: { symbol: string; weight: number; return_pct: number; contribution_pct: number }[]; sectors: Record<string, number> } | null;
  lots: PaperLot[];
  fills: PaperFill[];
  whitelist: { symbol: string; name: string; sector: string }[];
  allowed_sides: PaperSide[];
  allowed_ticket_kinds: TicketKind[];
  options_allowed: boolean;
  custom_tickers_allowed: boolean;
  option_underlyings: string[];
  listed_options: ListedOption[];
  analysis_available: boolean;
  analysis_unlocks_on: string | null;
  educational: string;
};

export type PaperTicket = {
  symbol: string;
  side: PaperSide;
  quantity: number;
  ticket_kind?: TicketKind;
  limit_price?: number | null;
  instrument_kind?: InstrumentKind;
  option_right?: OptionRight | null;
  option_strike?: number | null;
  option_expiry?: string | null;
  level?: Level;
};

export type PaperAnalysis = {
  as_of: string | null;
  data_mode: DataMode;
  unlocks_on: string | null;
  eligible_fill_ids: string[];
  facts: {
    fact_id: string;
    symbol: string;
    label: string;
    change: number;
    change_unit: string;
    return_since_fill: number | null;
    fill_price: number | null;
    last: number | null;
  }[];
  headlines: { id: string; title: string; url: string; publisher: string }[];
  analysis: {
    headline: string;
    summary: string;
    points: { symbol: string; point: string; explanation: string; fact_ids: string[]; headline_ids: string[]; supported: boolean }[];
    confidence: 'low' | 'medium' | 'high';
    confidence_reason: string;
    concept_ids: string[];
    status: 'ok' | 'fallback';
  };
  prompt_version: string;
};

export const getPaperBook = (level?: Level) => request<PaperBook>(`/v1/portfolio${q({ level })}`);
export const submitPaperOrder = (body: PaperTicket) => request<{ fill: PaperFill; book: PaperBook }>('/v1/portfolio/orders', body);
export const cancelPaperOrder = (fillId: string) =>
  request<PaperBook>(`/v1/portfolio/orders/${fillId}/cancel`, {});
export const getPaperAnalysis = () => request<PaperAnalysis>('/v1/portfolio/analysis', {});
