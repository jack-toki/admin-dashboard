-- NOT APPLIED. The app does not run this file. Do not apply it to production from here.
-- Prepared owner boundary for the personal JRL database.
-- There is no public self-signup and no grant to anon or public.
-- The cockpit password session is not a Supabase user. Do not read these tables with the service role.

create or replace function public.jrl_is_owner()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.email() is not null
    and auth.email() = nullif(current_setting('app.jrl_owner_email', true), '')
$$;

-- The owner address is a database setting, not a value committed in this file.
-- alter database postgres set app.jrl_owner_email = '<owner email>';

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
        'sora_conversation', 'sora_alerts', 'sora_research'
      )
      and policyname <> tablename || '_owner'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.jrl_is_owner()) with check (public.jrl_is_owner())',
      t || '_owner', t
    );
  end loop;
end $$;

alter view if exists public.monthly_finance set (security_invoker = on);
revoke all on table public.monthly_finance from anon, public;
