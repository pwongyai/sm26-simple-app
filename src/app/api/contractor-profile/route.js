import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// The contractor's own business profile — version 3's "Contractor Profile" +
// "Home Base Location" Settings sections. One row per business
// (contractor_agro_org_id), not per login, since a business can have more
// than one staff account signed in over time. Row is created lazily on first
// save; GET synthesizes sensible defaults from the session until then.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  const { data, error } = await supabaseAdmin
    .from("contractor_profiles")
    .select("*")
    .eq("contractor_agro_org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load profile" }, { status: 500 });
  }

  return Response.json({
    businessName: data?.business_name ?? user.organization.name,
    ownerName: data?.owner_name ?? user.name,
    phone: data?.phone ?? user.phone,
    lineAccount: data?.line_account ?? null,
    language: data?.language ?? "th",
    homeLat: data?.home_lat ?? null,
    homeLng: data?.home_lng ?? null,
  });
}

export async function PATCH(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const body = await request.json();
  const updates = { contractor_agro_org_id: contractorOrgId(user), organization_id: user.organization_id };
  if (body.businessName !== undefined) updates.business_name = body.businessName;
  if (body.ownerName !== undefined) updates.owner_name = body.ownerName;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.language !== undefined) updates.language = body.language;
  if (body.homeLat !== undefined) updates.home_lat = body.homeLat;
  if (body.homeLng !== undefined) updates.home_lng = body.homeLng;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("contractor_profiles")
    .upsert(updates, { onConflict: "contractor_agro_org_id" })
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save profile" }, { status: 500 });
  }

  return Response.json({
    businessName: data.business_name,
    ownerName: data.owner_name,
    phone: data.phone,
    lineAccount: data.line_account,
    language: data.language,
    homeLat: data.home_lat,
    homeLng: data.home_lng,
  });
}
