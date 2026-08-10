-- SM26 Simple App — real work-order schema (supersedes the old profiles/requests
-- tables from the throwaway auth-test pass; those can be dropped, see note below).
--
-- Design principle: AgroAPI already owns Organization/Farm/Field/CropZone/Activity —
-- we never copy that data into our own DB. This table only tracks the ONE thing
-- AgroAPI has no concept of: a *pending* machine-work request, between the moment
-- a farmer asks for it and the moment a contractor actually does it and it becomes
-- a real, completed AgroAPI activity.
--
-- Run this once in your Supabase project's SQL Editor.

create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),

  -- AgroAPI identity — real IDs, not copies of AgroAPI's own records.
  farmer_org_id text not null,       -- the farmer's organization in AgroAPI
  contractor_org_id text not null,   -- the contractor's organization in AgroAPI
  field_id text not null,            -- AgroAPI field id
  cropzone_id text not null,         -- AgroAPI cropzone id — the actual unit of work
  field_name text not null,          -- denormalized display label (e.g. "RK0541")

  -- What's being requested — activity_type comes from AgroAPI's real
  -- GET /activity_types list; name is denormalized so the UI doesn't need
  -- a second lookup just to render a label.
  activity_type_id text not null,
  activity_type_name text not null,
  requested_date date not null,

  -- Our own lifecycle — this is the part AgroAPI has no equivalent for.
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  -- Once the contractor completes the work, this holds the id of the real
  -- Activity record created back in AgroAPI (POST /cropzones/:id/activities) —
  -- the link proving this request became a real, permanent AgroAPI record.
  agroapi_activity_id text,

  -- Notification state — cleared the moment the relevant side opens the order.
  unseen_by_farmer boolean not null default false,
  unseen_by_contractor boolean not null default true
);

create index if not exists work_orders_farmer_org_idx on work_orders (farmer_org_id);
create index if not exists work_orders_contractor_org_idx on work_orders (contractor_org_id);
create index if not exists work_orders_cropzone_idx on work_orders (cropzone_id);
create index if not exists work_orders_status_idx on work_orders (status);

alter table work_orders enable row level security;

-- No per-user login in this test build (see feedback: real email/password auth
-- wastes time for solo click-testing) — policies are open to any request using
-- the app's own key. Tighten this once real distinct farmer/contractor accounts
-- exist, so a farmer can only see their own org's orders.
create policy "work orders are readable by anyone using this app"
  on work_orders for select
  to public
  using (true);

create policy "work orders can be created by anyone using this app"
  on work_orders for insert
  to public
  with check (true);

create policy "work orders can be updated by anyone using this app"
  on work_orders for update
  to public
  using (true)
  with check (true);

-- Optional cleanup: the old email/password test tables are no longer used
-- by the app (auth was replaced with a lightweight role picker). Safe to
-- drop once you've confirmed you don't need them:
-- drop table if exists requests;
-- drop table if exists profiles;
