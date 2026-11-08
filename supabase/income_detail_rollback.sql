-- NOT APPLIED. Rollback for income_detail.sql only.
-- Drops the new table. It does not touch plan_entries, planning_evidence, or app_oauth_tokens.

begin;

drop table if exists cockpit.income_detail_lines;

commit;
