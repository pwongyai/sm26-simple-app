-- SM26 Simple App — complete database setup, safe to re-run.

-- ============ identity ============
-- SM26 Simple App — identity, tenancy, and the ownership mapping.
--
-- Why this exists: every farmer in this app shares ONE AgroAPI organization and
-- ONE AgroAPI token. AgroAPI therefore cannot tell farmer A from farmer B — it
-- sees a single service account. The `user_fields` table below is the only thing
-- that enforces isolation, and it is checked server-side before every AgroAPI
-- call (src/lib/ownership.js). If a route skips that check, any user can read any
-- other farmer's field by guessing an id.
--
-- These tables are touched ONLY by server code using the service-role key, so
-- RLS is enabled with no policies at all: the anon key (which ships in the
-- browser bundle) can read and write nothing here.
--
-- Run this once in Supabase: Dashboard > SQL Editor > New query.

-- 1. Sites. One row per real AgroAPI organization the app can operate in.
--    A user belongs to exactly one. Currency and area unit live here because
--    they differ per site (Thailand bills THB per rai, Vietnam VND per sào) —
--    nothing in the app may hardcode them.
create table if not exists organizations (
  id text primary key,                    -- short code used internally: 'RK', 'HN'
  name text not null,
  join_code text not null unique,         -- what a user types/scans to join: 'RK2026'
  agro_org_id text not null,              -- the real AgroAPI organization uuid
  contractor_agro_org_id text,            -- this site's contractor org in AgroAPI
  currency text not null,
  area_unit text not null,                -- display unit: 'rai' | 'sào'
  area_unit_m2 numeric not null,          -- m2 per unit: rai = 1600
  active boolean not null default true    -- inactive sites are hidden from the join screen
);

insert into organizations
  (id, name, join_code, agro_org_id, contractor_agro_org_id, currency, area_unit, area_unit_m2, active)
values
  ('RK', 'Ruang Kaeo Rice Community', 'RK2026',
   'c58112b7-4409-413f-913a-10d364139a14',
   '486e1a5e-ddc5-4541-a09f-fcdf77f94350',   -- กินรี
   'THB', 'rai', 1600, true),
  -- Vietnam is deliberately INACTIVE until the Thailand prototype is finished.
  -- Present as data so switching it on is a flag, not a code change.
  ('HN', 'Huong Ngai Experimental Fields', 'HN2026',
   'e9bcbf5a-cb75-4f2c-9624-be692b1659ba',
   '59296315-2537-4184-9cc9-8d24db0eae0f',   -- Nguyen The Thinh (SM Org)
   'VND', 'sào', 360, false)
on conflict (id) do nothing;

-- 2. Users. Identity is a phone number with no verification code — deliberate
--    for this prototype (see feedback: real signup wastes time for solo
--    click-testing). The session cookie is signed server-side, so a user cannot
--    become someone else by editing localStorage; but anyone may still *claim*
--    any phone number at first login. Add OTP here when this leaves testing.
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null,
  role text not null check (role in ('farmer', 'contractor')),
  organization_id text references organizations(id),   -- null until they join a site
  agro_farm_id text,                                   -- their Farm inside that org, created on demand
  created_at timestamptz not null default now()
);

-- 3. The ownership mapping — "who owns what" in AgroAPI.
--    One row per field a user owns. `agro_cropzone_id` is null until a planting
--    exists (a registered field with no crop is a normal, expected state).
create table if not exists user_fields (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_users(id) on delete cascade,
  organization_id text not null references organizations(id),
  agro_field_id text not null,
  agro_cropzone_id text,
  name text,                                  -- denormalized label, display only
  created_at timestamptz not null default now(),
  unique (app_user_id, agro_field_id)
);

create index if not exists user_fields_user_idx on user_fields (app_user_id);
create index if not exists user_fields_field_idx on user_fields (agro_field_id);
create index if not exists user_fields_cropzone_idx on user_fields (agro_cropzone_id);

-- 4. Lock everything down. RLS on, zero policies => the anon key can do nothing.
--    Server routes use the service-role key, which bypasses RLS by design.
alter table organizations enable row level security;
alter table app_users enable row level security;
alter table user_fields enable row level security;

-- 5. Seed the demo farmer so the existing UI keeps working after the cutover.
--    These are the same 3 real Ruang Kaeo cropzones that were hardcoded in
--    src/lib/config.js before this change — now owned by a real user row
--    instead of being visible to everyone.
insert into app_users (phone, name, role, organization_id)
values ('0800000001', 'Demo Farmer', 'farmer', 'RK')
on conflict (phone) do nothing;

insert into user_fields (app_user_id, organization_id, agro_field_id, agro_cropzone_id, name)
select u.id, 'RK', v.field_id, v.cropzone_id, v.name
from app_users u,
  (values
    ('dc920c1a-1998-4c98-bb0a-d23133f058eb', 'f941d966-9459-4307-ac67-2562ffdae35f', 'RK0540'),
    ('a66960ca-ccdc-469d-bcfd-a8f10a467ada', '434df574-9ce8-435c-ac65-5f248590247d', 'RK0541'),
    ('61698ba0-e7df-4b97-ac17-c4e6c265ff08', '31a771e8-7e92-4c2d-ae7b-a737d64115e5', 'RK0542')
  ) as v(field_id, cropzone_id, name)
where u.phone = '0800000001'
on conflict (app_user_id, agro_field_id) do nothing;

-- A second farmer with NO fields — exists so the isolation test is real:
-- log in as this one and RK0540 must be unreachable, even by direct id.
insert into app_users (phone, name, role, organization_id)
values ('0800000002', 'Second Farmer', 'farmer', 'RK')
on conflict (phone) do nothing;

-- And a contractor, for the กินรี side.
insert into app_users (phone, name, role, organization_id)
values ('0900000001', 'Kinari Contractor', 'contractor', 'RK')
on conflict (phone) do nothing;

-- ============ notebook ============
-- SM26 Simple App — M3: the Digital Notebook (work orders + the contractor's
-- customer list).
--
-- Design note, from version 2 §6 and §8.3: a work order must be saveable with
-- almost nothing in it — a customer name jotted down, no field, no location, no
-- date. "Work first, record later" is the core principle, and it's precisely
-- why AgroAPI's own Booking can't be used here: Booking requires a cropzone,
-- which doesn't exist yet for a brand-new customer. So work orders live in our
-- schema; only the finished work goes back to AgroAPI, as an Activity.
--
-- Run this once in Supabase, after identity-schema.sql.

-- 1. The contractor's customer list. A manual farmer's row IS their whole
--    identity (no AgroAPI account, no app login). A smart farmer's row is a
--    thin pointer to their real app account.
create table if not exists farmers (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  name text not null,
  phone text,
  type text not null default 'manual' check (type in ('manual', 'smart')),
  app_user_id uuid references app_users(id) on delete set null,
  agro_farm_id text,                      -- their Farm inside the org; created on demand (case C)
  created_at timestamptz not null default now()
);

create index if not exists farmers_org_idx on farmers (organization_id);
create index if not exists farmers_app_user_idx on farmers (app_user_id);

-- One customer per name per site. Also what makes the seed at the bottom of
-- this file safe to re-run without piling up duplicate customers.
create unique index if not exists farmers_org_name_idx on farmers (organization_id, name);

-- 2. Relax work_orders so a notebook entry with almost nothing in it can exist.
--    Everything below was NOT NULL from the original farmer-request-only build,
--    which would block every manual (case B/C) entry.
alter table work_orders alter column farmer_org_id drop not null;
alter table work_orders alter column contractor_org_id drop not null;
alter table work_orders alter column field_id drop not null;
alter table work_orders alter column cropzone_id drop not null;
alter table work_orders alter column field_name drop not null;
alter table work_orders alter column activity_type_id drop not null;
alter table work_orders alter column activity_type_name drop not null;
alter table work_orders alter column requested_date drop not null;

alter table work_orders add column if not exists organization_id text references organizations(id);
alter table work_orders add column if not exists farmer_id uuid references farmers(id) on delete set null;
alter table work_orders add column if not exists crop_size_rai numeric;
alter table work_orders add column if not exists location_lat double precision;
alter table work_orders add column if not exists location_lng double precision;
-- booking_date = the day it was written down (drives notebook-style ordering,
-- never shown as an editable field). scheduled_date = the day work should happen.
alter table work_orders add column if not exists booking_date date not null default current_date;
alter table work_orders add column if not exists scheduled_date date;
alter table work_orders add column if not exists source text not null default 'manual';
alter table work_orders add column if not exists note text;

-- 3. Statuses. 'pending' now means "a smart farmer asked, contractor hasn't
--    accepted yet"; 'booked' is an accepted/manual open job; 'completed' is
--    done; 'declined' keeps a declined request out of the queue without
--    silently destroying the record.
alter table work_orders drop constraint if exists work_orders_status_check;
alter table work_orders
  add constraint work_orders_status_check
  check (status in ('pending', 'booked', 'completed', 'declined'));

alter table work_orders drop constraint if exists work_orders_source_check;
alter table work_orders
  add constraint work_orders_source_check
  check (source in ('manual', 'smart_farmer', 'backfilled'));

create index if not exists work_orders_org_idx on work_orders (organization_id);
create index if not exists work_orders_farmer_idx on work_orders (farmer_id);
create index if not exists work_orders_scheduled_idx on work_orders (scheduled_date);

-- 4. Close the last open door. Until now work_orders was readable and writable
--    by anyone holding the anon key — which ships inside the browser bundle.
--    All access moves to server routes using the service-role key, exactly like
--    the identity tables.
drop policy if exists "work orders are readable by anyone using this app" on work_orders;
drop policy if exists "work orders can be created by anyone using this app" on work_orders;
drop policy if exists "work orders can be updated by anyone using this app" on work_orders;

alter table farmers enable row level security;

-- 5. Backfill: existing rows predate organizations, and belong to Ruang Kaeo.
update work_orders set organization_id = 'RK' where organization_id is null;
update work_orders set source = 'smart_farmer' where source = 'manual' and cropzone_id is not null;
update work_orders set scheduled_date = requested_date where scheduled_date is null;

-- 6. A demo customer list for the contractor, so the notebook isn't empty.
insert into farmers (organization_id, name, phone, type)
values
  ('RK', 'พี่แมว', '0810000001', 'manual'),
  ('RK', 'Somchai Boonmee', '0810000002', 'manual'),
  ('RK', 'Anong Srisuk', '0810000003', 'manual')
on conflict (organization_id, name) do nothing;

-- Link the seeded Demo Farmer app account to a smart-farmer customer record,
-- so their app requests land against a real customer in the notebook.
insert into farmers (organization_id, name, phone, type, app_user_id)
select 'RK', u.name, u.phone, 'smart', u.id
from app_users u
where u.phone = '0800000001'
  and not exists (select 1 from farmers f where f.app_user_id = u.id);

-- Adopt the orders that predate this table. They were all created through the
-- Demo Farmer's account during earlier testing, so they belong to that
-- customer — without this they'd render as a job for nobody.
update work_orders
set farmer_id = (
  select f.id from farmers f
  join app_users u on u.id = f.app_user_id
  where u.phone = '0800000001'
  limit 1
)
where farmer_id is null
  and cropzone_id is not null;

-- ============ reports ============
-- SM26 Simple App — M4: work reports.
--
-- A work report is a FROZEN snapshot (version 2 §15.5). The field's boundary
-- may be corrected later and the machine's implement may change, but the
-- numbers a customer was billed from must never silently move. So the polygon,
-- the areas, the width and the charge are all copied in at approval time and
-- never recalculated. Only the ids stay live pointers.
--
-- Run this once in Supabase, after notebook-schema.sql.

create table if not exists work_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),

  -- Live pointers: identity only.
  work_order_id uuid references work_orders(id) on delete set null,
  farmer_id uuid references farmers(id) on delete set null,
  agro_cropzone_id text not null,
  agro_machine_id text not null,

  -- Frozen labels — a machine can be renamed, a field re-registered; the
  -- report should still read the way it did the day it was approved.
  field_name text,
  machine_name text,
  work_type_id text,
  work_type_name text,

  -- Frozen geometry and figures.
  boundary jsonb,                      -- GeoJSON Polygon coordinates as measured
  track_points jsonb,                  -- [{coord:[lng,lat]}] — the truncated (inside-only)
                                        -- trajectory, so the review screen's "coloring book"
                                        -- overlay survives after approval too, not just while
                                        -- the report is still being drafted.
  started_at timestamptz,
  ended_at timestamptz,
  width_m numeric,                     -- implement width used for the calculation
  field_area_m2 numeric,
  work_area_m2 numeric,
  -- The same figure in the unit that was billed (rai / sào). Frozen alongside
  -- the charge it was multiplied into, so no display code has to know the
  -- conversion — and a site with a different unit can't be misread later.
  work_area_units numeric,
  percent_worked numeric,
  inside_distance_m numeric,
  total_distance_m numeric,
  hours numeric,

  -- Frozen money.
  currency text,
  unit_label text,                     -- 'rai' / 'sào' — what the price is per
  price_per_unit numeric,
  service_charge numeric,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),

  -- The permanent AgroAPI record this report produced.
  agroapi_activity_id text,

  created_at timestamptz not null default now()
);

create index if not exists work_reports_org_idx on work_reports (organization_id);
create index if not exists work_reports_cropzone_idx on work_reports (agro_cropzone_id);
create index if not exists work_reports_order_idx on work_reports (work_order_id);

-- One report per machine per field per session start — re-approving the same
-- detected session is a no-op rather than a duplicate bill.
create unique index if not exists work_reports_session_idx
  on work_reports (agro_machine_id, agro_cropzone_id, started_at);

alter table work_reports enable row level security;

-- Added after the first reports existed; backfill from the frozen m² using the
-- site's own unit so old rows read correctly too.
alter table work_reports add column if not exists work_area_units numeric;

update work_reports r
set work_area_units = round((r.work_area_m2 / o.area_unit_m2)::numeric, 2)
from organizations o
where o.id = r.organization_id and r.work_area_units is null;

-- Same idea, for the field's own size — the Report tab's card list and the
-- Phase 4 review screen both need "crop area" in the site's unit, and it
-- shouldn't be re-derived client-side from percent_worked (that's a rounded
-- figure, not the real one).
alter table work_reports add column if not exists field_area_units numeric;

update work_reports r
set field_area_units = round((r.field_area_m2 / o.area_unit_m2)::numeric, 2)
from organizations o
where o.id = r.organization_id and r.field_area_units is null and r.field_area_m2 is not null;

-- Added after the first reports existed; nothing to backfill from — the raw
-- trajectory a pre-existing report was approved from was never kept anywhere
-- else, so those old rows just show the boundary alone, same as before.
alter table work_reports add column if not exists track_points jsonb;

-- ============ services ============
-- SM26 Simple App — M4b: the contractor's own services, pricing and fuel rates.
--
-- AgroAPI carries a Service record per contractor with a fixed price, but a
-- contractor's price list is their own business decision — it changes by season,
-- by customer, by crop — and there's no API to edit it. So pricing lives here,
-- editable in Settings, exactly as version 2 designed it. AgroAPI's own service
-- price is used only as a starting default.
--
-- Fuel is per (machine × service), because burn depends on both: the same
-- tractor uses far more diesel puddling than it does driving a trailer. The
-- rate is L/km, applied to the distance actually driven inside the field.
-- Emissions are then a fixed factor on the fuel burned.
--
-- Run this once in Supabase, after reports-schema.sql.

-- Emissions factor per litre of diesel, per site so it can be tuned.
alter table organizations
  add column if not exists emission_kg_per_l numeric not null default 2.68;

-- 1. The contractor's price list.
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  name text not null,
  -- Which AgroAPI activity this records as, stored as AgroAPI's own canonical
  -- name ('harvesting', 'land_preparation', …) and resolved to a real id at
  -- write time. Storing the id here would hardcode UUIDs that belong to another
  -- system. Nullable: a service the contractor invents still bills fine, it
  -- just records as "Other".
  activity_canonical text,
  price_per_unit numeric not null default 0,
  -- Services are listed in crop-cycle order, not alphabetically: land prep,
  -- planting, fertilizer, chemicals, harvest. That's the sequence a season
  -- actually runs in, so it's the order a contractor thinks in.
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Uniqueness is per contractor, not per site — two businesses in one community
-- may both offer "Harvesting". The index is created in contractors-schema.sql,
-- which is also where the contractor column arrives; defining a site-level one
-- here would fail on re-run once a second contractor exists.
alter table services enable row level security;

-- 2. Fuel burn per machine per service, in litres per kilometre.
create table if not exists machine_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id),
  agro_machine_id text not null,
  service_id uuid not null references services(id) on delete cascade,
  fuel_l_per_km numeric not null default 0,
  -- Working width in metres. Some machines report this themselves in their
  -- telemetry (`work_width`) and that always wins; the rest have no idea, and
  -- without a width there is no area and therefore no bill — so the contractor
  -- sets it here, per machine per job, because the implement changes with the job.
  width_m numeric,
  created_at timestamptz not null default now()
);

alter table machine_rates add column if not exists width_m numeric;
alter table services add column if not exists sort_order integer not null default 100;

create unique index if not exists machine_rates_pair_idx
  on machine_rates (agro_machine_id, service_id);
alter table machine_rates enable row level security;

-- 3. What a report freezes about price and fuel, alongside the areas.
alter table work_reports add column if not exists service_id uuid references services(id);
alter table work_reports add column if not exists service_name text;
alter table work_reports add column if not exists fuel_l_per_km numeric;
alter table work_reports add column if not exists fuel_l numeric;
alter table work_reports add column if not exists emission_kg_per_l numeric;
alter table work_reports add column if not exists emissions_kg numeric;

-- 4. A starting price list for Ruang Kaeo. These are machine services a
--    contractor actually sells — Water supply was dropped (irrigation isn't
--    machine work for this fleet) and Chemical Application added, per the
--    project lead. AgroAPI itself is untouched; only our own list changed. Harvesting's ฿700/rai is กินรี's
--    real published rate from AgroAPI; the rest start at 0 deliberately —
--    better an obvious "set your price" than an invented number a contractor
--    might bill against by accident.
-- Guarded rather than ON CONFLICT, because the unique constraint this used to
-- rely on no longer exists at this point in the script.
insert into services (organization_id, name, activity_canonical, price_per_unit, sort_order)
select v.org, v.name, v.canonical, v.price, v.pos
from (values
  ('RK', 'Land Preparation',     'land_preparation',   0, 10),
  ('RK', 'Planting',             'planting',           0, 20),
  ('RK', 'Fertilizer Application','fertilization',     0, 30),
  -- Spraying: records against AgroAPI's pest_disease type.
  ('RK', 'Chemical Application', 'pest_disease',       0, 40),
  ('RK', 'Harvesting',           'harvesting',       700, 50)
) as v(org, name, canonical, price, pos)
-- Matched on the activity, not the name: a contractor may rename "Fertilizer
-- Application" to whatever they call it, and re-running this file must not
-- resurrect the original as a duplicate.
where not exists (
  select 1 from services s
  where s.organization_id = v.org and s.activity_canonical = v.canonical
);

-- ============ contractors ============
-- SM26 Simple App — M4c: contractors are individual businesses with their own
-- accounts, not a property of the site.
--
-- Until now the contractor's AgroAPI organization hung off the *site* row, so
-- every contractor account in Ruang Kaeo was กินรี. AgroAPI already has four
-- real Thai contractor businesses (กินรี, อรรถพล เต็มเปี่ยม, ดำ, อ้น) and two
-- Vietnamese ones — the moment a second one signs up, that model leaks one
-- contractor's fleet, prices, customers and bills to another.
--
-- So: each contractor account carries its own AgroAPI contractor organization,
-- and everything a contractor owns is scoped to it. The site row keeps its
-- value only as a default for accounts created before this change.
--
-- Run this once, after services-schema.sql.

-- 1. Identity: which business is this account?
alter table app_users add column if not exists contractor_agro_org_id text;

-- 2. Everything a contractor owns, scoped to the business rather than the site.
alter table services          add column if not exists contractor_agro_org_id text;
alter table machine_rates     add column if not exists contractor_agro_org_id text;
alter table work_orders       add column if not exists contractor_agro_org_id_owner text;
alter table work_reports      add column if not exists contractor_agro_org_id text;
-- A customer belongs to the contractor who wrote them down. Smart farmers stay
-- null: they joined the site, and their requests carry the contractor instead.
alter table farmers           add column if not exists contractor_agro_org_id text;

-- 3. Backfill. Ruang Kaeo has had exactly one contractor so far, so every
--    existing row belongs to กินรี.
update app_users u
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = u.organization_id
  and u.role = 'contractor'
  and u.contractor_agro_org_id is null;

update services s
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = s.organization_id and s.contractor_agro_org_id is null;

update machine_rates m
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = m.organization_id and m.contractor_agro_org_id is null;

update work_reports r
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = r.organization_id and r.contractor_agro_org_id is null;

update farmers f
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = f.organization_id
  and f.type = 'manual'
  and f.contractor_agro_org_id is null;

-- work_orders already carries contractor_org_id from the original build; fill
-- the ones that predate it rather than adding a second column's worth of drift.
update work_orders w
set contractor_org_id = o.contractor_agro_org_id
from organizations o
where o.id = w.organization_id and w.contractor_org_id is null;

alter table work_orders drop column if exists contractor_agro_org_id_owner;

-- 4. Price lists are per business, not per site.
drop index if exists services_org_name_idx;
create unique index if not exists services_contractor_name_idx
  on services (contractor_agro_org_id, name);

drop index if exists farmers_org_name_idx;
-- Two contractors may each have a customer called "Somchai" — they're different
-- relationships. Smart farmers (null contractor) stay unique per site.
create unique index if not exists farmers_contractor_name_idx
  on farmers (organization_id, coalesce(contractor_agro_org_id, ''), name);

create index if not exists services_contractor_idx on services (contractor_agro_org_id);
create index if not exists machine_rates_contractor_idx on machine_rates (contractor_agro_org_id);
create index if not exists work_reports_contractor_idx on work_reports (contractor_agro_org_id);
create index if not exists farmers_contractor_idx on farmers (contractor_agro_org_id);

-- ============ cache ============
-- SM26 Simple App — a shared response cache.
--
-- AgroAPI is the slow part of every screen: a weather call is ~1s, decoding an
-- NDVI raster a few seconds, and the work-detection query 2–3s. Most of that
-- work is repeated — the same field's forecast, the same satellite capture, the
-- same finished day's work — so it should be done once and reused.
--
-- In-memory caching alone isn't enough: on Vercel each serverless instance has
-- its own memory and instances come and go, so a cache that lives only in
-- memory misses constantly and dies on every deploy. This table is the shared
-- layer behind it. Memory first, this second, AgroAPI last.
--
-- Run this once in Supabase, after contractors-schema.sql.

create table if not exists api_cache (
  key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists api_cache_expires_idx on api_cache (expires_at);

alter table api_cache enable row level security;

-- Expired rows are ignored on read; this just stops the table growing forever.
-- Safe to run by hand, or from a scheduled job later.
delete from api_cache where expires_at < now() - interval '7 days';

