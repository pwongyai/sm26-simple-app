import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Create a field the contractor just drew for one of their own customers
// (Machine tab's Draw Field Boundary — v3's "Case C"). The real record goes
// into AgroAPI — Farm → Field → Cropzone — but AgroAPI only needs to know
// about ONE Farm for every locally-drawn field in this community, found-or-
// created once on `organizations.shared_agro_farm_id`, not one per customer.
// Who actually owns/can-access a given field is an app-layer concern, tracked
// entirely in Supabase (`farmers`, `work_orders`) — AgroAPI never needs to
// represent that split; it only ever sees one shared landholding.
export async function POST(request, { params }) {
  const { farmerId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { data: farmer } = await supabaseAdmin
    .from("farmers")
    .select("id, name")
    .eq("id", farmerId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (!farmer) return Response.json({ error: "Not found" }, { status: 404 });

  const { name, boundary } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "Give the field a name" }, { status: 400 });
  }
  const ring = boundary?.[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return Response.json(
      { error: "Draw at least three points to make a field" },
      { status: 400 }
    );
  }

  const orgId = user.organization.agro_org_id;

  // 1. The one shared Farm every locally-drawn field in this community lives
  //    under, found-or-created once.
  let farmId = user.organization.shared_agro_farm_id;
  if (!farmId) {
    const created = await agroFetch(`/organizations/${orgId}/farms`, {
      method: "POST",
      body: JSON.stringify({ name: `${user.organization.name} — SM App Fields` }),
    });
    if (!created.ok) {
      return Response.json(
        { error: "Could not create the shared farm in AgroAPI", detail: created.body },
        { status: 502 }
      );
    }
    farmId = created.body.id;
    await supabaseAdmin
      .from("organizations")
      .update({ shared_agro_farm_id: farmId })
      .eq("id", user.organization.id);
  }

  // 2. The field itself, with the drawn boundary.
  const field = await agroFetch(`/farms/${farmId}/fields`, {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
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
        name: name.trim(),
      }),
    });
    if (cropzone.ok) cropzoneId = cropzone.body.id;
    else cropzoneError = cropzone.body;
  }

  return Response.json({
    fieldId: field.body.id,
    cropzoneId,
    areaM2: field.body.area ?? null,
    cropzoneError,
  });
}

async function unspecifiedCropId() {
  const { ok, body } = await agroFetch("/crops?page=1");
  if (!ok || !Array.isArray(body)) return null;
  return body.find((c) => c.canonical_name === "unspecified")?.id || null;
}
