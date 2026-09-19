-- Run this once in Supabase -> SQL Editor.
create table if not exists runs (
  id         bigint generated always as identity primary key,
  account    text not null,
  zap_id     text,
  zap_title  text,
  ts         timestamptz not null default now(),
  counts     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists runs_account_ts_idx on runs (account, ts);
