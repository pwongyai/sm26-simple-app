-- SM26 Simple App — trim the schema, STEP 2 of 2: drop what is now unused.
--
-- ⚠ Run only AFTER the code cutover in trim-schema.sql's step 1 has DEPLOYED.
-- Production shares this database, so dropping a table the live code still
-- reads breaks it immediately.
--
-- Five tables go. Nothing here is reversible, so each one's justification is
-- recorded rather than assumed:
--
--   machine_implements    folded into machine_settings.implement_id
--   machine_fuel_types    folded into machine_settings.fuel_type
--                         (both verified: 8 implement assignments and all 11
--                          fuel types carried across before this runs)
--   profiles              0 rows, 0 code references — abandoned email/password
--                         login prototype, superseded by app_users
--   requests              0 rows, 0 code references — same prototype,
--                         superseded by work_orders. (`grep "requests"` does
--                         hit src/app/farmer/layout.js, but that is the UI tab
--                         key "requests" for the Requests nav item, not this
--                         table.)
--   user_fields           4 rows, 0 code references — superseded by
--                         farmer_fields, which is keyed by farmer instead of
--                         by login and can therefore also hold a manual
--                         customer's fields. Its 4 rows are all Demo Farmer's
--                         and every one is duplicated in farmer_fields
--                         (verified by set intersection, 2026-08-23).
--
-- api_cache is NOT dropped: it is live infrastructure backing
-- src/lib/cache.js (two real references), not a domain table.
--
-- Result: 18 tables -> 13.

begin;

-- Guard: refuse to run if the fold did not actually carry the data across.
-- A silent partial backfill followed by a DROP is unrecoverable.
do $$
declare
  src_impl int;
  dst_impl int;
  src_fuel int;
  dst_fuel int;
begin
  select count(*) into src_impl from machine_implements where implement_id is not null;
  select count(*) into dst_impl from machine_settings   where implement_id is not null;
  select count(*) into src_fuel from machine_fuel_types;
  select count(*) into dst_fuel from machine_settings where fuel_type is not null;
  if dst_impl < src_impl then
    raise exception 'implement backfill incomplete: % in machine_settings vs % in machine_implements', dst_impl, src_impl;
  end if;
  if dst_fuel < src_fuel then
    raise exception 'fuel_type backfill incomplete: % vs %', dst_fuel, src_fuel;
  end if;
end $$;

drop table machine_implements;
drop table machine_fuel_types;
drop table user_fields;
-- `requests` BEFORE `profiles`: requests.farmer_id and requests.contractor_id
-- are both foreign keys into profiles, so the reverse order fails with
-- "cannot drop table profiles because other objects depend on it". Found by
-- running it the wrong way round — the transaction rolled back cleanly and
-- nothing was lost.
drop table requests;
drop table profiles;

commit;
