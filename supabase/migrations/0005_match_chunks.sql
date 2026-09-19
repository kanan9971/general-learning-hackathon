-- Hybrid retrieval: pgvector cosine + Postgres full-text, fused with Reciprocal Rank Fusion.
-- Filters run before ranking (fine at our KB size; revisit if chunks >> 100k).
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
  v as (
    select f.id, row_number() over (order by f.embedding <=> query_embedding) as r
    from filtered f order by f.embedding <=> query_embedding limit 30
  ),
  t as (
    select f.id, row_number() over (order by ts_rank_cd(f.tsv, q) desc) as r
    from filtered f, websearch_to_tsquery('english', coalesce(query_text, '')) q
    where f.tsv @@ q
    order by ts_rank_cd(f.tsv, q) desc limit 30
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
