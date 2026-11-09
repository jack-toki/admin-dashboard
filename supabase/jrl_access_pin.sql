-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit.
-- Additive only. Creates cockpit.jrl_access_pin.
-- Does not alter or drop any existing table. Does not store the PIN in clear text.
-- A missing row, or a null pin_hash, means the PIN is off and the cockpit session opens JRL.
-- Row level security is enabled and forced. anon and authenticated have no privileges.
-- service_role can select, insert, and update. It cannot delete. Clearing the PIN sets pin_hash null.

begin;

create table cockpit.jrl_access_pin (
  id boolean primary key default true check (id = true),
  pin_hash text,
  updated_at timestamptz not null default now(),
  check (pin_hash is null or char_length(pin_hash) between 20 and 400)
);

alter table cockpit.jrl_access_pin enable row level security;
alter table cockpit.jrl_access_pin force row level security;
revoke all on table cockpit.jrl_access_pin from public, anon, authenticated;
grant select, insert, update on table cockpit.jrl_access_pin to service_role;

commit;
