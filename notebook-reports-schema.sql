-- SM26: a work report that has no machine, and sometimes no field.
--
-- Force Close is about to stop being "shut this row up" and start producing a
-- real, billable work report — because a total that silently omits every job
-- without GPS is not a total, it is a technical number (2026-09-23).
--
-- Two columns were NOT NULL and both have to give way:
--
--   agro_machine_id    the work happened, no tracker was on the machine. This
--                      is now the marker for "no machine data": a report with
--                      no machine IS the force-closed kind, so no extra flag
--                      column is needed. Fuel and emissions stay NULL rather
--                      than 0 — a missing figure is honest, a zero averages
--                      into a season's totals as if it were measured.
--
--   agro_cropzone_id   a job jotted into the digital notebook for a manual
--                      customer, never tied to a field. Every fieldless order
--                      in the database is `source = 'manual'`; no smart
--                      farmer's order has ever lacked a field, because they
--                      request work FROM a field. So this relaxation cannot be
--                      used to bypass a smart farmer's records — there is no
--                      fieldless smart-farmer order to do it with.
--
-- What each kind produces:
--
--   field known   report + ADAPT Work Record + AgroAPI activity
--   no field      report only — billing and the contractor's notebook.
--                 No ADAPT: ADAPT makes Field Id REQUIRED on a Work Record,
--                 and a non-conformant document is worse than none (adapt.js).
--                 No AgroAPI activity: an activity is written TO a cropzone.

begin;

alter table public.work_reports alter column agro_machine_id drop not null;
alter table public.work_reports alter column agro_cropzone_id drop not null;

commit;
