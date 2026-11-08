-- Personal spending budget, the emergency floor, and the savings commitment.
insert into finance_setting (key, value, label) values
  ('monthly_budget',  0, 'Personal spending money each month'),
  ('emergency_floor', 0, 'The savings line never to go below'),
  ('savings_first',   0, 'Saved every month before anything discretionary')
on conflict (key) do nothing;

-- Logged purchases. "spent this month" is summed from here, never typed.
create table if not exists purchase (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date not null default (now() at time zone 'utc')::date,
  description text not null,
  amount      numeric(12,2) not null check (amount >= 0),
  kind        text not null default 'want' check (kind in ('need','want')),
  -- what the adviser said at the time, so patterns are visible later
  advice      text,
  created_at  timestamptz not null default now()
);

create index if not exists purchase_spent_on_idx on purchase (spent_on desc);

alter table purchase enable row level security;

drop policy if exists purchase_read   on purchase;
drop policy if exists purchase_insert on purchase;
drop policy if exists purchase_delete on purchase;

create policy purchase_read   on purchase for select to authenticated using (true);
create policy purchase_insert on purchase for insert to authenticated with check (true);
create policy purchase_delete on purchase for delete to authenticated using (true);

-- upsert on finance_setting needs insert as well as the existing update policy
drop policy if exists finance_setting_insert on finance_setting;
create policy finance_setting_insert on finance_setting
  for insert to authenticated with check (true);
