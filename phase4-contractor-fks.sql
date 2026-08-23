-- SM26: declare the contractor relationships that were real but unenforced.
--
-- Six tables carry `contractor_agro_org_id` and none had a foreign key to
-- `contractor_organizations`, so the contractor side of the model was entirely
-- implied. On an ER diagram those tables read as free-floating, which is
-- exactly the wrong impression to give a developer reviewing the design.
--
-- Why it was missed: the schema's rule is "every agro_* column is a raw AgroAPI
-- id, never an enforceable foreign key". True for agro_field_id,
-- agro_cropzone_id, agro_machine_id and agro_org_id — the things that exist
-- only in AgroAPI. But `contractor_agro_org_id` points at
-- contractor_organizations.agro_contractor_org_id, which IS the primary key of
-- a local table. The rule got applied by prefix rather than by what the column
-- actually references.
--
-- Consequence of leaving it: retire a contractor organization and its services,
-- implements, machine settings and fuel rates keep pointing at a dead id,
-- invisible to everyone and fixable only by hand. That is the same failure mode
-- that justified dropping farmers.contractor_agro_org_id.
--
-- Verified before running: ZERO orphan rows in all six tables, so every
-- constraint below is valid against current data with no cleanup.

begin;

-- The contractor's own configuration. If the business is deleted, its price
-- list, implements, machine settings and fuel rates have no meaning — so they
-- go with it. NOT NULL on implements/machines, so CASCADE is the only coherent
-- rule there anyway.
alter table services   add constraint services_contractor_fk
  foreign key (contractor_agro_org_id) references contractor_organizations (agro_contractor_org_id) on delete cascade;

alter table implements add constraint implements_contractor_fk
  foreign key (contractor_agro_org_id) references contractor_organizations (agro_contractor_org_id) on delete cascade;

alter table machines   add constraint machines_contractor_fk
  foreign key (contractor_agro_org_id) references contractor_organizations (agro_contractor_org_id) on delete cascade;

alter table fuel_rates add constraint fuel_rates_contractor_fk
  foreign key (contractor_agro_org_id) references contractor_organizations (agro_contractor_org_id) on delete cascade;

-- A billed record outlives the business that raised it — same reasoning as
-- work_reports.farmer_id, which is SET NULL so a report survives its customer.
alter table work_reports add constraint work_reports_contractor_fk
  foreign key (contractor_agro_org_id) references contractor_organizations (agro_contractor_org_id) on delete set null;

-- Deliberately NOT cascade or set null: a login is a person, and deleting a
-- business should not silently delete their account or quietly strip what makes
-- them a contractor. NO ACTION forces the cleanup to be explicit.
alter table app_users add constraint app_users_contractor_fk
  foreign key (contractor_agro_org_id) references contractor_organizations (agro_contractor_org_id);

commit;

-- NOT added, deliberately: work_reports.agro_machine_id -> machines.
-- A row in `machines` is OPTIONAL by design — a machine with no row is treated
-- as active — so a report can legitimately name a machine nobody configured.
-- A foreign key there would reject valid reports.
