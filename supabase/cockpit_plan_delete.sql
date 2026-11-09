-- NOT APPLIED. The earlier cockpit grants allow select, insert, and update only.
-- Run this on the verified cockpit schema before DELETE /api/cockpit/plan.
-- It does not change public.runs, anon, or authenticated.

grant delete on table cockpit.plan_entries to service_role;
