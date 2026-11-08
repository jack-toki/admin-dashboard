create table if not exists public.sora_alerts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  source           text not null,
  severity         text not null default 'error'
                   check (severity in ('critical', 'error', 'info')),
  title            text not null,
  detail           text,
  context          jsonb,
  occurrences      integer not null default 1,
  status           text not null default 'open'
                   check (status in ('open', 'pushed', 'acknowledged', 'resolved')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  pushed_at        timestamptz,
  acknowledged_at  timestamptz,
  resolved_at      timestamptz
);

create index if not exists sora_alerts_due_idx
  on public.sora_alerts (status, next_attempt_at);

alter table public.sora_alerts enable row level security;

-- Dashboard can read alerts (same pattern as the rest of JRL); only the edge function writes
create policy sora_alerts_read on public.sora_alerts
  for select to authenticated using (true);
