-- NOT APPLIED. Rollback for jrl_owner_link_store.sql.
-- The migration role runs this. service_role has no DELETE on app_oauth_tokens and is not granted one.
-- This transaction deletes a jrl row only when its ciphertext is blank or the exact word revoked.
-- That word is what the app writes on unlink. It is not an encrypted token.
-- If any jrl row still holds ciphertext, the transaction stops and deletes nothing.
-- xero and google rows are not updated and are not deleted.

begin;

do $$
declare
  active int;
begin
  select count(*) into active
  from cockpit.app_oauth_tokens
  where provider = 'jrl'
    and coalesce(ciphertext, '') <> ''
    and ciphertext <> 'revoked';
  if active <> 0 then
    raise exception 'rollback_active_jrl_token_present';
  end if;

  delete from cockpit.app_oauth_tokens
  where provider = 'jrl'
    and (ciphertext is null or ciphertext = '' or ciphertext = 'revoked');

  if exists (select 1 from cockpit.app_oauth_tokens where provider = 'jrl') then
    raise exception 'rollback_jrl_row_remains';
  end if;
end $$;

alter table cockpit.app_oauth_tokens drop column if exists generation;

alter table cockpit.app_oauth_tokens drop constraint if exists app_oauth_tokens_provider_check;
alter table cockpit.app_oauth_tokens
  add constraint app_oauth_tokens_provider_check
  check (provider in ('xero', 'google'));

commit;
