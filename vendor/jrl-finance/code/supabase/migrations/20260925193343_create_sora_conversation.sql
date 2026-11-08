-- One row per "ask": wake -> conversation -> Sora goes quiet
create table if not exists public.sora_conversation (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  trigger     text not null default 'wake'
              check (trigger in ('wake', 'alert', 'keyboard', 'phone')),
  summary     text not null,
  transcript  jsonb not null default '[]'::jsonb,  -- [{role: 'jack'|'sora'|'system', text, at}]
  actions     jsonb not null default '[]'::jsonb,  -- [{tool, label, input, ok, result, at}]
  created_at  timestamptz not null default now()
);

create index if not exists sora_conversation_started_idx
  on public.sora_conversation (started_at desc);

alter table public.sora_conversation enable row level security;

-- Same pattern as the rest of JRL: the logged-in dashboard can read and delete; only Sora (service role) writes
create policy sora_conversation_read on public.sora_conversation
  for select to authenticated using (true);
create policy sora_conversation_delete on public.sora_conversation
  for delete to authenticated using (true);
