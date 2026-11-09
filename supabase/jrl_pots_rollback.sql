-- NOT APPLIED. Rollback for jrl_pots.sql only.
-- Drops the new preferences table. It does not touch finance_target or any ledger row.

begin;

drop table if exists cockpit.jrl_pot_preferences;

commit;
