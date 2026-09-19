-- Row-level security. The service role bypasses RLS (cron/ingest only).
-- Reference data: readable by any signed-in user, writable only by service role.
alter table tickers enable row level security;
alter table market_snapshots enable row level security;
alter table daily_briefs enable row level security;
alter table concepts enable row level security;
alter table concept_edges enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
create policy read_auth on tickers for select to authenticated using (true);
create policy read_auth on market_snapshots for select to authenticated using (true);
create policy read_auth on daily_briefs for select to authenticated using (true);
create policy read_auth on concepts for select to authenticated using (true);
create policy read_auth on concept_edges for select to authenticated using (true);
create policy read_auth on documents for select to authenticated using (is_active);
create policy read_auth on chunks for select to authenticated using (is_active and not injection_flag);

-- User-owned tables: own rows only.
alter table profiles enable row level security;
create policy own on profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['portfolios','challenges','responses','evaluations','lessons','concept_mastery','mastery_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy own on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table positions enable row level security;
create policy own on positions for all to authenticated
  using (exists (select 1 from portfolios p where p.id = portfolio_id and p.user_id = auth.uid()))
  with check (exists (select 1 from portfolios p where p.id = portfolio_id and p.user_id = auth.uid()));

-- llm_calls: no policies => service role only.
alter table llm_calls enable row level security;
