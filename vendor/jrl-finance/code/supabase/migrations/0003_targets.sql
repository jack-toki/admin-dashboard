-- JRL Finance — savings targets.

create table if not exists finance_target (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),

  -- which figure this target is measured against
  tracks        text not null default 'net'
                check (tracks in ('net', 'savings', 'tax', 'chase', 'hl')),

  -- optional: the month you want it by ('YYYY-MM-01')
  target_date   date,
  -- optional: what you reckon you'll put away each month
  monthly_plan  numeric(12,2) check (monthly_plan >= 0),
  -- assumed annual growth on this pot (0.045 = 4.5%)
  growth_rate   numeric(6,4) not null default 0,

  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists finance_target_touch on finance_target;
create trigger finance_target_touch before update on finance_target
  for each row execute function touch_updated_at();

alter table finance_target enable row level security;

drop policy if exists finance_target_read   on finance_target;
drop policy if exists finance_target_insert on finance_target;
drop policy if exists finance_target_update on finance_target;
drop policy if exists finance_target_delete on finance_target;

create policy finance_target_read   on finance_target for select to authenticated using (true);
create policy finance_target_insert on finance_target for insert to authenticated with check (true);
create policy finance_target_update on finance_target for update to authenticated using (true) with check (true);
create policy finance_target_delete on finance_target for delete to authenticated using (true);
