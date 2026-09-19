-- RAG hardening: FTS fallback when websearch_to_tsquery is empty, plus versioned chunks
-- so ingest can activate a new version without destroying cited chunk UUIDs.

alter table chunks add column if not exists version int not null default 1;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.chunks'::regclass
      and conname = 'chunks_document_id_chunk_index_key'
  ) then
    alter table chunks drop constraint chunks_document_id_chunk_index_key;
  end if;
end $$;

create unique index if not exists chunks_document_version_index_key
  on chunks (document_id, version, chunk_index);
create index if not exists chunks_document_version_idx on chunks (document_id, version);

-- Hybrid retrieval: pgvector cosine + Postgres full-text, fused with Reciprocal Rank Fusion.
-- websearch_to_tsquery can yield an empty query on punctuation-only input; fall back to plainto.
create or replace function match_chunks(
  query_embedding vector(1536),
  query_text text,
  p_layer text default null,
  p_concepts text[] default null,
  p_max_difficulty int default 3,
  p_published_after timestamptz default null,
  p_published_before timestamptz default null,
  match_count int default 20,
  rrf_k int default 60
)
returns table (
  id uuid, document_id text, chunk_index int, section_path text, content text,
  concept_ids text[], difficulty int, trust_level int, published_at timestamptz, layer text,
  similarity double precision, vector_rank bigint, text_rank bigint, rrf_score double precision
)
language sql stable security invoker
set search_path = public, extensions
as $$
  with filtered as (
    select c.* from chunks c
    where c.is_active and not c.injection_flag and c.embedding is not null
      and (p_layer is null or c.layer = p_layer)
      and (p_concepts is null or c.concept_ids && p_concepts)
      and (c.difficulty is null or c.difficulty <= p_max_difficulty)
      and (p_published_after is null or c.published_at >= p_published_after)
      and (p_published_before is null or c.published_at <= p_published_before)
  ),
  qraw as (
    select
      coalesce(query_text, '') as raw,
      websearch_to_tsquery('english', coalesce(query_text, '')) as web_q
  ),
  qparsed as (
    select case when web_q::text = '' then plainto_tsquery('english', raw) else web_q end as q
    from qraw
  ),
  v as (
    select f.id, row_number() over (order by f.embedding <=> query_embedding) as r
    from filtered f order by f.embedding <=> query_embedding limit 30
  ),
  t as (
    select f.id, row_number() over (order by ts_rank_cd(f.tsv, qp.q) desc) as r
    from filtered f
    cross join qparsed qp
    where qp.q::text <> '' and f.tsv @@ qp.q
    order by ts_rank_cd(f.tsv, qp.q) desc
    limit 30
  ),
  ids as (select id from v union select id from t)
  select f.id, f.document_id, f.chunk_index, f.section_path, f.content,
         f.concept_ids, f.difficulty, f.trust_level, f.published_at, f.layer,
         1 - (f.embedding <=> query_embedding) as similarity,
         v.r as vector_rank, t.r as text_rank,
         coalesce(1.0 / (rrf_k + v.r), 0) + coalesce(1.0 / (rrf_k + t.r), 0) as rrf_score
  from ids
  join filtered f on f.id = ids.id
  left join v on v.id = ids.id
  left join t on t.id = ids.id
  order by rrf_score desc
  limit match_count;
$$;

revoke all on function match_chunks from public, anon;
grant execute on function match_chunks to authenticated, service_role;

-- Flip chunk visibility and stamp documents.checksum/version together so a mid-batch
-- insert failure cannot point the document at missing chunks.
create or replace function activate_document_version(
  p_document_id text,
  p_version int,
  p_checksum text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from chunks where document_id = p_document_id and version = p_version
  ) then
    raise exception 'no chunks for document % version %', p_document_id, p_version;
  end if;
  update chunks
     set is_active = (version = p_version)
   where document_id = p_document_id;
  update documents
     set version = p_version,
         checksum = p_checksum,
         ingested_at = now(),
         is_active = true
   where id = p_document_id;
end;
$$;

revoke all on function activate_document_version(text, int, text) from public, anon, authenticated;
grant execute on function activate_document_version(text, int, text) to service_role;
