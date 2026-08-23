-- SM26 review batch, phase 3: the renames (R1, R11, R12-table, R16, R17).
--
-- Cosmetic, but they remove the last places where the schema's names disagree
-- with what the things are. Run AS the matching code deploy goes live: the app
-- is briefly broken between the two, which is accepted — every table below is
-- queried by name, so there is no way to split the change.
--
-- The naming rule these settle on:
--   one row per AgroAPI entity  -> named after the entity
--       farm_organizations, fields, machines, contractor_organizations
--   many rows, or no entity of its own -> named after what it holds
--       fuel_rates, services, implements, farm_contractor_relationships,
--       work_orders, work_reports
--
-- Postgres carries every foreign key and index through a rename, so nothing
-- else needs touching.

begin;

-- R1  "organizations" was ambiguous the moment contractor_organizations existed.
alter table organizations rename to farm_organizations;

-- R12 Not a junction table: a field has one owner, and farmer_id is an
--     ordinary column. The PK moved to agro_field_id in phase 2.
alter table farmer_fields rename to fields;

-- R16 Local settings decorating an AgroAPI machine. NOTE: a row here is
--     OPTIONAL by design — api/machines treats a machine with no row as
--     active — so this is NOT the authoritative machine list. AgroAPI is.
alter table machine_settings rename to machines;

-- R17 "rates" was plural because the table once held width_m too. That went
--     on 2026-08-23, leaving fuel as the only rate. The route was already
--     called fuel-rates.
alter table machine_rates rename to fuel_rates;

-- R11 One prefix for AgroAPI ids. Fifteen columns used agro_*, two used
--     agroapi_* for exactly the same concept, which is what made a reader ask
--     whether they were different kinds of id.
alter table work_orders  rename column agroapi_activity_id to agro_activity_id;
alter table work_reports rename column agroapi_activity_id to agro_activity_id;

commit;
