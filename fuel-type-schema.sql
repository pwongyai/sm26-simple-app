-- SM26 Simple App — fuel type is now editable per machine (Diesel or
-- Gasoline), not a fixed "Diesel" label in Machine Details' Fuel section.
--
-- One row per machine, same shape as machine_implements (agro_machine_id
-- primary key, contractor_agro_org_id for scoping, updated_at) — a machine's
-- fuel type isn't a per-service thing like machine_rates, so it doesn't
-- belong on that table.
--
-- Run this once.

create table if not exists machine_fuel_types (
  agro_machine_id        text primary key,
  contractor_agro_org_id text not null,
  fuel_type               text not null default 'diesel' check (fuel_type in ('diesel', 'gasoline')),
  updated_at              timestamptz not null default now()
);

create index if not exists machine_fuel_types_contractor_idx
  on machine_fuel_types (contractor_agro_org_id);
