-- Long-term learning cycle + daily sessions. Additive only.
-- The roadmap is the cycle (weeks); the unit of progress is the daily session.

create table learning_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_on date not null,
  level text not null check (level in ('beginner','intermediate','advanced')),
  phases jsonb not null,            -- [{index,title,theme,topics:[node ids]}], frozen at creation
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on learning_cycles (user_id, is_active, created_at desc);

create table daily_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references learning_cycles(id) on delete set null,
  session_date date not null,
  is_market_day boolean not null,
  phase_index int not null,
  day_in_phase int not null,
  focus_node_id text not null,
  theme text not null,
  tasks jsonb not null,             -- [{id,kind,title,minutes,status,result,done_at}]
  minutes_planned int not null default 0,
  minutes_done int not null default 0,
  goal_met boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, session_date)
);
create index on daily_sessions (user_id, session_date desc);

alter table learning_cycles enable row level security;
create policy own on learning_cycles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table daily_sessions enable row level security;
create policy own on daily_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
