-- NOT APPLIED. Review only. Do not run this against a live project.
-- The existing finance_target.tracks check is net, savings, tax, chase, or hl.
-- That list cannot store Lifestyle, Short-term savings, Emergency fund, and
-- Long-term investments as four separate pots without putting one balance in two places.
-- This table is a cockpit preference. It is not a ledger allocation and it does not
-- read personal rows. The app does not apply it.

begin;

create table if not exists cockpit.jrl_pot_preferences (
  id boolean primary key default true check (id),
  version int not null default 1,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table cockpit.jrl_pot_preferences enable row level security;
alter table cockpit.jrl_pot_preferences force row level security;
revoke all on table cockpit.jrl_pot_preferences from public, anon, authenticated;

commit;
