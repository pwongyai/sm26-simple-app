-- SM26 review batch, phase 2: schema drops.
--
-- Every column below is now unwritten and unread by the DEPLOYED code
-- (commits 082c9ff, 6f0a9fc). Verified by an explicit file walk, not a grep —
-- shell grep silently missed real matches earlier in this review, and a
-- pre-flight check caught one write site (api/contractors seeding
-- services.organization_id) that a first pass had missed.
--
-- Preconditions checked against live data immediately before running:
--   farmer_fields NULL name .............. 0   (so NOT NULL is safe)
--   farmer_fields dup agro_field_id ...... 0   (so it can be the PK)
--   farmers dup (organization_id, name) .. 0   (so the new unique is safe)
--   farmers "Unassigned" per org ......... 1   (RK only; no merge needed)

begin;

-- ---------------------------------------------------------------- R7
-- The customer book belongs to the community, not to whichever contractor
-- wrote a name down. The old unique index PERMITTED two contractors each
-- holding their own "Somchai" — read as a multi-contractor feature when the
-- review began, but it is precisely what let one real farmer become two
-- records with history split between them.
drop index if exists farmers_contractor_name_idx;
drop index if exists farmers_contractor_idx;
alter table farmers drop column contractor_agro_org_id;
create unique index farmers_org_name_idx on farmers (organization_id, name);

-- ---------------------------------------------------------------- R13
-- contractor_organizations keeps only what AgroAPI has no concept of:
-- home base, status, language. The name is AgroAPI's; owner name and phone
-- belong to the one login bound to this business.
alter table contractor_organizations drop column name;
alter table contractor_organizations drop column owner_name;
alter table contractor_organizations drop column phone;
alter table contractor_organizations drop column line_account;

-- ---------------------------------------------------------------- R3
-- Write-only: every read of both tables scopes by contractor_agro_org_id.
alter table services      drop column organization_id;
alter table machine_rates drop column organization_id;

-- ---------------------------------------------------------------- R22
-- Outside a work report's scope: it measured every metre the machine moved in
-- the session window, so one report showed 159 km against a 2.78 rai field
-- with 0 m inside the boundary.
alter table work_reports drop column total_distance_m;

-- ---------------------------------------------------------------- R12
-- farmer_fields is not a junction table: a field has exactly one owner, so
-- the AgroAPI field id is the natural key. Making it the PK also makes
-- "one field, two owners" structurally impossible, which the old
-- (farmer_id, agro_field_id) unique permitted.
--
-- Nothing anywhere holds a foreign key to farmer_fields.id, which is what
-- makes this local rather than sprawling.
alter table farmer_fields alter column name set not null;
alter table farmer_fields drop constraint farmer_fields_farmer_id_agro_field_id_key;
alter table farmer_fields drop constraint farmer_fields_pkey;
alter table farmer_fields drop column id;
alter table farmer_fields add primary key (agro_field_id);
-- Redundant now that agro_field_id is the primary key.
drop index if exists farmer_fields_field_idx;

commit;
