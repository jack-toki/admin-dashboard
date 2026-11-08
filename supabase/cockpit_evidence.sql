-- NOT APPLIED. Additive evidence for the cockpit schema.
-- Does not recreate or copy forecast_baseline_cells.
-- Does not change the 377-cell snapshot.
-- Does not store the 21-tab workbook archive or the personal tracker.
-- Does not change public.runs or the profiles CSV used by the public dashboard.
-- anon and authenticated receive no grants. Row security is forced.

begin;

create table if not exists cockpit.accounting_periods (
  period date primary key,
  coverage text not null check (coverage in ('complete_export', 'partial_export', 'missing')),
  basis text not null default 'unknown' check (basis in ('unknown', 'cash', 'accrual')),
  currency text not null default 'GBP',
  notes text
);

create table if not exists cockpit.accounting_lines (
  id text primary key,
  period date not null references cockpit.accounting_periods (period),
  account_label text not null,
  group_id text,
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  source_cell text not null,
  role text not null check (role in ('account', 'subtotal', 'tax', 'profit')),
  amount_minor bigint,
  exact_numeric text,
  source_cell_state text not null,
  coverage text not null,
  cash_received_proven boolean not null default false,
  source_hash text not null,
  unique (source_workbook_id, source_sheet_id, source_cell),
  check (exact_numeric is null or exact_numeric ~ '^-?[0-9]+(\.[0-9]+)?$'),
  check (
    (coverage = 'missing' and amount_minor is null and exact_numeric is null)
    or coverage in ('complete_export', 'partial_export')
  )
);

create table if not exists cockpit.forecast_scenario_cells (
  id text primary key,
  scenario_id text not null,
  label text not null,
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  source_cell text not null,
  source_row int not null,
  period date,
  role text not null check (role in ('input', 'salary_plan', 'unlabelled_note')),
  amount_minor bigint,
  exact_numeric text,
  cell_state text not null,
  is_primary boolean not null default false check (is_primary = false),
  is_actual boolean not null default false check (is_actual = false),
  source_hash text not null,
  unique (scenario_id, source_cell),
  check (source_sheet_id <> 1455407915),
  check (exact_numeric is null or exact_numeric ~ '^-?[0-9]+(\.[0-9]+)?$')
);

create table if not exists cockpit.reconciliation_evidence (
  id text primary key,
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  source_cell text not null,
  role text not null check (role in ('annual_total', 'derived_metric')),
  exact_numeric text,
  amount_minor bigint,
  include_in_operational_sum boolean not null default false check (include_in_operational_sum = false),
  source_hash text not null,
  unique (source_sheet_id, source_cell),
  check (exact_numeric is null or exact_numeric ~ '^-?[0-9]+(\.[0-9]+)?$')
);

create table if not exists cockpit.invoice_evidence (
  id text primary key,
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  source_row int not null,
  invoice_number text,
  invoice_date date,
  due_date date,
  paid_minor bigint,
  due_minor bigint,
  source_status text,
  cash_claim text not null check (cash_claim in ('source_marked_paid', 'not_proven')),
  party_private text,
  evidence_is_live_xero boolean not null default false check (evidence_is_live_xero = false),
  source_hash text not null,
  unique (source_sheet_id, source_row)
);

create table if not exists cockpit.planning_evidence (
  id text primary key,
  source_workbook_id text not null,
  source_sheet_id bigint not null,
  source_cell text not null,
  plan_kind text not null check (plan_kind in ('monthly_client', 'pipeline', 'expected_invoice', 'reconciliation_note', 'additional_cost')),
  source_row int,
  period date,
  party_private text,
  amount_minor bigint,
  exact_numeric text,
  probability_exact text,
  status text,
  linked_primary_ref text,
  is_actual boolean not null default false check (is_actual = false),
  source_hash text not null,
  unique (source_sheet_id, source_cell, plan_kind),
  check (exact_numeric is null or exact_numeric ~ '^-?[0-9]+(\.[0-9]+)?$'),
  check (probability_exact is null or probability_exact ~ '^-?[0-9]+(\.[0-9]+)?$')
);

revoke all on table cockpit.accounting_periods from public, anon, authenticated;
revoke all on table cockpit.accounting_lines from public, anon, authenticated;
revoke all on table cockpit.forecast_scenario_cells from public, anon, authenticated;
revoke all on table cockpit.reconciliation_evidence from public, anon, authenticated;
revoke all on table cockpit.invoice_evidence from public, anon, authenticated;
revoke all on table cockpit.planning_evidence from public, anon, authenticated;
grant select, insert, update on table cockpit.accounting_periods to service_role;
grant select, insert, update on table cockpit.accounting_lines to service_role;
grant select, insert, update on table cockpit.forecast_scenario_cells to service_role;
grant select, insert, update on table cockpit.reconciliation_evidence to service_role;
grant select, insert, update on table cockpit.invoice_evidence to service_role;
grant select, insert, update on table cockpit.planning_evidence to service_role;

alter table cockpit.accounting_periods enable row level security;
alter table cockpit.accounting_periods force row level security;
alter table cockpit.accounting_lines enable row level security;
alter table cockpit.accounting_lines force row level security;
alter table cockpit.forecast_scenario_cells enable row level security;
alter table cockpit.forecast_scenario_cells force row level security;
alter table cockpit.reconciliation_evidence enable row level security;
alter table cockpit.reconciliation_evidence force row level security;
alter table cockpit.invoice_evidence enable row level security;
alter table cockpit.invoice_evidence force row level security;
alter table cockpit.planning_evidence enable row level security;
alter table cockpit.planning_evidence force row level security;

commit;
