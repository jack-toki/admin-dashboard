-- Sora's web research jobs: product lookups Jack approves on his phone, and general research
create table if not exists public.sora_research (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  query        text not null,
  kind         text not null default 'general' check (kind in ('product', 'general')),
  status       text not null default 'running'
               check (status in ('running', 'done', 'failed', 'approved', 'rejected')),
  summary      text,
  result       jsonb,            -- product: {options:[{title,price,currency,retailer,url,why}]}; general: {sources:[...]}
  chosen_index integer          -- which product option Jack approved
);
create index if not exists sora_research_created_idx on public.sora_research (created_at desc);
alter table public.sora_research enable row level security;
create policy sora_research_read on public.sora_research for select to authenticated using (true);
create policy sora_research_delete on public.sora_research for delete to authenticated using (true);
