import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { agroCanonicalFor, isValidWorkType } from "@/lib/workTypes";
import { priceIn } from "@/lib/units";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId, canUseContractor } from "@/lib/contractor";

// The contractor's own price list. Version 2 §4.2: services and cost per area
// are the contractor's setting, not a fixed number from anywhere else.
export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  const params = new URL(request.url).searchParams;
  // Booking/report forms only ever want services you can currently book
  // against. Settings' own list needs everything, including services
  // switched off, so the Available/Unavailable toggle has something to show.
  const includeInactive = params.get("includeInactive");

  // A farmer choosing between contractors needs THAT contractor's list —
  // each one prices the same work differently, so "Harvesting ฿700" is
  // meaningless until you know whose list it came from. Validated against the
  // organization's own relationships: without that check a caller could name
  // any contractor and read their prices.
  const requested = params.get("contractorOrgId");
  const scopeTo =
    requested && canUseContractor(user, requested) ? requested : contractorOrgId(user);

  if (requested && !canUseContractor(user, requested)) {
    return Response.json(
      { error: "That contractor does not serve your organization" },
      { status: 403 }
    );
  }

  let query = supabaseAdmin
    .from("services")
    .select("*")
    // A price list belongs to one business, not to the whole community.
    .eq("contractor_agro_org_id", scopeTo);

  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query
    // Crop-cycle order; contractor-added services fall in after.
    .order("sort_order")
    .order("name");

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load services" }, { status: 500 });
  }
  return Response.json(data);
}

export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { name, pricePerUnit, adaptCode } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  // The work type is the contractor's ONE choice; the AgroAPI activity type is
  // derived from it, never asked for separately.
  //
  // Until 2026-09-22 this route took `activityCanonical` and the Settings form
  // hardcoded "other", so every service a contractor created was recorded in
  // AgroAPI as an unclassified activity — a plowing job permanently filed as
  // "other" in the system of record — and exported to ADAPT as UNKNOWN. The
  // column existed, nothing ever set it meaningfully.
  if (!isValidWorkType(adaptCode)) {
    return Response.json(
      { error: "Pick what kind of work this is" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("services")
    .insert({
      // No organization_id: a price list belongs to a contractor, not to a
      // farming community. Every read of this table scopes by
      // contractor_agro_org_id, so the column was written and never read —
      // and under the default-farm-organization design it would have frozen
      // whichever community happened to be selected at creation time
      // (2026-08-23).
      contractor_agro_org_id: contractorOrgId(user),
      name: name.trim(),
      // The contractor types a price in their own currency, per their own area
      // unit. What is stored is THB per m² — canonical, independent of who is
      // looking. Converted here rather than in the browser because the server
      // already knows the community's settings and cannot be lied to about them.
      price_per_m2_thb: priceIn(
        pricePerUnit,
        user.organization.area_unit_m2,
        user.organization.currency
      ),
      adapt_code: adaptCode,
      activity_canonical: agroCanonicalFor(adaptCode),
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json(
      { error: "Could not add service — the name may already exist" },
      { status: 500 }
    );
  }
  return Response.json(data);
}
