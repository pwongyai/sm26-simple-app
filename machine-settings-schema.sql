-- SM26 Simple App — which machines show up in the Machine tab, and in what
-- order. AgroAPI has no concept of either; this is purely a local display
-- preference, same shape as machine_implements/machine_fuel_types (one row
-- per machine, agro_machine_id primary key).
--
-- A machine with no row here is active (default true) and sorts after any
-- machine that DOES have an explicit sort_order (handled in application
-- code via AgroAPI's own list order as the fallback, not encoded here).
--
-- Run this once.

create table if not exists machine_settings (
  agro_machine_id        text primary key,
  contractor_agro_org_id text not null,
  active                 boolean not null default true,
  sort_order              integer,
  updated_at              timestamptz not null default now()
);

create index if not exists machine_settings_contractor_idx
  on machine_settings (contractor_agro_org_id);
