-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit.
-- Additive only. Creates four new tables. Does not alter or drop existing objects.
-- service_role can select, insert, and update. It cannot delete.
-- anon and authenticated have no privileges. Row level security is enabled and forced.

begin;

create table cockpit.sheet_sync_state (
  cell_key text primary key,
  source_cell text,
  last_value text,
  updated_at timestamptz not null default now()
);

create table cockpit.sheet_write_log (
  id text primary key,
  cell_key text not null,
  source_cell text,
  previous_value text,
  written_value text,
  action text not null check (action in ('write', 'conflict', 'skip')),
  reason text,
  created_at timestamptz not null default now()
);

create table cockpit.automation_rates (
  id text primary key,
  kind text not null check (kind in ('client', 'zap')),
  hourly_rate_minor int,
  minutes_per_run int,
  updated_at timestamptz not null default now(),
  check (
    (kind = 'client' and hourly_rate_minor is not null and hourly_rate_minor > 0 and minutes_per_run is null)
    or (kind = 'zap' and minutes_per_run is not null and minutes_per_run > 0 and minutes_per_run <= 240 and hourly_rate_minor is null)
  )
);

create table cockpit.outstanding_dismissals (
  id text primary key,
  task_key text not null,
  period text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  dismissed_at timestamptz not null default now()
);

alter table cockpit.sheet_sync_state enable row level security;
alter table cockpit.sheet_sync_state force row level security;
alter table cockpit.sheet_write_log enable row level security;
alter table cockpit.sheet_write_log force row level security;
alter table cockpit.automation_rates enable row level security;
alter table cockpit.automation_rates force row level security;
alter table cockpit.outstanding_dismissals enable row level security;
alter table cockpit.outstanding_dismissals force row level security;

revoke all on table cockpit.sheet_sync_state from public, anon, authenticated;
revoke all on table cockpit.sheet_write_log from public, anon, authenticated;
revoke all on table cockpit.automation_rates from public, anon, authenticated;
revoke all on table cockpit.outstanding_dismissals from public, anon, authenticated;

grant select, insert, update on table cockpit.sheet_sync_state to service_role;
grant select, insert, update on table cockpit.sheet_write_log to service_role;
grant select, insert, update on table cockpit.automation_rates to service_role;
grant select, insert, update on table cockpit.outstanding_dismissals to service_role;

commit;
