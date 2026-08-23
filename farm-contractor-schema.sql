-- SM26 Simple App — STEP 1 of 2: split the conflated "organization" into two
-- real entities joined by a relationship table.
--
-- PURELY ADDITIVE. Creates two tables, backfills them, adds two unique
-- indexes. It renames nothing and drops nothing, so the running application
-- (which does not know these tables exist) cannot break. Step 2
-- (farm-contractor-rename.sql) does the rename and MUST ship with a code
-- change — see that file.
--
-- WHY. One `organizations` row carries TWO AgroAPI organization ids:
-- `agro_org_id` (the farming org — fields, cropzones, activities) and
-- `contractor_agro_org_id` (a second AgroAPI org existing only to hold
-- machines, because AgroAPI cannot model "this farming community owns these
-- machines"). That conflation is why a contractor login could point at a
-- business belonging to a different farming community (the `Attaphon`
-- anomaly, deleted 2026-08-23) — nothing tied a contractor to its farm.
--
-- The relationship table is deliberately many-to-many so all three business
-- models are expressible WITHOUT a schema change:
--   1 farm : 1 contractor                (the POC — enforced by an index below)
--   1 farm : N contractors, not shared   (drop farm_contractor_one_farm_per_contractor)
--   N farms : N contractors, shared      (same single index drop)
-- Expanding is an index change, never a migration.
--
-- Run this once.

begin;

-- ---------------------------------------------------------------------------
-- 1. The contractor organization.
--
-- PRIMARY KEY is the raw AgroAPI contractor org id, NOT a new uuid. This is
-- the most consequential choice here: nine tables already key their contractor
-- scoping on that id (services, machine_rates, machine_implements,
-- machine_fuel_types, machine_settings, work_reports, work_orders, farmers,
-- implements). Reusing it means none of them are touched. A synthetic PK would
-- force re-keying all nine.
--
-- Supersedes `contractor_profiles`, which was already keyed by this exact id —
-- so it was really this entity all along. That table is NOT dropped here; see
-- step 2's follow-up note.
-- ---------------------------------------------------------------------------
create table if not exists contractor_organizations (
  agro_contractor_org_id text primary key,          -- AgroAPI organization id
  name                   text,                      -- business name (was contractor_profiles.business_name)
  owner_name             text,
  phone                  text,
  line_account           text,
  language               text not null default 'th' check (language in ('th','en','vn')),
  home_lat               double precision,
  home_lng               double precision,
  status                 text not null default 'active' check (status in ('active','inactive')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. The relationship: which contractors serve which farming organization.
--
-- NOTE — currency / area_unit / area_unit_m2 deliberately stay on the farming
-- organization rather than moving to the contractor. They describe the land and
-- the market, not the service provider: RK is THB/rai because it is in
-- Thailand, HN is VND/sào because it is in Vietnam. On the contractor, two
-- contractors serving one farm could disagree on the unit, and that farm's
-- reports would come out in mixed units — permanently, since reports freeze
-- `currency`/`unit_label` per row.
-- ---------------------------------------------------------------------------
create table if not exists farm_contractor_relationships (
  id                         uuid primary key default gen_random_uuid(),
  farm_organization_id       text not null references organizations(id),
  contractor_organization_id text not null references contractor_organizations(agro_contractor_org_id),
  -- Which contractor receives a farmer's order when the farmer does not pick
  -- one. Belongs on the pairing, not the contractor: the same contractor could
  -- be default for one farm and not another.
  is_default                 boolean not null default false,
  -- Lets a contractor stop serving ONE farm without affecting others. Distinct
  -- from contractor_organizations.status, which retires the business outright.
  status                     text not null default 'active' check (status in ('active','inactive')),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (farm_organization_id, contractor_organization_id)
);

-- The POC business rule, stated in the schema rather than left implicit:
-- a contractor organization serves exactly ONE farming organization.
-- DROP THIS INDEX to allow contractors shared across farms. Nothing else
-- changes when you do.
create unique index if not exists farm_contractor_one_farm_per_contractor
  on farm_contractor_relationships (contractor_organization_id);

-- At most one default contractor per farm.
create unique index if not exists farm_contractor_one_default_per_farm
  on farm_contractor_relationships (farm_organization_id)
  where is_default;

create index if not exists farm_contractor_farm_idx
  on farm_contractor_relationships (farm_organization_id);

-- ---------------------------------------------------------------------------
-- 3. Enforce 1 contractor organization <-> 1 login.
--
-- This rule already existed in application code (`/api/contractors` POST
-- returns 409 "That business already has an account") but nothing stopped a
-- second code path or a direct insert from breaking it. Now the database does.
-- ---------------------------------------------------------------------------
create unique index if not exists app_users_contractor_org_uidx
  on app_users (contractor_agro_org_id)
  where contractor_agro_org_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Backfill from what exists today. Preserves existing profile values.
-- ---------------------------------------------------------------------------
insert into contractor_organizations (agro_contractor_org_id, name, owner_name, phone, line_account, language, home_lat, home_lng)
select distinct on (o.contractor_agro_org_id)
       o.contractor_agro_org_id,
       cp.business_name,
       cp.owner_name,
       cp.phone,
       cp.line_account,
       coalesce(cp.language, 'th'),
       cp.home_lat,
       cp.home_lng
from organizations o
left join contractor_profiles cp on cp.contractor_agro_org_id = o.contractor_agro_org_id
where o.contractor_agro_org_id is not null
order by o.contractor_agro_org_id, cp.updated_at desc nulls last
on conflict (agro_contractor_org_id) do nothing;

-- One relationship per farm, marked default, carrying the existing designation.
insert into farm_contractor_relationships (farm_organization_id, contractor_organization_id, is_default, status)
select o.id, o.contractor_agro_org_id, true, 'active'
from organizations o
where o.contractor_agro_org_id is not null
on conflict (farm_organization_id, contractor_organization_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- AFTER THIS RUNS, the new tables are the intended source of truth, but the
-- application still reads the old ones. Until the code is switched over,
-- `organizations.contractor_agro_org_id` and `contractor_profiles` are
-- duplicated state. Do not write the old ones by hand in the meantime.
-- ---------------------------------------------------------------------------
