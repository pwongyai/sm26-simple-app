import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Create a field the contractor just drew for one of their own customers
// (Machine tab's Draw Field Boundary — v3's "Case C"). The real record goes
// into AgroAPI — Farm → Field → Cropzone, one Farm per farmer (found-or-
// created on `farmers.agro_farm_id`, same as a smart farmer's own self-
// service Add Field flow) — matching the 1-farm-1-field-1-cropzone shape
// every real pre-existing farm in this org already has, rather than
// introducing a second structure (one shared Farm for everyone) alongside it.
//
// The name is never typed by the contractor — a contractor has no way to see
// how many fields a farmer already owns, so asking them to name one risks
// two different fields both called "Field 1". Instead it continues this
// org's own existing registry numbering (RK0001…RK0542 are real, pre-app
// plots) via `organizations.next_field_number`, claimed atomically so two
// simultaneous creations can never collide on the same number. This applies
// only here — a smart farmer naming their own field through the farmer app's
// self-service Add Field flow (/api/my/fields/create) picks their own name,
// unaffected.
export async function POST(request, { params }) {
  const { farmerId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { data: farmer } = await supabaseAdmin
    .from("farmers")
    .select("id, name, agro_farm_id")
    .eq("id", farmerId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (!farmer) return Response.json({ error: "Not found" }, { status: 404 });

  const { boundary } = await request.json();
  const ring = boundary?.[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return Response.json(
      { error: "Draw at least three points to make a field" },
      { status: 400 }
    );
  }

  const orgId = user.organization.agro_org_id;

  // Claim the next number in this org's own registry — atomic, so two
  // contractors drawing a field at the same moment never collide.
  const { data: claimedNumber, error: claimError } = await supabaseAdmin.rpc(
    "claim_next_field_number",
    { org_id: user.organization_id }
  );
  if (claimError) {
    console.error(claimError);
    return Response.json({ error: "Could not assign a field number" }, { status: 500 });
  }
  const name = `${user.organization_id}${String(claimedNumber).padStart(4, "0")}`;

  // 1. This farmer's own Farm, found-or-created once.
  let farmId = farmer.agro_farm_id;
  if (!farmId) {
    const created = await agroFetch(`/organizations/${orgId}/farms`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!created.ok) {
      return Response.json(
        { error: "Could not create this farmer's Farm in AgroAPI", detail: created.body },
        { status: 502 }
      );
    }
    farmId = created.body.id;
    await supabaseAdmin
      .from("farmers")
      .update({ agro_farm_id: farmId })
      .eq("id", farmer.id);
  }

  // 2. The field itself, with the drawn boundary.
  const field = await agroFetch(`/farms/${farmId}/fields`, {
    method: "POST",
    body: JSON.stringify({
      name,
      location: { type: "Polygon", coordinates: boundary },
    }),
  });
  if (!field.ok) {
    return Response.json(
      { error: "AgroAPI rejected the field", detail: field.body },
      { status: 502 }
    );
  }

  // 3. A cropzone, which is what carries the crop, imagery and activities —
  //    and, critically, the thing the Report flow's detection matches
  //    against. `crop_id` is mandatory, so this gets AgroAPI's own
  //    "unspecified" placeholder rather than blocking the contractor.
  let cropzoneId = null;
  let cropzoneError = null;

  const chosenCrop = await unspecifiedCropId();
  if (chosenCrop) {
    const cropzone = await agroFetch(`/fields/${field.body.id}/cropzones`, {
      method: "POST",
      body: JSON.stringify({
        field_id: field.body.id,
        crop_id: chosenCrop,
        name,
      }),
    });
    if (cropzone.ok) cropzoneId = cropzone.body.id;
    else cropzoneError = cropzone.body;
  }

  // Record who owns this field the moment it exists — not only once a work
  // order/report happens to reference it. Manual farmers have no app_users
  // row (so they can't go in user_fields), but they still need to surface
  // as an owner the next time this same field comes up in a search.
  await supabaseAdmin.from("farmer_fields").insert({
    farmer_id: farmerId,
    organization_id: user.organization_id,
    agro_field_id: field.body.id,
    agro_cropzone_id: cropzoneId,
    name,
  });

  return Response.json({
    fieldId: field.body.id,
    cropzoneId,
    name,
    areaM2: field.body.area ?? null,
    cropzoneError,
  });
}

async function unspecifiedCropId() {
  const { ok, body } = await agroFetch("/crops?page=1");
  if (!ok || !Array.isArray(body)) return null;
  return body.find((c) => c.canonical_name === "unspecified")?.id || null;
}
