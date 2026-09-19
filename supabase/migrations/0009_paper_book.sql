-- Educational paper book. Additive. Simulated fills only (no live brokerage).

alter table portfolios add column if not exists kind text not null default 'demo'
  check (kind in ('demo', 'paper'));
alter table portfolios add column if not exists cash_usd numeric not null default 0;
alter table portfolios add column if not exists starting_cash numeric not null default 0;
alter table portfolios add column if not exists level text
  check (level is null or level in ('beginner', 'intermediate', 'advanced'));

create unique index if not exists portfolios_one_paper
  on portfolios (user_id) where kind = 'paper';

create table if not exists paper_lots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('equity', 'option')),
  symbol text not null,
  quantity numeric not null,
  cost_basis numeric not null default 0,
  option_right text check (option_right is null or option_right in ('call', 'put')),
  option_strike numeric,
  option_expiry date,
  created_at timestamptz not null default now()
);
create index if not exists paper_lots_portfolio on paper_lots (portfolio_id);

create table if not exists paper_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell', 'short', 'cover')),
  quantity numeric not null,
  fill_price numeric,
  notional numeric,
  ticket_kind text not null check (ticket_kind in ('market', 'limit', 'stop')),
  limit_price numeric,
  status text not null check (status in ('filled', 'working', 'cancelled')),
  instrument_kind text not null default 'equity' check (instrument_kind in ('equity', 'option')),
  option_right text,
  option_strike numeric,
  option_expiry date,
  fact_id text,
  as_of_date date,
  data_mode text,
  filled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists paper_fills_user on paper_fills (user_id, filled_at desc);

alter table paper_lots enable row level security;
create policy own on paper_lots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table paper_fills enable row level security;
create policy own on paper_fills for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into tickers (symbol, name, asset_class, sector) values
  ('AAPL', 'Apple', 'stock', 'Technology'),
  ('MSFT', 'Microsoft', 'stock', 'Technology'),
  ('NVDA', 'Nvidia', 'stock', 'Semiconductors'),
  ('AMZN', 'Amazon', 'stock', 'Consumer discretionary'),
  ('GOOGL', 'Alphabet', 'stock', 'Communication services'),
  ('META', 'Meta Platforms', 'stock', 'Communication services'),
  ('TSLA', 'Tesla', 'stock', 'Consumer discretionary'),
  ('JPM', 'JPMorgan Chase', 'stock', 'Financials'),
  ('GS', 'Goldman Sachs', 'stock', 'Financials'),
  ('XOM', 'Exxon Mobil', 'stock', 'Energy'),
  ('DAL', 'Delta Air Lines', 'stock', 'Industrials'),
  ('TLT', 'iShares 20+Y Treasury ETF', 'stock', 'Bonds'),
  ('GLD', 'SPDR Gold ETF', 'stock', 'Gold'),
  ('XLK', 'Technology', 'sector_etf', 'Technology'),
  ('SMH', 'Semiconductors', 'sector_etf', 'Semiconductors'),
  ('XLF', 'Financials', 'sector_etf', 'Financials'),
  ('XLE', 'Energy', 'sector_etf', 'Energy'),
  ('XLV', 'Health care', 'sector_etf', 'Health care'),
  ('XLY', 'Consumer discretionary', 'sector_etf', 'Consumer discretionary')
on conflict (symbol) do nothing;
