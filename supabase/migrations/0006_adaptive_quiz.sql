-- Adaptive infinite quiz: preferences, sessions, questions, attempts.
-- Additive only. Reuses concept_mastery / mastery_events; links attempts as evidence.

create table learner_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_formats text[] not null default '{}',
  preferred_concept_ids text[] not null default '{}',
  custom_topics text[] not null default '{}',
  level text not null default 'beginner'
    check (level in ('beginner','intermediate','advanced')),
  updated_at timestamptz not null default now()
);

create table quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','ended')),
  formats text[] not null,
  concept_ids text[] not null default '{}',
  custom_topics text[] not null default '{}',
  level text not null check (level in ('beginner','intermediate','advanced')),
  answered_count int not null default 0,
  correct_count int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on quiz_sessions (user_id, started_at desc);
create index on quiz_sessions (user_id, status);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence int not null,
  status text not null default 'ready'
    check (status in ('ready','current','answered','skipped')),
  format text not null
    check (format in ('mcq','case_study','short_answer','analysis')),
  skill text not null default 'causal_chain',
  difficulty int not null check (difficulty between 1 and 3),
  concept_ids text[] not null default '{}',
  custom_topic text,
  prompt text not null,
  -- Public payload for the client (options without correctness, case context, etc.)
  public_payload jsonb not null default '{}',
  -- Private grading material. MCQ correct option is stored as HMAC hex, never plaintext.
  private_payload jsonb not null default '{}',
  prompt_version text,
  model text,
  generated_by text not null default 'llm'
    check (generated_by in ('llm','fallback')),
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);
create index on quiz_questions (session_id, status, sequence);
create index on quiz_questions (user_id, created_at desc);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer jsonb not null,
  observed text not null check (observed in ('correct','partial','incorrect')),
  score int not null check (score between 0 and 100),
  feedback jsonb not null default '{}',
  grading_status text not null default 'complete'
    check (grading_status in ('pending','complete','failed')),
  model text,
  prompt_version text,
  submitted_at timestamptz not null default now(),
  unique (question_id)
);
create index on quiz_attempts (user_id, submitted_at desc);
create index on quiz_attempts (session_id, submitted_at);

-- Allow mastery_events to reference quiz attempts (in addition to evaluations).
alter table mastery_events
  add column if not exists quiz_attempt_id uuid references quiz_attempts(id) on delete set null;

-- RLS: own rows only.
alter table learner_preferences enable row level security;
create policy own on learner_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table quiz_sessions enable row level security;
create policy own on quiz_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table quiz_questions enable row level security;
create policy own on quiz_questions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table quiz_attempts enable row level security;
create policy own on quiz_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
