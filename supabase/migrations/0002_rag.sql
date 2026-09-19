-- RAG storage. Layers: 'foundation' (lessons) and 'market' (time-stamped news/releases).
-- Layer C (learner memory) is relational (concept_mastery), not vectors.
create table documents (
  id text primary key,
  version int not null default 1,
  title text not null,
  source text not null,
  source_url text,
  publisher text,
  author text,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  content_type text not null check (content_type in ('lesson','glossary','interview','news','release','statement')),
  layer text not null check (layer in ('foundation','market')),
  asset_class text,
  topics text[] not null default '{}',
  concept_ids text[] not null default '{}',
  difficulty int check (difficulty between 1 and 3),
  region text,
  market text,
  tickers text[] not null default '{}',
  indicator text,
  time_sensitivity text not null default 'evergreen' check (time_sensitivity in ('evergreen','days','intraday')),
  trust_level int not null default 4 check (trust_level between 1 and 4), -- 1 official ... 4 news
  checksum text,
  is_active boolean not null default true
);
create index on documents (layer, published_at desc);
create index on documents using gin (concept_ids);
create index on documents using gin (tickers);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id text not null references documents(id) on delete cascade,
  chunk_index int not null,
  section_path text,
  content text not null,
  token_count int,
  embedding vector(1536),
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  -- filter-critical fields copied from documents for fast pre-filtering
  layer text not null,
  concept_ids text[] not null default '{}',
  tickers text[] not null default '{}',
  difficulty int,
  trust_level int not null default 4,
  published_at timestamptz,
  is_active boolean not null default true,
  injection_flag boolean not null default false,
  unique (document_id, chunk_index)
);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_tsv_idx on chunks using gin (tsv);
create index on chunks using gin (concept_ids);
create index on chunks (layer, published_at desc);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null references concepts(id),
  content jsonb not null,
  cited_chunk_ids uuid[] not null default '{}',
  insufficient_evidence boolean not null default false,
  created_at timestamptz not null default now()
);
create index on lessons (user_id, created_at desc);
