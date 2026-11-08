-- NOT APPLIED. Rollback for jrl_owner_link_store.sql.
-- Refuses to continue if a jrl token row exists, because service_role cannot delete it
-- and this script will not delete ciphertext. Clear that row with an update first.
-- Existing xero and google ciphertext is not updated.

begin;

do $$
begin
  if exists (select 1 from cockpit.app_oauth_tokens where provider = 'jrl') then
    raise exception 'rollback_jrl_token_row_present';
  end if;
end $$;

alter table cockpit.app_oauth_tokens drop column if exists generation;

alter table cockpit.app_oauth_tokens drop constraint if exists app_oauth_tokens_provider_check;
alter table cockpit.app_oauth_tokens
  add constraint app_oauth_tokens_provider_check
  check (provider in ('xero', 'google'));

commit;
