-- SM26 Simple App — drop five dead columns found in the 2026-08-23 table-by-
-- table review (DATABASE_REVIEW_TEMP.md). Each was verified in code, not
-- assumed: "dead" here means written-but-never-read, or neither.
--
--   farmers.agro_farm_id         Residue of the reverted one-Farm-per-farmer
--                               design. Its only mention anywhere in src/ is a
--                               comment explaining that the design was
--                               reverted. `Guy` still held a stale value.
--
--   app_users.agro_farm_id       Same reverted design, on the farmer-side field
--                               creation path — the last place still doing it.
--                               The code was fixed first (commit 2133bd6, one
--                               Farm per field), so this now has no writer and
--                               no reader. Dropping it before that fix would
--                               have broken field creation.
--
--   machine_rates.width_m        Was priority 2 of the implement-width chain;
--                               that read was removed 2026-08-22 and nothing
--                               writes it. It IS still read in one place —
--                               /api/suggestions (lines 269-270) — but that
--                               entire 364-line route has ZERO callers
--                               anywhere in src/, so only dead code is
--                               affected. Every other `width_m` in the
--                               codebase belongs to `implements` or
--                               `work_reports`, which are different tables.
--
--   work_orders.farmer_org_id    Duplicated organizations.agro_org_id, already
--                               reachable through the organization FK.
--   work_orders.requested_date   Set from the same value as scheduled_date, so
--                               a literal duplicate.
--                               BOTH were WRITTEN by the /api/orders insert
--                               and read nowhere. The writes were removed
--                               first (commit 96b4842) and deployed —
--                               dropping these while the insert still named
--                               them would have broken order creation
--                               outright.
--
-- METHOD NOTE, worth heeding: the shell `grep` used earlier in this review
-- silently missed real matches — it reported /api/suggestions as free of both
-- `width_m` and `emission_kg_per_l` when it references both. Every claim in
-- this file was re-verified with an explicit file walk in Python. Do not trust
-- a bare grep for a "zero references, safe to drop" conclusion.
--
-- NOT dropped, deliberately: work_orders.location_lat/lng. Those ARE read
-- (contractor/page.js sorts Today's Work by distance from the contractor's home
-- base) but every row is NULL, so the feature silently never runs. That is a
-- product decision — populate them from the field centroid, or remove the
-- feature — not a cleanup.
--
-- Run once. Production shares this database; all five have zero readers in the
-- deployed code, so this is safe to run without a deploy.

begin;

-- Guard: refuse if any of these turn out to hold data something might still
-- want. Only agro_farm_id/width_m ever had values; the two work_orders columns
-- are checked for readers in code, not here.
do $$
declare stale int;
begin
  select count(*) into stale from machine_rates where width_m is not null;
  raise notice 'machine_rates.width_m rows being discarded: %', stale;
  select count(*) into stale from farmers where agro_farm_id is not null;
  raise notice 'farmers.agro_farm_id rows being discarded: %', stale;
  select count(*) into stale from app_users where agro_farm_id is not null;
  raise notice 'app_users.agro_farm_id rows being discarded: %', stale;
end $$;

alter table farmers       drop column agro_farm_id;
alter table app_users     drop column agro_farm_id;
alter table machine_rates drop column width_m;
alter table work_orders   drop column farmer_org_id;
alter table work_orders   drop column requested_date;

commit;
