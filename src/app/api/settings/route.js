import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";

// Site-level settings the contractor can tune. Currently just the emissions
// factor — kg of CO2 per litre of fuel burned. 2.68 is the standard figure for
// diesel and is what version 2 used throughout.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  return Response.json({
    organization: user.organization.name,
    currency: user.organization.currency,
    areaUnit: user.organization.area_unit,
    emissionKgPerL: Number(user.organization.emission_kg_per_l ?? 2.68),
  });
}

export async function PATCH(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { emissionKgPerL } = await request.json();
  const value = Number(emissionKgPerL);
  if (!Number.isFinite(value) || value < 0) {
    return Response.json({ error: "Invalid emissions factor" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ emission_kg_per_l: value })
    .eq("id", user.organization_id);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
  return Response.json({ emissionKgPerL: value });
}
