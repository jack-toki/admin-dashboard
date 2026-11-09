-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit.
-- Additive only. Creates cockpit.cockpit_sign_in_code for the 4-digit cockpit code.
-- Does not alter jrl_access_pin or any other table. Does not store the code in clear text.
-- A missing row means no code is set, and the existing password still signs in.
-- Row level security is enabled and forced. anon and authenticated have no privileges.
-- service_role can select, insert, and update. It cannot delete.

begin;

create table cockpit.cockpit_sign_in_code (
  id boolean primary key default true check (id = true),
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  check (char_length(pin_hash) between 20 and 400)
);

alter table cockpit.cockpit_sign_in_code enable row level security;
alter table cockpit.cockpit_sign_in_code force row level security;
revoke all on table cockpit.cockpit_sign_in_code from public, anon, authenticated;
grant select, insert, update on table cockpit.cockpit_sign_in_code to service_role;

commit;
