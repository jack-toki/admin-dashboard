-- NOT APPLIED. Rollback for jrl_owner_boundary.sql. Do not run until that script was applied and the owner asks to undo it.
-- Restores the authenticated commands confirmed by the 2026-11-08 metadata audit: permissive true, no owner predicate.
-- Does not create an anon policy. Does not grant the service role. Does not read personal rows.
-- GRANT ALL below restores the audited full grants. It is not a captured ACL dump.
-- The pin and the helper are removed. A later session setting cannot keep the owner check.

begin;

do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('monthly_entry', 'select'), ('monthly_entry', 'insert'), ('monthly_entry', 'update'), ('monthly_entry', 'delete'),
      ('finance_target', 'select'), ('finance_target', 'insert'), ('finance_target', 'update'), ('finance_target', 'delete'),
      ('finance_setting', 'select'), ('finance_setting', 'insert'), ('finance_setting', 'update'),
      ('purchase', 'select'), ('purchase', 'insert'), ('purchase', 'delete'),
      ('sora_conversation', 'select'), ('sora_conversation', 'delete'),
      ('sora_research', 'select'), ('sora_research', 'delete'),
      ('sora_alerts', 'select')
    ) as ops(tablename, cmd)
  loop
    execute format('drop policy if exists %I on public.%I', spec.tablename || '_owner_' || spec.cmd, spec.tablename);
  end loop;
end $$;

create policy monthly_entry_select on public.monthly_entry for select to authenticated using (true);
create policy monthly_entry_insert on public.monthly_entry for insert to authenticated with check (true);
create policy monthly_entry_update on public.monthly_entry for update to authenticated using (true) with check (true);
create policy monthly_entry_delete on public.monthly_entry for delete to authenticated using (true);

create policy finance_target_select on public.finance_target for select to authenticated using (true);
create policy finance_target_insert on public.finance_target for insert to authenticated with check (true);
create policy finance_target_update on public.finance_target for update to authenticated using (true) with check (true);
create policy finance_target_delete on public.finance_target for delete to authenticated using (true);

create policy finance_setting_select on public.finance_setting for select to authenticated using (true);
create policy finance_setting_insert on public.finance_setting for insert to authenticated with check (true);
create policy finance_setting_update on public.finance_setting for update to authenticated using (true) with check (true);

create policy purchase_select on public.purchase for select to authenticated using (true);
create policy purchase_insert on public.purchase for insert to authenticated with check (true);
create policy purchase_delete on public.purchase for delete to authenticated using (true);

create policy sora_conversation_select on public.sora_conversation for select to authenticated using (true);
create policy sora_conversation_delete on public.sora_conversation for delete to authenticated using (true);

create policy sora_research_select on public.sora_research for select to authenticated using (true);
create policy sora_research_delete on public.sora_research for delete to authenticated using (true);

create policy sora_alerts_select on public.sora_alerts for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array[
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I no force row level security', t);
    execute format('grant all on table public.%I to anon, authenticated', t);
  end loop;
end $$;

alter view public.monthly_finance set (security_invoker = on);
grant all on table public.monthly_finance to anon, authenticated;

drop function if exists public.jrl_is_owner();
drop table if exists public.jrl_owner_pin;

commit;
