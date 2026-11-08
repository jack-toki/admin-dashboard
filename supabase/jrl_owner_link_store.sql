-- NOT APPLIED. Cockpit store only (hcjybjpimqzsueyslxvl, schema cockpit).
-- Do not run this until the owner approves it. It does not touch uxkpqmyzxtjmmixlycio.
-- Approval scope is this table only: allow provider jrl, and add generation for compare-and-swap.
-- The app updates one row with WHERE generation = expected and increments generation.
-- If this column or the provider check is missing, the app refuses the link.
-- A file store is also refused. Two processes cannot share its lock.
-- No personal row, email, or key is written by this file.

begin;

alter table cockpit.app_oauth_tokens drop constraint if exists app_oauth_tokens_provider_check;
alter table cockpit.app_oauth_tokens
  add constraint app_oauth_tokens_provider_check
  check (provider in ('xero', 'google', 'jrl'));

alter table cockpit.app_oauth_tokens
  add column if not exists generation bigint not null default 0;

commit;
