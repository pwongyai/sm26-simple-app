-- SM26 Simple App — trim the schema. 18 tables -> 13.
--
-- Two independent simplifications, neither touching the new farm/contractor
-- structure:
--
-- 1. THREE TABLES WERE ALL "ONE ROW PER MACHINE". `machine_implements`,
--    `machine_fuel_types` and `machine_settings` each had `agro_machine_id`
--    as their primary key and nothing else distinguishing them — they were
--    one table split three ways for no reason beyond having been added on
--    three different days. Folded into `machine_settings`, which already had
--    a row for every machine.
--
--    `machine_rates` deliberately stays separate: it has MANY rows per
--    machine (one per service, plus a default), so it is genuinely a
--    different shape.
--
--    Note the table keeps the name `machine_settings` rather than becoming
--    `machines`. AgroAPI owns the machine — its name, kind, make, model and
--    GPS all live there. This table only holds the local settings that
--    decorate it, and calling it `machines` would imply we own something we
--    do not.
--
-- 2. THREE TABLES WERE DEAD. `profiles` and `requests` (0 rows, from an
--    abandoned email/password login) and `user_fields` (4 rows, superseded
--    by `farmer_fields`, which is keyed by farmer instead of by login so it
--    can also hold a manual customer's fields). Verified 2026-08-23: zero
--    code references to any of the three.
--
-- STEP 1 (this file) is ADDITIVE — it adds the columns and backfills them,
-- so the running app is unaffected. STEP 2 (trim-schema-drop.sql) removes the
-- old tables and must run only AFTER the code cutover has deployed.

begin;

-- ---------------------------------------------------------------------------
-- Fold the two one-row-per-machine tables into machine_settings.
-- ---------------------------------------------------------------------------
alter table machine_settings
  add column if not exists implement_id uuid references implements(id),
  add column if not exists fuel_type    text not null default 'diesel'
                                        check (fuel_type in ('diesel','gasoline'));

-- Safety: a machine could in principle have an implement or a fuel type
-- without a machine_settings row. Create any missing rows before backfilling
-- so nothing is silently dropped.
insert into machine_settings (agro_machine_id, contractor_agro_org_id)
select mi.agro_machine_id, mi.contractor_agro_org_id from machine_implements mi
where not exists (select 1 from machine_settings s where s.agro_machine_id = mi.agro_machine_id)
on conflict (agro_machine_id) do nothing;

insert into machine_settings (agro_machine_id, contractor_agro_org_id)
select ft.agro_machine_id, ft.contractor_agro_org_id from machine_fuel_types ft
where not exists (select 1 from machine_settings s where s.agro_machine_id = ft.agro_machine_id)
on conflict (agro_machine_id) do nothing;

update machine_settings s
set implement_id = mi.implement_id, updated_at = now()
from machine_implements mi
where mi.agro_machine_id = s.agro_machine_id
  and mi.implement_id is not null;

update machine_settings s
set fuel_type = ft.fuel_type, updated_at = now()
from machine_fuel_types ft
where ft.agro_machine_id = s.agro_machine_id;

commit;

-- ---------------------------------------------------------------------------
-- Verify before running step 2:
--   select count(*) from machine_settings where implement_id is not null;  -- expect 8
--   select count(*) from machine_settings where fuel_type = 'diesel';      -- expect 11
-- ---------------------------------------------------------------------------
