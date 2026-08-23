import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId, contractorNames } from "@/lib/contractor";

// The contractor's own business details — version 3's "Contractor Profile" +
// "Home Base Location" Settings sections.
//
// Reads and writes `contractor_organizations` (one row per business, keyed by
// its AgroAPI organization id). This superseded `contractor_profiles` on
// 2026-08-23: that table held exactly this data under exactly this key, so it
// was always this entity — it is now folded into the contractor organization
// itself. `contractor_profiles` still exists but nothing reads or writes it;
// it is dropped in a follow-up once this has run in production for a while.
//
// The row is created lazily on first save. GET falls back to the session's own
// values so a business that has never been edited still shows something
// sensible rather than blanks.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  const { data, error } = await supabaseAdmin
    .from("contractor_organizations")
    .select("*")
    .eq("agro_contractor_org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load profile" }, { status: 500 });
  }

  // Business name from AgroAPI, which owns it. Owner name and phone come from
  // the one login bound to this business (app_users.contractor_agro_org_id is
  // uniquely indexed, so there is exactly one). Neither is stored here any
  // more — R13, 2026-08-23. The old fallback for businessName was
  // `user.organization.name`, the FARMING community's name, so a contractor
  // who never edited their profile saw their business called "Ruang Kaeo Rice
  // Community".
  const names = await contractorNames([orgId]);

  return Response.json({
    businessName: names.get(orgId) ?? null,
    ownerName: user.name,
    phone: user.phone,
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
  const updates = { agro_contractor_org_id: contractorOrgId(user) };
  // businessName / ownerName / phone are deliberately NOT accepted here. The
  // name belongs to AgroAPI; owner name and phone belong to the login and are
  // changed through PATCH /api/me. Accepting them would write columns that no
  // longer exist (R13).
  if (body.language !== undefined) updates.language = body.language;
  if (body.homeLat !== undefined) updates.home_lat = body.homeLat;
  if (body.homeLng !== undefined) updates.home_lng = body.homeLng;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("contractor_organizations")
    .upsert(updates, { onConflict: "agro_contractor_org_id" })
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save profile" }, { status: 500 });
  }

  const names = await contractorNames([updates.agro_contractor_org_id]);

  return Response.json({
    businessName: names.get(updates.agro_contractor_org_id) ?? null,
    ownerName: user.name,
    phone: user.phone,
    language: data.language,
    homeLat: data.home_lat,
    homeLng: data.home_lng,
  });
}
