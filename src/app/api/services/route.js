import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// The contractor's own price list. Version 2 §4.2: services and cost per area
// are the contractor's setting, not a fixed number from anywhere else.
export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  // Booking/report forms only ever want services you can currently book
  // against. Settings' own list needs everything, including services
  // switched off, so the Available/Unavailable toggle has something to show.
  const includeInactive = new URL(request.url).searchParams.get("includeInactive");

  let query = supabaseAdmin
    .from("services")
    .select("*")
    // A price list belongs to one business, not to the whole community.
    .eq("contractor_agro_org_id", contractorOrgId(user));

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

  const { name, pricePerUnit, activityCanonical } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("services")
    .insert({
      organization_id: user.organization_id,
      contractor_agro_org_id: contractorOrgId(user),
      name: name.trim(),
      price_per_unit: Number(pricePerUnit) || 0,
      activity_canonical: activityCanonical || "other",
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
