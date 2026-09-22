import { requireAccess } from "@/lib/ownership";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  areaUnit,
  convertArea,
  convertMoney,
  convertPricePerUnit,
  isValidAreaUnit,
  isValidCurrency,
  roundMoney,
} from "@/lib/units";

// Read-only site context for the contractor's own UI: which org they're in,
// and the currency/area unit every price and area on screen is expressed in.
//
// This used to also GET/PATCH an org-wide emissions factor
// (organizations.emission_kg_per_l, 2.68). That is gone: emissions now
// resolve per machine from its real fuel type (src/lib/emissions.js, Japan
// MOE factors — diesel 2.619, gasoline 2.322), so a single org-wide number
// was both unsourced and wrong for a gasoline machine. The PATCH had no
// caller left after the Settings page's Emissions section was removed, so
// it went with it rather than sitting here as a way to write a value
// nothing reads. The column was then DROPPED — an earlier note here claimed
// it "stays for historical frozen reports", which was wrong: frozen reports
// carry their own work_reports.emission_kg_per_l, which is what preserves
// history. See DATABASE_ERD.md.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  return Response.json({
    organization: user.organization.name,
    currency: user.organization.currency,
    areaUnit: user.organization.area_unit,
    areaUnitM2: user.organization.area_unit_m2,
  });
}

// Change what the community bills and measures in.
//
// This writes to the FARM ORGANIZATION, not to the contractor — R4 again. So a
// contractor changing it changes what every farmer in that community sees too,
// which is correct (one community, one currency) but is not a private
// preference and the screen says so.
//
// Safe to change at any time: every work report freezes `currency` and
// `unit_label` at the moment it is created, so past reports keep reading in
// whatever was set when the work was done. Only new work is affected.
export async function PATCH(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { currency, areaUnit: unit } = await request.json();
  const updates = {};

  if (currency !== undefined) {
    if (!isValidCurrency(currency)) {
      return Response.json({ error: "Unknown currency" }, { status: 400 });
    }
    updates.currency = currency;
  }

  if (unit !== undefined) {
    if (!isValidAreaUnit(unit)) {
      return Response.json({ error: "Unknown area unit" }, { status: 400 });
    }
    // The label and its size in square metres are one choice, never two.
    // Setting the label alone is how a field comes to read 10.1 under a
    // heading that says sào.
    updates.area_unit = unit;
    updates.area_unit_m2 = areaUnit(unit).m2;
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: "Nothing to change" }, { status: 400 });
  }

  const fromCurrency = user.organization.currency;
  const fromM2 = Number(user.organization.area_unit_m2) || null;
  const toCurrency = updates.currency ?? fromCurrency;
  const toM2 = updates.area_unit_m2 ?? fromM2;

  const { data, error } = await supabaseAdmin
    .from("farm_organizations")
    .update(updates)
    .eq("id", user.organization_id)
    .select("currency, area_unit, area_unit_m2")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }

  const converted = await convertStoredValues({
    organizationId: user.organization_id,
    fromCurrency,
    toCurrency,
    fromM2,
    toM2,
  });

  return Response.json({
    currency: data.currency,
    areaUnit: data.area_unit,
    areaUnitM2: data.area_unit_m2,
    converted,
  });
}

// Re-express the numbers that are stored in the community's units, so a switch
// changes the unit WITHOUT changing what anything is actually worth: 700 THB
// per rai becomes 126,000 VND per sào — the same money for the same ground.
//
// What is deliberately NOT touched: every work_reports column. Each report
// froze its own `currency` and `unit_label` when the work was billed, so it
// still reads exactly as the farmer was charged. Converting one would not be a
// display change, it would be rewriting what somebody paid.
//
// Failures here are logged, not thrown. The setting itself is already saved;
// refusing the whole request afterwards would leave the community's unit
// changed and the caller believing nothing happened.
async function convertStoredValues({ organizationId, fromCurrency, toCurrency, fromM2, toM2 }) {
  const moneyChanged = fromCurrency !== toCurrency;
  const areaChanged = fromM2 && toM2 && fromM2 !== toM2;
  if (!moneyChanged && !areaChanged) return { services: 0, orders: 0 };

  const result = { services: 0, orders: 0 };

  try {
    // Prices belong to contractors, the currency belongs to the community — so
    // every contractor serving this community is affected, not only the one who
    // pressed Save.
    const { data: links } = await supabaseAdmin
      .from("farm_contractor_relationships")
      .select("contractor_organization_id")
      .eq("farm_organization_id", organizationId)
      .eq("status", "active");

    const contractorIds = (links || []).map((l) => l.contractor_organization_id);

    if (contractorIds.length) {
      const { data: services } = await supabaseAdmin
        .from("services")
        .select("id, price_per_unit")
        .in("contractor_agro_org_id", contractorIds);

      for (const svc of services || []) {
        // Area first, then currency: a price is per unit of area, so it moves
        // opposite to the area itself.
        let price = Number(svc.price_per_unit) || 0;
        if (areaChanged) price = convertPricePerUnit(price, fromM2, toM2);
        if (moneyChanged) price = convertMoney(price, fromCurrency, toCurrency);
        price = roundMoney(price, toCurrency);

        if (price !== Number(svc.price_per_unit)) {
          await supabaseAdmin.from("services").update({ price_per_unit: price }).eq("id", svc.id);
          result.services++;
        }
      }
    }

    // Order sizes are an area, so only a unit change moves them. The column is
    // named crop_size_rai but holds whatever unit the community uses — a naming
    // problem recorded in PROGRESS.md, not a behaviour one.
    if (areaChanged) {
      const { data: orders } = await supabaseAdmin
        .from("work_orders")
        .select("id, crop_size_rai")
        .eq("organization_id", organizationId)
        .not("crop_size_rai", "is", null);

      for (const o of orders || []) {
        const size = Number(convertArea(o.crop_size_rai, fromM2, toM2).toFixed(2));
        if (size !== Number(o.crop_size_rai)) {
          await supabaseAdmin.from("work_orders").update({ crop_size_rai: size }).eq("id", o.id);
          result.orders++;
        }
      }
    }
  } catch (e) {
    console.error("could not re-express stored values after a unit change", e);
  }

  return result;
}
