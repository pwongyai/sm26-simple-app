-- SM26 Simple App — M4c: contractors are individual businesses with their own
-- accounts, not a property of the site.
--
-- Until now the contractor's AgroAPI organization hung off the *site* row, so
-- every contractor account in Ruang Kaeo was กินรี. AgroAPI already has four
-- real Thai contractor businesses (กินรี, อรรถพล เต็มเปี่ยม, ดำ, อ้น) and two
-- Vietnamese ones — the moment a second one signs up, that model leaks one
-- contractor's fleet, prices, customers and bills to another.
--
-- So: each contractor account carries its own AgroAPI contractor organization,
-- and everything a contractor owns is scoped to it. The site row keeps its
-- value only as a default for accounts created before this change.
--
-- Run this once, after services-schema.sql.

-- 1. Identity: which business is this account?
alter table app_users add column if not exists contractor_agro_org_id text;

-- 2. Everything a contractor owns, scoped to the business rather than the site.
alter table services          add column if not exists contractor_agro_org_id text;
alter table machine_rates     add column if not exists contractor_agro_org_id text;
alter table work_orders       add column if not exists contractor_agro_org_id_owner text;
alter table work_reports      add column if not exists contractor_agro_org_id text;
-- A customer belongs to the contractor who wrote them down. Smart farmers stay
-- null: they joined the site, and their requests carry the contractor instead.
alter table farmers           add column if not exists contractor_agro_org_id text;

-- 3. Backfill. Ruang Kaeo has had exactly one contractor so far, so every
--    existing row belongs to กินรี.
update app_users u
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = u.organization_id
  and u.role = 'contractor'
  and u.contractor_agro_org_id is null;

update services s
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = s.organization_id and s.contractor_agro_org_id is null;

update machine_rates m
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = m.organization_id and m.contractor_agro_org_id is null;

update work_reports r
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = r.organization_id and r.contractor_agro_org_id is null;

update farmers f
set contractor_agro_org_id = o.contractor_agro_org_id
from organizations o
where o.id = f.organization_id
  and f.type = 'manual'
  and f.contractor_agro_org_id is null;

-- work_orders already carries contractor_org_id from the original build; fill
-- the ones that predate it rather than adding a second column's worth of drift.
update work_orders w
set contractor_org_id = o.contractor_agro_org_id
from organizations o
where o.id = w.organization_id and w.contractor_org_id is null;

alter table work_orders drop column if exists contractor_agro_org_id_owner;

-- 4. Price lists are per business, not per site.
drop index if exists services_org_name_idx;
create unique index if not exists services_contractor_name_idx
  on services (contractor_agro_org_id, name);

drop index if exists farmers_org_name_idx;
-- Two contractors may each have a customer called "Somchai" — they're different
-- relationships. Smart farmers (null contractor) stay unique per site.
create unique index if not exists farmers_contractor_name_idx
  on farmers (organization_id, coalesce(contractor_agro_org_id, ''), name);

create index if not exists services_contractor_idx on services (contractor_agro_org_id);
create index if not exists machine_rates_contractor_idx on machine_rates (contractor_agro_org_id);
create index if not exists work_reports_contractor_idx on work_reports (contractor_agro_org_id);
create index if not exists farmers_contractor_idx on farmers (contractor_agro_org_id);
