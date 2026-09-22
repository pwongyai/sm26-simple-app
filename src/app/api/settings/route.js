import { requireAccess } from "@/lib/ownership";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { areaUnit, isValidAreaUnit, isValidCurrency } from "@/lib/units";

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

  return Response.json({
    currency: data.currency,
    areaUnit: data.area_unit,
    areaUnitM2: data.area_unit_m2,
  });
}
