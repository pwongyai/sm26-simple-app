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
