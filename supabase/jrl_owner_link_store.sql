-- NOT APPLIED. Toki project hcjybjpimqzsueyslxvl, schema cockpit, table app_oauth_tokens.
-- Live columns are id, provider, tenant_key, ciphertext, created_at, updated_at.
-- The provider check allows only xero and google. There is no generation column.
-- service_role can select, insert, and update. It cannot delete.
-- This adds generation and allows provider jrl. It does not delete or rewrite ciphertext.
-- A new column with a constant default does not rewrite existing token rows.
-- Unlink clears a link by updating the ciphertext. It does not delete the row.
-- Do not run this until the owner approves it. It does not touch uxkpqmyzxtjmmixlycio.

begin;

alter table cockpit.app_oauth_tokens drop constraint if exists app_oauth_tokens_provider_check;
alter table cockpit.app_oauth_tokens
  add constraint app_oauth_tokens_provider_check
  check (provider in ('xero', 'google', 'jrl'));

alter table cockpit.app_oauth_tokens
  add column if not exists generation bigint not null default 0;

commit;
