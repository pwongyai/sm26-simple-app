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
