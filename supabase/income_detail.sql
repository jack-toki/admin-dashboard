-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit.
-- There is no income table today. plan_entries cannot store a source client and a schedule
-- without being added to the forecast. planning_evidence is an accounting note, not this store.
-- This file creates one new table. It does not update, delete, or rewrite any existing row.
-- Live cockpit tables have RLS on and forced, and no policies. anon and authenticated have no
-- schema access. service_role has schema usage and select, insert, update. This table matches that.
-- service_role is not granted delete. A removed source line is an update that sets deleted_at.
-- A known retainer needs a contract end. An import may say the end is unknown. It must not invent a date.
-- Do not run this until the owner approves it.

begin;

create table cockpit.income_detail_lines (
  id text primary key,
  layer text not null default 'detail' check (layer = 'detail'),
  version int not null default 1 check (version = 1),
  kind text not null check (kind in ('retainer', 'project', 'additional_cost')),
  party text not null,
  services text,
  amount_minor bigint,
  comment text,
  currency text not null default 'GBP' check (currency = 'GBP'),
  first_payment_month text,
  contract_end_date date,
  contract_end_unknown boolean not null default false,
  total_payments int check (total_payments is null or (total_payments >= 1 and total_payments <= 36)),
  observed_month text,
  source text not null default 'manual' check (source in ('manual', 'snapshot')),
  source_row_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_row_id),
  check (first_payment_month is null or first_payment_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  check (observed_month is null or observed_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  check (source_row_id is null or source_row_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$'),
  check (
    kind <> 'retainer'
    or (contract_end_unknown and source = 'snapshot' and contract_end_date is null)
    or (not contract_end_unknown and contract_end_date is not null)
  )
);

alter table cockpit.income_detail_lines enable row level security;
alter table cockpit.income_detail_lines force row level security;
revoke all on table cockpit.income_detail_lines from public, anon, authenticated;
grant select, insert, update on table cockpit.income_detail_lines to service_role;

commit;
