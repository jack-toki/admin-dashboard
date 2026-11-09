-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit.
-- Additive only. Creates cockpit.outstanding_items.
-- Does not alter, drop, or rewrite any existing table, column, policy, or grant.
-- Does not touch the Google Sheet or the forecast.
-- Matches the private income table: row level security is enabled and forced, there are no
-- policies, and anon and authenticated have no privileges. service_role can select, insert,
-- and update. It cannot delete. Ticking an item sets done_at. The open list is done_at is null.
-- Do not run this until the owner approves it.

begin;

create table cockpit.outstanding_items (
  id text primary key,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cockpit.outstanding_items enable row level security;
alter table cockpit.outstanding_items force row level security;
revoke all on table cockpit.outstanding_items from public, anon, authenticated;
grant select, insert, update on table cockpit.outstanding_items to service_role;

commit;
