-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit.
-- finance_target.tracks is net, savings, tax, chase, or hl. Those tracks cannot hold
-- Lifestyle, Short-term savings, Emergency fund, and Long-term investments as four pots.
-- This is one new preferences row. It is not a ledger allocation and it writes no JRL table.
-- service_role gets select, insert, and update, matching the other cockpit tables. No delete grant.
-- Do not run this until the owner approves it.

begin;

create table cockpit.jrl_pot_preferences (
  id boolean primary key default true check (id),
  version int not null default 1 check (version = 1),
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table cockpit.jrl_pot_preferences enable row level security;
alter table cockpit.jrl_pot_preferences force row level security;
revoke all on table cockpit.jrl_pot_preferences from public, anon, authenticated;
grant select, insert, update on table cockpit.jrl_pot_preferences to service_role;

commit;
