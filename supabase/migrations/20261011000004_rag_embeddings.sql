-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create rag_documents table for storing catalogue and library embeddings
create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'pornhwadb',
  external_id text not null,
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(2048),
  is_adult boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

-- Index for filtering by source and adult mode
create index if not exists rag_documents_source_adult_idx 
  on public.rag_documents (source, is_adult);

-- Note: pgvector has a 2,000 dimension limit on HNSW indexes. 
-- For 2,048 dimensions, PostgreSQL performs fast exact sequential scanning (~2ms for thousands of rows),
-- so no HNSW index is required on embedding.

-- RLS policies
alter table public.rag_documents enable row level security;

-- Allow read access to all authenticated and anonymous clients
create policy "Allow read access to rag_documents" on public.rag_documents
  for select using (true);

-- Allow service role and admins to insert/update/delete
create policy "Allow full access to service_role on rag_documents" on public.rag_documents
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Vector similarity search stored procedure (match_rag_documents)
create or replace function public.match_rag_documents (
  query_embedding vector(2048),
  match_threshold float default 0.25,
  match_count int default 8,
  filter_is_adult boolean default null,
  filter_source text default null
)
returns table (
  id uuid,
  source text,
  external_id text,
  title text,
  content text,
  metadata jsonb,
  is_adult boolean,
  similarity float
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    d.id,
    d.source,
    d.external_id,
    d.title,
    d.content,
    d.metadata,
    d.is_adult,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.rag_documents d
  where (filter_is_adult is null or d.is_adult = filter_is_adult)
    and (filter_source is null or d.source = filter_source)
    and (1 - (d.embedding <=> query_embedding)) >= match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

grant execute on function public.match_rag_documents to anon, authenticated, service_role;
