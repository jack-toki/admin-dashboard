-- NOT APPLIED. Drops only the four tables added by cockpit_sheet_sync.sql.

begin;

drop table if exists cockpit.outstanding_dismissals;
drop table if exists cockpit.automation_rates;
drop table if exists cockpit.sheet_write_log;
drop table if exists cockpit.sheet_sync_state;

commit;
