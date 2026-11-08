-- JRL Finance — schema
-- Design note: we store FLOWS (what went in / came out each month), not running
-- totals. Totals, Chase, gain and monthly earnings are DERIVED in the view below.
-- That means correcting an old month automatically cascades through every later
-- month — no recalculation job, no drift.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- entries
create table if not exists monthly_entry (
  id                 uuid primary key default gen_random_uuid(),
  -- always the 1st of the month; one row per month
  period             date not null unique,

  -- IN (what you sent this month)
  tax_in             numeric(12,2) not null default 0 check (tax_in     >= 0),
  savings_in         numeric(12,2) not null default 0 check (savings_in >= 0),
  hl_in              numeric(12,2) not null default 0 check (hl_in      >= 0),

  -- OUT
  savings_out        numeric(12,2) not null default 0 check (savings_out >= 0),

  -- BALANCE you type from the HL app (null = not supplied this month)
  hl_portfolio_value numeric(12,2) check (hl_portfolio_value >= 0),

  -- audit trail
  raw_message        text,
  source             text not null default 'slack',
  slack_user         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists monthly_entry_period_idx on monthly_entry (period desc);

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists monthly_entry_touch on monthly_entry;
create trigger monthly_entry_touch before update on monthly_entry
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- settings
create table if not exists finance_setting (
  key   text primary key,
  value numeric not null,
  label text
);

insert into finance_setting (key, value, label) values
  ('benchmark_rate',      0.07, 'Assumed market return, used for the projection and the vs-market verdict'),
  ('chase_interest_rate', 4.50, 'Chase AER %')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- derived view
-- Everything the dashboard reads. One row per month, oldest first.
--
-- HL values are typed by hand, so a month can be missing one. We carry the last
-- value forward so the chart line stays continuous, but we DO NOT invent a gain
-- or an earnings figure for a month with no fresh reading — those come back null.
-- When the next real value arrives, its earnings are measured against the last
-- actual reading, net of everything contributed in between.
create or replace view monthly_finance as
with grouped as (
  select *,
    -- increments on every month that actually supplied a value
    count(hl_portfolio_value) over (order by period rows unbounded preceding) as vgrp
  from monthly_entry
),
running as (
  select g.*,
    sum(tax_in)                   over w as tax_total,
    sum(savings_in - savings_out) over w as savings_total,
    sum(hl_in)                    over w as hl_contributed
  from grouped g
  window w as (order by period rows between unbounded preceding and current row)
),
observed as (
  select r.*,
    -- the most recent actual reading at or before this month
    first_value(hl_portfolio_value) over (partition by vgrp order by period) as obs_value,
    -- what had been contributed as at that reading
    first_value(hl_contributed)     over (partition by vgrp order by period) as obs_contrib
  from running r
)
select
  period,
  to_char(period, 'FMMonth')                   as month_name,
  extract(year from period)::int               as year,
  tax_in, savings_in, hl_in, savings_out,
  tax_total,
  savings_total,
  hl_contributed,
  obs_value                                    as hl_value,
  (hl_portfolio_value is not null)             as hl_value_supplied,
  -- Chase is CALCULATED: the money still sitting in Chase, earning interest
  (savings_total + tax_total)                  as chase_total,
  -- headline: HL growth deliberately excluded
  (savings_total + tax_total + hl_contributed) as net_total,
  -- the hidden extra — only when this month has a real reading
  case when hl_portfolio_value is not null
       then obs_value - hl_contributed end     as hl_gain,
  -- pure market move since the last real reading, new money stripped out
  case when hl_portfolio_value is not null
            and lag(obs_value) over (order by period) is not null
       then obs_value
            - lag(obs_value)   over (order by period)
            - (obs_contrib - lag(obs_contrib) over (order by period))
       end                                     as hl_earnings_this_month
from observed
order by period;

-- CRITICAL: without this the view runs with its creator's rights and bypasses
-- the row-level security on monthly_entry — i.e. anyone with the anon key could
-- read every row. security_invoker makes it respect the caller's permissions.
alter view monthly_finance set (security_invoker = on);

-- ---------------------------------------------------------------- security
alter table monthly_entry   enable row level security;
alter table finance_setting enable row level security;

-- The dashboard reads with the anon key; the Edge Function writes with the
-- service-role key (which bypasses RLS). Read-only for everyone else.
drop policy if exists monthly_entry_read on monthly_entry;
create policy monthly_entry_read on monthly_entry for select using (true);

drop policy if exists finance_setting_read on finance_setting;
create policy finance_setting_read on finance_setting for select using (true);
