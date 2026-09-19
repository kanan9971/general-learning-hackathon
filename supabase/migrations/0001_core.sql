-- Core app tables. Additive only during the hackathon: never edit once applied.
create extension if not exists vector;
create extension if not exists pgcrypto;

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  level text not null check (level in ('beginner','intermediate','advanced')),
  background text,
  goal text not null check (goal in ('st_prep','investing','both')),
  target_desk text not null check (target_desk in ('macro','rates','equities','fx','general')),
  asset_prefs text[] not null default '{}',
  daily_minutes int not null default 10,
  created_at timestamptz not null default now()
);

create table tickers (
  symbol text primary key,
  name text not null,
  asset_class text not null,
  sector text,
  is_proxy boolean not null default false,
  proxy_for text
);

create table market_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  captured_at timestamptz not null default now(),
  data_mode text not null check (data_mode in ('live','cache','demo')),
  source text not null,
  facts jsonb not null,
  unique (as_of_date, data_mode)
);
create index on market_snapshots (as_of_date desc);

create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null unique,
  snapshot_id uuid references market_snapshots(id),
  events jsonb not null,
  status text not null default 'ready',
  model text,
  prompt_version text,
  generated_at timestamptz not null default now()
);

create table concepts (
  id text primary key,           -- slug, e.g. 'real-yields'
  name text not null,
  asset_class text,
  level text not null check (level in ('beginner','intermediate','advanced')),
  summary text
);
create table concept_edges (
  from_id text references concepts(id) on delete cascade,
  to_id text references concepts(id) on delete cascade,
  relation text not null check (relation in ('prerequisite','related')),
  primary key (from_id, to_id)
);

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on portfolios (user_id);

create table positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  symbol text not null references tickers(symbol),
  quantity numeric not null,
  cost_basis numeric
);
create index on positions (portfolio_id);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_id uuid not null references daily_briefs(id),
  event_id text not null,
  question jsonb not null,
  difficulty int not null,
  prompt_version text,
  created_at timestamptz not null default now(),
  unique (user_id, brief_id)
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_text text not null,
  word_count int not null,
  parent_response_id uuid references responses(id),
  submitted_at timestamptz not null default now()
);
create index on responses (user_id, submitted_at desc);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rubric jsonb not null,
  overall_score int not null,          -- computed server-side
  retrieved_chunk_ids uuid[] not null default '{}',
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);
create index on evaluations (response_id);

create table concept_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null references concepts(id),
  mastery numeric not null default 0 check (mastery between 0 and 1),
  confidence numeric not null default 0 check (confidence between 0 and 1),
  attempts int not null default 0,
  correct int not null default 0,
  misconceptions jsonb not null default '[]',
  box int not null default 1 check (box between 1 and 5),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  max_difficulty int not null default 1,
  primary key (user_id, concept_id)
);
create index on concept_mastery (user_id, next_review_at);

create table mastery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null references concepts(id),
  delta numeric not null,
  reason text not null,
  evaluation_id uuid references evaluations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on mastery_events (user_id, concept_id);

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  route text not null,
  model text,
  prompt_version text,
  latency_ms int,
  ok boolean not null,
  input_tokens int,
  output_tokens int,
  error text,
  created_at timestamptz not null default now()
);
create index on llm_calls (created_at);
