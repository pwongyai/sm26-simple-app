-- SM26: store areas and prices canonically, render them per reader.
--
-- The bug this ends: `work_orders.crop_size_rai` held whatever unit the
-- community happened to use, so a Vietnamese field measured in sào sat in a
-- column called rai. On 2026-09-22 one Huong Ngai order held 10.1 — the correct
-- RAI figure for a 16,165 m² field, written by a hardcoded /1600, in a
-- community configured in sào. Every screen then disagreed with every other.
--
-- A stored number should not depend on who is looking at it. From here:
--
--   area   stored in m²        rendered by dividing by the reader's unit
--   price  stored in THB/m²    rendered by multiplying up to their unit
--                              and converting to their currency
--
-- The column NAMES carry the unit, deliberately. `crop_size_rai` holding sào is
-- exactly how this went unnoticed; `crop_size_m2` and `price_per_m2_thb` cannot
-- lie about themselves.
--
-- NOT TOUCHED: work_reports. Those freeze their own `currency`, `unit_label`
-- and amounts when the work is billed — the one place storing a *rendering* is
-- correct, because the record is of what a farmer was actually charged, in the
-- words they were charged in. Re-expressing one later would rewrite history.
--
-- THB is the base currency by project decision (2026-09-22) at 1 THB = 800 VND.
-- The consequence, recorded rather than discovered: if that rate ever changes,
-- every VND price on screen changes with it. Past reports are unaffected
-- because they are frozen.

begin;

-- ---------------------------------------------------------------- work orders

alter table public.work_orders rename column crop_size_rai to crop_size_m2;

-- Each row held the community's unit, so multiply by that community's m².
update public.work_orders w
   set crop_size_m2 = round((w.crop_size_m2 * o.area_unit_m2)::numeric, 0)
  from public.farm_organizations o
 where o.id = w.organization_id
   and w.crop_size_m2 is not null;


-- ------------------------------------------------------------------- services

alter table public.services rename column price_per_unit to price_per_m2_thb;

-- A price was "per the community's area unit, in the community's currency".
-- Divide out the unit, then convert the currency to THB.
--
-- The community is found through the contractor's active relationship. A
-- contractor serving two communities would be ambiguous here — none do today,
-- and the subquery takes a single row rather than joining, so a second
-- relationship cannot silently double-convert.
update public.services s
   set price_per_m2_thb = round(
         (s.price_per_m2_thb
            / o.area_unit_m2
            / (case when o.currency = 'VND' then 800 else 1 end)
         )::numeric, 8)
  from public.farm_organizations o
 where o.id = (
         select r.farm_organization_id
           from public.farm_contractor_relationships r
          where r.contractor_organization_id = s.contractor_agro_org_id
            and r.status = 'active'
          order by r.is_default desc
          limit 1
       )
   and s.price_per_m2_thb is not null
   and s.price_per_m2_thb <> 0;

commit;
