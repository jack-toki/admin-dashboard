-- JRL Finance — lock it down.
--
-- Run this AFTER 0001_init.sql. It replaces the open read policies with ones
-- that require a signed-in user, and allows that user to write.
--
-- In Supabase → Authentication → Providers, make sure "Enable email signups"
-- is OFF once you've created your own account, so nobody else can register.

-- drop the public-read policies from 0001
drop policy if exists monthly_entry_read   on monthly_entry;
drop policy if exists finance_setting_read on finance_setting;

-- read: signed in only
create policy monthly_entry_read on monthly_entry
  for select to authenticated using (true);

create policy finance_setting_read on finance_setting
  for select to authenticated using (true);

-- write: signed in only
create policy monthly_entry_insert on monthly_entry
  for insert to authenticated with check (true);

create policy monthly_entry_update on monthly_entry
  for update to authenticated using (true) with check (true);

create policy monthly_entry_delete on monthly_entry
  for delete to authenticated using (true);

create policy finance_setting_update on finance_setting
  for update to authenticated using (true) with check (true);

-- Belt and braces: even a signed-in user can only be you.
-- Replace the address, then this is enforced in the database itself.
--
--   create or replace function is_owner() returns boolean
--   language sql stable as $$
--     select coalesce(auth.jwt() ->> 'email', '') = 'you@example.com'
--   $$;
--
-- ...and swap `using (true)` for `using (is_owner())` in the policies above.

-- Belt and braces: re-assert invoker rights on the view, in case 0001 was
-- applied before this was added. Views do NOT inherit RLS from their tables.
alter view monthly_finance set (security_invoker = on);
