-- NOT APPLIED. Cockpit store only (hcjybjpimqzsueyslxvl, schema cockpit).
-- Do not run this until the owner approves it. It does not touch uxkpqmyzxtjmmixlycio.
-- It lets the off-by-default JRL owner link persist an encrypted rotating refresh token.
-- The provider check today allows only xero and google, so provider jrl cannot be saved yet.
-- No personal row, email, or key is written by this file.

begin;

alter table cockpit.app_oauth_tokens drop constraint if exists app_oauth_tokens_provider_check;
alter table cockpit.app_oauth_tokens
  add constraint app_oauth_tokens_provider_check
  check (provider in ('xero', 'google', 'jrl'));

alter table cockpit.app_oauth_tokens
  add column if not exists generation bigint not null default 0;

commit;
