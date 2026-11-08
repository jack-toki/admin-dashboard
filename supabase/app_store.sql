-- Operator-applied schema for the cockpit. This file is not run by the app,
-- by tests, or by deployment. Apply it yourself in the Supabase SQL editor
-- when you want a shared store. Until then the app reports storage as not configured.
--
-- The service role is the only intended reader. Row level security is on and
-- no anon or authenticated policies are granted.

create table if not exists app_oauth_tokens (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('xero', 'google')),
  tenant_key text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, tenant_key)
);

create table if not exists automation_registry (
  id bigint generated always as identity primary key,
  account_slug text not null,
  zap_id text not null,
  title text not null,
  account_name text,
  client_name text,
  owner_name text,
  created_at timestamptz not null default now(),
  unique (account_slug, zap_id)
);

create table if not exists automation_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  account_slug text not null,
  zap_id text not null,
  run_id text,
  stage_id text,
  attempt int not null default 1,
  status text not null check (status in ('success', 'failure')),
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists plan_entries (
  id text primary key,
  area text not null default 'toki' check (area = 'toki'),
  kind text not null check (kind in ('sale', 'cost')),
  provenance text not null check (provenance in ('manual_plan', 'scenario')),
  amount_minor bigint not null,
  currency text not null,
  month text not null,
  party text not null,
  group_id text not null,
  timing text not null,
  duration_months int,
  probability numeric,
  stage text,
  attestation text not null,
  attestation_source text not null default 'manual',
  xero_verified boolean not null default false,
  external_ref text,
  match_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  subject text not null,
  failed_at timestamptz not null default now()
);

create index if not exists login_attempts_subject_idx on login_attempts (subject, failed_at);

-- Zapier account visibility. A row means the account id was selectable, not that it is a client.
-- Removal sets missing_at. Rows are not deleted.
create table if not exists zapier_account_access (
  zapier_account_id text primary key,
  access_state text not null,
  role_state text not null,
  identity_state text not null,
  client_slug text,
  label_snapshot text,
  reporting text not null default 'unmonitored',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  missing_at timestamptz
);

alter table app_oauth_tokens enable row level security;
alter table automation_registry enable row level security;
alter table automation_events enable row level security;
alter table plan_entries enable row level security;
alter table login_attempts enable row level security;
alter table zapier_account_access enable row level security;
