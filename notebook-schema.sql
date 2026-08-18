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
