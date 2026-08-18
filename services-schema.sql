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
