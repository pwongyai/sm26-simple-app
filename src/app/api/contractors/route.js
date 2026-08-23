import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { USER_SELECT } from "@/lib/session";

// The contractor businesses a new contractor account can claim, taken from
// AgroAPI's own list of organizations that publish services.
//
// Filtered to this site by the currency their services are priced in — AgroAPI
// doesn't tag contractors by country, but a THB price list is a Thai business
// and a VND one is Vietnamese. Rough, but it keeps a Thai contractor from
// accidentally claiming a Vietnamese business at signup.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  const { ok, body } = await agroFetch("/contractors");
  if (!ok) {
    return Response.json({ error: "Could not load contractors" }, { status: 502 });
  }

  const currency = user.organization.currency;
  const matching = (body || []).filter((c) =>
    (c.services || []).some((s) => s.currency === currency)
  );

  // Which are already claimed? A business with an account shouldn't be
  // claimable by a second person.
  const { data: taken } = await supabaseAdmin
    .from("app_users")
    .select("contractor_agro_org_id")
    .eq("role", "contractor")
    .not("contractor_agro_org_id", "is", null);

  const claimed = new Set((taken || []).map((t) => t.contractor_agro_org_id));

  return Response.json(
    matching.map((c) => ({
      id: c.id,
      name: c.name,
      serviceCount: (c.services || []).length,
      claimed: claimed.has(c.id) && c.id !== user.contractor_agro_org_id,
    }))
  );
}

// Claim a business for this contractor account.
export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { contractorOrgId } = await request.json();
  if (!contractorOrgId) {
    return Response.json({ error: "contractorOrgId is required" }, { status: 400 });
  }

  // Verify it's a real contractor in AgroAPI before storing it.
  const { ok, body } = await agroFetch("/contractors");
  const match = ok && (body || []).find((c) => c.id === contractorOrgId);
  if (!match) {
    return Response.json({ error: "Unknown contractor" }, { status: 404 });
  }

  const { data: taken } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("contractor_agro_org_id", contractorOrgId)
    .neq("id", user.id)
    .maybeSingle();

  if (taken) {
    return Response.json(
      { error: "That business already has an account" },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .update({ contractor_agro_org_id: contractorOrgId })
    .eq("id", user.id)
    .select(USER_SELECT)
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }

  // A brand-new business starts with no price list of its own. Give it the
  // standard set at zero so Settings has something to edit, rather than an
  // empty screen that looks broken.
  const { data: existing } = await supabaseAdmin
    .from("services")
    .select("id")
    .eq("contractor_agro_org_id", contractorOrgId)
    .limit(1);

  if (!existing?.length) {
    await supabaseAdmin.from("services").insert(
      // Crop-cycle order, not alphabetical.
      // Must stay in step with what existing contractors actually have —
      // every contractor in an organization should offer the same set, so a
      // farmer sees a comparable list whoever they pick. "Chemical
      // Application" was deliberately retired (2026-08-22): it mapped only
      // to `pest_disease`, so weed-control work recorded against it went to
      // AgroAPI as a pest & disease activity. Split into the two real
      // services below; do not reintroduce a combined one.
      [
        ["Land Preparation", "land_preparation"],
        ["Planting", "planting"],
        ["Fertilizer Application", "fertilization"],
        ["Pest & Disease Control", "pest_disease"],
        ["Weed Control", "weed_control"],
        ["Harvesting", "harvesting"],
      ].map(([name, canonical], i) => ({
        organization_id: user.organization_id,
        contractor_agro_org_id: contractorOrgId,
        name,
        activity_canonical: canonical,
        price_per_unit: 0,
        sort_order: (i + 1) * 10,
      }))
    );
  }

  return Response.json({ user: data });
}
