-- Local implement catalog (version 3's Implement Picker / Add-Edit Implement),
-- kept entirely at the app level since AgroAPI has no concept of a swappable
-- implement — real machines are live Nouki telemetry devices, but the
-- attached implement (plow, harrow, header width) is something the
-- contractor swaps in the field and must be able to edit without a dev,
-- because it directly drives the area/billing calculation.
-- Width only — fuel is a per-machine/per-service rate that already lives in
-- machine_rates and isn't part of what v3 models on an implement.
create table if not exists implements (
  id uuid primary key default gen_random_uuid(),
  contractor_agro_org_id text not null,
  name text not null,
  width_m numeric,
  created_at timestamptz not null default now()
);

-- Which implement is currently attached to which real AgroAPI machine.
-- One row per machine; nullable implement_id just means "unassigned" rather
-- than deleting the row, so "no implement" and "never asked" stay distinct
-- if that ever matters later.
create table if not exists machine_implements (
  agro_machine_id text primary key,
  contractor_agro_org_id text not null,
  implement_id uuid references implements(id) on delete set null,
  updated_at timestamptz not null default now()
);
