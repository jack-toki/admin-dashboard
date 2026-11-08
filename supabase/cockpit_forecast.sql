-- NOT APPLIED. One transaction for every new cockpit object.
-- Target, only after the service host is verified: toki-admin-dash
-- project ref hcjybjpimqzsueyslxvl, region eu-west-1.
-- Do not run this against personal JRL uxkpqmyzxtjmmixlycio
-- or the excluded AA project cvtqeyqgjuvpktwbiziq.
-- The existing runs table is not modified. Its row security is on and it has
-- no policies, so anon and authenticated rows are denied, but TRUNCATE is
-- granted and row security does not cover TRUNCATE. Leave that grant for a
-- separate change.
--
-- public default privileges on this database grant broad rights to new public
-- tables, functions, and sequences. Row security alone does not remove
-- TRUNCATE or those grants. These objects live in schema cockpit, which is
-- not an exposed Data API schema until that setting is confirmed.
-- anon and authenticated receive no usage and no table rights.
-- service_role can select, insert, and update. It cannot delete or truncate.
-- The API host from get_project_url is https://hcjybjpimqzsueyslxvl.supabase.co.
-- The inherited Vercel host is not verified by that lookup. GET /api/cockpit/target
-- compares the runtime URL and service-role key claim with this ref and returns
-- only match or mismatch. It does not return the URL or the key.
-- .schema('cockpit') is not a working route until cockpit is added to Data API
-- Exposed schemas, keeping every schema already listed. Do not run ALTER ROLE.
-- Do not grant anon or authenticated. A publishable key is not the server key.
-- Leave COCKPIT_DB_SCHEMA unset until that setting is done. This file is not applied.

begin;

create schema if not exists cockpit;

revoke all on schema cockpit from public;
revoke all on schema cockpit from anon;
revoke all on schema cockpit from authenticated;
grant usage on schema cockpit to service_role;

alter default privileges in schema cockpit revoke all on tables from public;
alter default privileges in schema cockpit revoke all on tables from anon;
alter default privileges in schema cockpit revoke all on tables from authenticated;
alter default privileges in schema cockpit revoke all on sequences from public;
alter default privileges in schema cockpit revoke all on sequences from anon;
alter default privileges in schema cockpit revoke all on sequences from authenticated;
alter default privileges in schema cockpit revoke all on functions from public;
alter default privileges in schema cockpit revoke all on functions from anon;
alter default privileges in schema cockpit revoke all on functions from authenticated;

create table if not exists cockpit.app_oauth_tokens (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('xero', 'google')),
  tenant_key text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, tenant_key)
);

create table if not exists cockpit.automation_registry (
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

create table if not exists cockpit.automation_events (
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

create table if not exists cockpit.plan_entries (
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

create table if not exists cockpit.login_attempts (
  id bigint generated always as identity primary key,
  subject text not null,
  failed_at timestamptz not null default now()
);

create index if not exists login_attempts_subject_idx on cockpit.login_attempts (subject, failed_at);

create table if not exists cockpit.zapier_account_access (
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

create table if not exists cockpit.forecast_snapshots (
  snapshot_hash text primary key,
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  record_count int not null,
  period_count int not null,
  source_row_count int not null,
  value_count int not null,
  blank_count int not null,
  zero_count int not null,
  group_null_count int not null,
  acquired_at timestamptz,
  imported_at timestamptz not null default now()
);

create table if not exists cockpit.forecast_baseline_cells (
  id text primary key,
  snapshot_hash text not null references cockpit.forecast_snapshots (snapshot_hash),
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  source_cell text not null,
  source_row int not null,
  label text not null,
  period date not null,
  scenario text not null default 'forecast' check (scenario = 'forecast'),
  cell_state text not null check (cell_state in ('blank', 'zero', 'value')),
  value_minor bigint,
  currency text not null default 'GBP',
  group_id text,
  user_entered jsonb,
  displayed text,
  source_hash text not null,
  is_actual boolean not null default false check (is_actual = false),
  imported_at timestamptz not null default now(),
  unique (source_workbook_id, source_sheet_id, source_cell, period),
  check (
    (cell_state = 'blank' and value_minor is null)
    or (cell_state = 'zero' and value_minor = 0)
    or (cell_state = 'value' and value_minor is not null and value_minor <> 0)
  )
);

revoke all on all tables in schema cockpit from public, anon, authenticated;
revoke all on all sequences in schema cockpit from public, anon, authenticated;
revoke all on all functions in schema cockpit from public, anon, authenticated;
grant select, insert, update on all tables in schema cockpit to service_role;
grant usage, select on all sequences in schema cockpit to service_role;

alter table cockpit.app_oauth_tokens enable row level security;
alter table cockpit.app_oauth_tokens force row level security;
alter table cockpit.automation_registry enable row level security;
alter table cockpit.automation_registry force row level security;
alter table cockpit.automation_events enable row level security;
alter table cockpit.automation_events force row level security;
alter table cockpit.plan_entries enable row level security;
alter table cockpit.plan_entries force row level security;
alter table cockpit.login_attempts enable row level security;
alter table cockpit.login_attempts force row level security;
alter table cockpit.zapier_account_access enable row level security;
alter table cockpit.zapier_account_access force row level security;
alter table cockpit.forecast_snapshots enable row level security;
alter table cockpit.forecast_snapshots force row level security;
alter table cockpit.forecast_baseline_cells enable row level security;
alter table cockpit.forecast_baseline_cells force row level security;

commit;
