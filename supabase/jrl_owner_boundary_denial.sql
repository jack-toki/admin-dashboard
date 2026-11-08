-- NOT APPLIED. Offline denial fixture for a reviewer after jrl_owner_boundary.sql.
-- Do not run this until that script has been approved and applied in a review session.
-- It selects counts only. Do not select the row bodies. It does not print emails, keys, or the owner uuid.
-- A zero count is the expected denial. It is not proof by itself that the ledger is empty.
-- The role switch is inside this transaction. SET LOCAL outside a transaction does not stick.
-- Permission errors are caught. They do not abort the owner checks.
-- auth.uid() must resolve from the jwt claims set below.

-- Preflight metadata the reviewer compares with the 2026-11-08 audit.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research', 'monthly_finance', 'jrl_owner_pin'
  )
order by c.relname;

select tablename, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research', 'jrl_owner_pin'
  )
order by tablename, cmd;

begin;

do $$
declare
  asserts int := 0;
  owner text;
  changed int;
  seen int;
  spec record;
  excess int;
begin
  select owner_sub::text into owner from public.jrl_owner_pin where id;
  if owner is null then
    raise exception 'denial_pin_missing';
  end if;
  perform set_config('jrl.review_owner_sub', owner, true);
  insert into public.sora_conversation (started_at, ended_at, summary) values (now(), now(), 'seed probe');
  insert into public.sora_research (query) values ('seed probe');

  if current_setting('server_version_num')::int < 170000 then
    raise exception 'denial_pg17_required';
  end if;

  select count(*) into excess
  from (
    values
      ('monthly_entry'), ('finance_setting'), ('finance_target'), ('purchase'),
      ('sora_conversation'), ('sora_alerts'), ('sora_research')
  ) as tables(name)
  where has_table_privilege('authenticated', format('public.%I', tables.name), 'TRUNCATE')
     or has_table_privilege('authenticated', format('public.%I', tables.name), 'TRIGGER')
     or has_table_privilege('authenticated', format('public.%I', tables.name), 'REFERENCES')
     or has_table_privilege('authenticated', format('public.%I', tables.name), 'MAINTAIN');
  if excess <> 0 then
    raise exception 'denial_excess_privilege';
  end if;
  asserts := asserts + 28;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'monthly_entry_touch' and tgenabled = 'O' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_target_touch' and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'denial_trigger_missing';
  end if;
  asserts := asserts + 2;

  if exists (
    select 1
    from pg_rewrite rw
    join pg_class v on v.oid = rw.ev_class
    join pg_namespace vn on vn.oid = v.relnamespace
    join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
    join pg_class ref on ref.oid = d.refobjid
    where vn.nspname = 'public'
      and v.relname = 'monthly_finance'
      and ref.relkind in ('r', 'p', 'v', 'm', 'f')
      and ref.oid <> v.oid
      and ref.relname <> 'monthly_entry'
  ) then
    raise exception 'denial_view_dependency';
  end if;
  asserts := asserts + 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('app.jrl_owner_sub', owner, true);
  if public.jrl_is_owner() then
    raise exception 'denial_other_is_owner';
  end if;
  asserts := asserts + 1;

  for spec in
    select * from (values
      ('monthly_entry_other_owner', 'public.monthly_entry'),
      ('finance_setting_other_owner', 'public.finance_setting'),
      ('finance_target_other_owner', 'public.finance_target'),
      ('purchase_other_owner', 'public.purchase'),
      ('sora_conversation_other_owner', 'public.sora_conversation'),
      ('sora_research_other_owner', 'public.sora_research'),
      ('sora_alerts_other_owner', 'public.sora_alerts'),
      ('monthly_finance_other_owner', 'public.monthly_finance')
    ) as counts(label, relation)
  loop
    execute format('select count(*) from %s', spec.relation) into seen;
    if seen <> 0 then
      raise exception 'denial_other_saw_rows';
    end if;
    asserts := asserts + 1;
  end loop;

  for spec in
    select * from (values
      ('public.monthly_entry'), ('public.finance_target'), ('public.finance_setting'),
      ('public.purchase'), ('public.sora_conversation'), ('public.sora_research'), ('public.sora_alerts')
    ) as relations(relation)
  loop
    begin
      execute format('truncate table %s', spec.relation);
      raise exception 'denial_truncate_succeeded';
    exception
      when insufficient_privilege then
        asserts := asserts + 1;
      when others then
        if sqlerrm = 'denial_truncate_succeeded' then raise; end if;
        raise;
    end;
  end loop;

  begin
    insert into public.monthly_entry (period) values ('2099-01-01');
    raise exception 'denial_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;
  begin
    update public.monthly_entry set source = source;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    delete from public.monthly_entry;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    insert into public.finance_target (name, target_amount) values ('denial probe', 1);
    raise exception 'denial_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;
  begin
    update public.finance_target set name = name;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    delete from public.finance_target;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    insert into public.finance_setting (key, value) values ('denial_probe', 1);
    raise exception 'denial_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;
  begin
    update public.finance_setting set value = value;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    delete from public.finance_setting;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    insert into public.purchase (description, amount) values ('denial probe', 1);
    raise exception 'denial_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;
  begin
    delete from public.purchase;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    delete from public.sora_conversation;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    insert into public.sora_conversation (started_at, ended_at, summary) values (now(), now(), 'denial probe');
    raise exception 'denial_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;
  begin
    delete from public.sora_research;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    insert into public.sora_research (query) values ('denial probe');
    raise exception 'denial_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;

  begin
    insert into public.jrl_owner_pin (id, owner_sub) values (true, '00000000-0000-4000-8000-000000000002');
    raise exception 'denial_pin_write_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_pin_write_succeeded' then raise; end if;
      asserts := asserts + 1;
  end;
  begin
    update public.jrl_owner_pin set owner_sub = '00000000-0000-4000-8000-000000000002' where id;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'denial_pin_write_succeeded'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    execute 'create or replace function public.jrl_is_owner() returns boolean language sql as $fn$ select true $fn$';
    raise exception 'denial_helper_replace_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_helper_replace_succeeded' then raise; end if;
      raise;
  end;

  perform set_config('role', 'anon', true);
  begin
    select count(*) into seen from public.monthly_entry;
    if seen <> 0 then raise exception 'denial_anon_saw_rows'; end if;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then asserts := asserts + 1;
  end;
  begin
    select count(*) into seen from public.monthly_finance;
    if seen <> 0 then raise exception 'denial_anon_saw_rows'; end if;
    raise notice 'monthly_finance_anon %', seen;
    asserts := asserts + 1;
  exception
    when insufficient_privilege then
      raise notice 'monthly_finance_anon denied';
      asserts := asserts + 1;
  end;

  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if not public.jrl_is_owner() then
    raise exception 'denial_owner_not_recognized';
  end if;
  asserts := asserts + 1;

  select count(*) into seen from public.monthly_entry;
  if seen < 1 then raise exception 'denial_owner_read_failed'; end if;
  asserts := asserts + 1;
  select count(*) into changed from public.monthly_finance;
  if changed <> seen then raise exception 'denial_owner_view_failed'; end if;
  asserts := asserts + 1;
  perform 1 from public.finance_setting limit 1;
  perform 1 from public.finance_target limit 1;
  perform 1 from public.purchase limit 1;
  perform 1 from public.sora_conversation limit 1;
  perform 1 from public.sora_research limit 1;
  perform 1 from public.sora_alerts limit 1;
  asserts := asserts + 6;

  insert into public.monthly_entry (period) values ('2099-01-01');
  update public.monthly_entry set source = source where period = '2099-01-01';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'denial_trigger_update_failed'; end if;
  delete from public.monthly_entry where period = '2099-01-01';
  asserts := asserts + 3;

  insert into public.finance_target (name, target_amount) values ('denial probe', 1);
  update public.finance_target set name = name where name = 'denial probe';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'denial_trigger_update_failed'; end if;
  delete from public.finance_target where name = 'denial probe';
  asserts := asserts + 3;

  insert into public.finance_setting (key, value) values ('denial_probe', 1);
  update public.finance_setting set value = 2 where key = 'denial_probe';
  asserts := asserts + 2;
  begin
    delete from public.finance_setting where key = 'denial_probe';
    raise exception 'denial_owner_extra_command';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_owner_extra_command' then raise; end if;
      raise;
  end;

  insert into public.purchase (description, amount) values ('denial probe', 1);
  delete from public.purchase where description = 'denial probe';
  asserts := asserts + 2;
  begin
    update public.purchase set description = description;
    raise exception 'denial_owner_extra_command';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_owner_extra_command' then raise; end if;
      if sqlerrm like '%violates row-level security%' then asserts := asserts + 1;
      else raise;
      end if;
  end;

  begin
    insert into public.sora_conversation (started_at, ended_at, summary) values (now(), now(), 'denial probe');
    raise exception 'denial_owner_extra_command';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_owner_extra_command' then raise; end if;
      raise;
  end;
  delete from public.sora_conversation where summary = 'seed probe';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'denial_owner_delete_failed'; end if;
  asserts := asserts + 1;
  delete from public.sora_research where query = 'seed probe';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'denial_owner_delete_failed'; end if;
  asserts := asserts + 1;
  begin
    insert into public.sora_alerts (source, title) values ('denial', 'denial probe');
    raise exception 'denial_owner_extra_command';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_owner_extra_command' then raise; end if;
      raise;
  end;

  begin
    truncate table public.monthly_entry;
    raise exception 'denial_truncate_succeeded';
  exception
    when insufficient_privilege then asserts := asserts + 1;
    when others then
      if sqlerrm = 'denial_truncate_succeeded' then raise; end if;
      raise;
  end;

  if asserts < 80 then
    raise exception 'denial_assert_count_low: %', asserts;
  end if;
  perform set_config('jrl.review_asserts', asserts::text, true);
end $$;

reset role;
select current_setting('jrl.review_asserts', true)::int as denial_asserts;

rollback;
