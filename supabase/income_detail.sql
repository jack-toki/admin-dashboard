-- NOT APPLIED. Review only.
-- Client lines are not cockpit.plan_entries. An unmatched plan row is added to the
-- forecast. These rows must stay in their own table so they cannot change the
-- profit-and-loss aggregate until someone explicitly replaces that cell.
-- Do not run this against a live project.

begin;

create table if not exists cockpit.income_detail_lines (
  id text primary key,
  layer text not null default 'detail' check (layer = 'detail'),
  version int not null default 1,
  kind text not null check (kind in ('retainer', 'project', 'additional_cost')),
  party text not null,
  services text,
  amount_minor bigint,
  comment text,
  currency text not null default 'GBP',
  first_payment_month text,
  contract_end_date date,
  total_payments int,
  observed_month text,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

alter table cockpit.income_detail_lines enable row level security;
alter table cockpit.income_detail_lines force row level security;
revoke all on table cockpit.income_detail_lines from public, anon, authenticated;

commit;
