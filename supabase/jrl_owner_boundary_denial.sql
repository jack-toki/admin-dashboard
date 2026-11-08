-- NOT APPLIED. Offline denial fixture for a reviewer after jrl_owner_boundary.sql.
-- Do not run this until that script has been approved and applied in a review session.
-- It selects counts only. It does not print row bodies, emails, or keys.
-- A zero count is the expected denial. It is not proof by itself that the ledger is empty.

-- Preflight metadata the reviewer compares with the 2026-11-08 audit.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research', 'monthly_finance'
  )
order by c.relname;

select tablename, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'monthly_entry', 'finance_setting', 'finance_target', 'purchase',
    'sora_conversation', 'sora_alerts', 'sora_research'
  )
order by tablename, cmd;

-- Other signed-in subject. Expect zero rows and a failed write. No anon policy is used.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as monthly_entry_other_owner from public.monthly_entry;
select count(*) as monthly_finance_other_owner from public.monthly_finance;
select count(*) as finance_setting_other_owner from public.finance_setting;
select count(*) as finance_target_other_owner from public.finance_target;
select count(*) as purchase_other_owner from public.purchase;
select count(*) as sora_conversation_other_owner from public.sora_conversation;
select count(*) as sora_research_other_owner from public.sora_research;
select count(*) as sora_alerts_other_owner from public.sora_alerts;

-- Anon has no policy. Expect zero rows, not an error that dumps data.
set local role anon;
select count(*) as monthly_entry_anon from public.monthly_entry;
select count(*) as monthly_finance_anon from public.monthly_finance;

-- Owner subject. Counts may be non-zero. Still do not select the row bodies in this fixture.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.jrl_owner_sub', true), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as monthly_entry_owner from public.monthly_entry;
select count(*) as monthly_finance_owner from public.monthly_finance;
