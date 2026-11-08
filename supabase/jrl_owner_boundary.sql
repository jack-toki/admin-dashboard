-- NOT APPLIED. Do not run this against uxkpqmyzxtjmmixlycio until the owner approves it.
-- This file is a review script. It is not evidence of the live policies.
-- The 2026-11-08 metadata audit (no personal rows) is the operation list below.
-- No owner uuid, email, key, or session is stored in this file.
-- The cockpit passcode is not a Supabase user. Do not read the ledger with the service role.
-- This script does not ALTER ROLE and does not grant service_role or anon a policy.
-- Supabase service_role typically has BYPASSRLS. FORCE ROW LEVEL SECURITY does not remove that.
-- The original Sora edge function uses that role today. This script leaves it unchanged so that function keeps working.
-- The original JRL app reads and writes as the signed-in authenticated user. Those commands stay, narrowed to the pinned owner.

begin;

-- The custom setting is copied once into jrl_owner_pin and is not read again.
-- A later session SET app.jrl_owner_sub does not change jrl_is_owner().
-- Any role can SET an undefined custom GUC in its own session, so the setting is not the guard.
-- Authenticated and anon have no grant and no policy on the pin. FORCE ROW LEVEL SECURITY
-- also binds a non-superuser table owner. Superuser and BYPASSRLS, including the usual
-- Supabase service_role, can still change the pin. This script does not alter that role.
create table if not exists public.jrl_owner_pin (
  id boolean primary key default true check (id),
  owner_sub uuid not null
);
alter table public.jrl_owner_pin enable row level security;
alter table public.jrl_owner_pin force row level security;
revoke all on table public.jrl_owner_pin from public, anon, authenticated;

create or replace function public.jrl_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and auth.uid() = (select owner_sub from public.jrl_owner_pin where id)
$$;

revoke all on function public.jrl_is_owner() from public, anon;
grant execute on function public.jrl_is_owner() to authenticated;

-- Supply the stable auth.users id only for this transaction, then discard the setting.
-- select set_config('app.jrl_owner_sub', '<owner uuid>', true);

do $$
declare
  owner_sub text := nullif(current_setting('app.jrl_owner_sub', true), '');
  unexpected text;
  view_opts text;
begin
  if owner_sub is null or owner_sub !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'preflight_owner_sub_missing';
  end if;
  if (select count(*) from public.jrl_owner_pin) > 1 then
    raise exception 'preflight_owner_pin_ambiguous';
  end if;
  insert into public.jrl_owner_pin (id, owner_sub)
  select true, owner_sub::uuid
  where not exists (select 1 from public.jrl_owner_pin);
  if (select count(*) from public.jrl_owner_pin) <> 1 then
    raise exception 'preflight_owner_pin_missing';
  end if;

  select coalesce(array_to_string(c.reloptions, ','), '')
    into view_opts
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'monthly_finance' and c.relkind = 'v';
  if view_opts is null then
    raise exception 'preflight_monthly_finance_missing';
  end if;
  if view_opts !~ 'security_invoker=(on|true)' then
    raise exception 'preflight_view_not_security_invoker';
  end if;

  select string_agg(distinct ref.relname, ',')
    into unexpected
  from pg_rewrite rw
  join pg_class v on v.oid = rw.ev_class
  join pg_namespace vn on vn.oid = v.relnamespace
  join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
  join pg_class ref on ref.oid = d.refobjid
  where vn.nspname = 'public'
    and v.relname = 'monthly_finance'
    and ref.relkind in ('r', 'p', 'v', 'm', 'f')
    and ref.oid <> v.oid
    and ref.relname <> 'monthly_entry';
  if unexpected is not null then
    raise exception 'preflight_view_dependency_unexpected: %', unexpected;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'monthly_entry' and cmd not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
        or (tablename = 'finance_target' and cmd not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
        or (tablename = 'finance_setting' and cmd not in ('SELECT', 'INSERT', 'UPDATE'))
        or (tablename = 'purchase' and cmd not in ('SELECT', 'INSERT', 'DELETE'))
        or (tablename = 'sora_conversation' and cmd not in ('SELECT', 'DELETE'))
        or (tablename = 'sora_research' and cmd not in ('SELECT', 'DELETE'))
        or (tablename = 'sora_alerts' and cmd not in ('SELECT'))
      )
  ) then
    raise exception 'preflight_unexpected_policy_command';
  end if;
end $$;

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
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare
  spec record;
  t text;
begin
  foreach t in array array[
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, public', t);
  end loop;

  for spec in
    select * from (values
      ('monthly_entry', 'SELECT'),
      ('monthly_entry', 'INSERT'),
      ('monthly_entry', 'UPDATE'),
      ('monthly_entry', 'DELETE'),
      ('finance_target', 'SELECT'),
      ('finance_target', 'INSERT'),
      ('finance_target', 'UPDATE'),
      ('finance_target', 'DELETE'),
      ('finance_setting', 'SELECT'),
      ('finance_setting', 'INSERT'),
      ('finance_setting', 'UPDATE'),
      ('purchase', 'SELECT'),
      ('purchase', 'INSERT'),
      ('purchase', 'DELETE'),
      ('sora_conversation', 'SELECT'),
      ('sora_conversation', 'DELETE'),
      ('sora_research', 'SELECT'),
      ('sora_research', 'DELETE'),
      ('sora_alerts', 'SELECT')
    ) as ops(tablename, cmd)
  loop
    execute format('drop policy if exists %I on public.%I', spec.tablename || '_owner_' || lower(spec.cmd), spec.tablename);
    if spec.cmd = 'INSERT' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.jrl_is_owner())',
        spec.tablename || '_owner_insert', spec.tablename
      );
    elsif spec.cmd = 'UPDATE' then
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.jrl_is_owner()) with check (public.jrl_is_owner())',
        spec.tablename || '_owner_update', spec.tablename
      );
    elsif spec.cmd = 'DELETE' then
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.jrl_is_owner())',
        spec.tablename || '_owner_delete', spec.tablename
      );
    else
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.jrl_is_owner())',
        spec.tablename || '_owner_select', spec.tablename
      );
    end if;
  end loop;
end $$;

alter view public.monthly_finance set (security_invoker = on);
revoke all on table public.monthly_finance from anon, public;
grant select on table public.monthly_finance to authenticated;

do $$
declare
  missing int;
  other_role_policies int;
  open_policies int;
  invoker text;
begin
  select count(*) into missing
  from (values
    ('monthly_entry', 'SELECT'), ('monthly_entry', 'INSERT'), ('monthly_entry', 'UPDATE'), ('monthly_entry', 'DELETE'),
    ('finance_target', 'SELECT'), ('finance_target', 'INSERT'), ('finance_target', 'UPDATE'), ('finance_target', 'DELETE'),
    ('finance_setting', 'SELECT'), ('finance_setting', 'INSERT'), ('finance_setting', 'UPDATE'),
    ('purchase', 'SELECT'), ('purchase', 'INSERT'), ('purchase', 'DELETE'),
    ('sora_conversation', 'SELECT'), ('sora_conversation', 'DELETE'),
    ('sora_research', 'SELECT'), ('sora_research', 'DELETE'),
    ('sora_alerts', 'SELECT')
  ) as expected(tablename, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = expected.tablename
      and p.cmd = expected.cmd
      and p.roles::text[] @> array['authenticated']::text[]
      and (
        (expected.cmd in ('SELECT', 'DELETE') and p.qual like '%jrl_is_owner%' and p.with_check is null)
        or (expected.cmd = 'INSERT' and p.with_check like '%jrl_is_owner%' and p.qual is null)
        or (expected.cmd = 'UPDATE' and p.qual like '%jrl_is_owner%' and p.with_check like '%jrl_is_owner%')
      )
  );
  if missing <> 0 then
    raise exception 'postflight_owner_policy_missing: %', missing;
  end if;

  select count(*) into other_role_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
      'sora_conversation', 'sora_alerts', 'sora_research'
    )
    and roles::text[] && array['anon', 'public']::text[];
  if other_role_policies <> 0 then
    raise exception 'postflight_anon_policy';
  end if;

  select count(*) into open_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
      'sora_conversation', 'sora_alerts', 'sora_research'
    )
    and (qual = 'true' or with_check = 'true');
  if open_policies <> 0 then
    raise exception 'postflight_permissive_true';
  end if;

  select coalesce(array_to_string(c.reloptions, ','), '')
    into invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'monthly_finance';
  if invoker !~ 'security_invoker=(on|true)' then
    raise exception 'postflight_view_invoker';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
        'sora_conversation', 'sora_alerts', 'sora_research', 'jrl_owner_pin'
      )
      and (c.relrowsecurity is not true or c.relforcerowsecurity is not true)
  ) then
    raise exception 'postflight_rls_not_forced';
  end if;

  if (select count(*) from public.jrl_owner_pin) <> 1 then
    raise exception 'postflight_owner_pin_count';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jrl_owner_pin'
  ) then
    raise exception 'postflight_owner_pin_policy';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'finance_setting' and cmd = 'DELETE')
        or (tablename = 'purchase' and cmd = 'UPDATE')
        or (tablename = 'sora_conversation' and cmd in ('INSERT', 'UPDATE'))
        or (tablename = 'sora_research' and cmd in ('INSERT', 'UPDATE'))
        or (tablename = 'sora_alerts' and cmd <> 'SELECT')
      )
  ) then
    raise exception 'postflight_operation_expanded';
  end if;
end $$;

commit;
