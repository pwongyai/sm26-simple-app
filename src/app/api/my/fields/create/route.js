import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Create a field the farmer just drew.
//
// The real record goes into AgroAPI — Farm → Field → Cropzone — because that's
// the system of record for land. What AgroAPI cannot express is *who owns it*:
// every farmer in this community shares one organization and one token, so
// AgroAPI sees a single account. Ownership is therefore ours to remember, in
// `user_fields`, and it's the only thing keeping one farmer out of another's
// data. Both halves have to succeed for the field to be usable.
//
// A Farm is created per farmer on first use: it's a thin container, it keeps
// the org's field list navigable, and it means a manual farmer who later gets
// their own account can simply be linked to the Farm that already exists.
export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  const { name, boundary, cropId, plantingDate } = await request.json();

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

  // 1. This farmer's Farm inside the community org.
  let farmId = user.agro_farm_id;
  if (!farmId) {
    const created = await agroFetch(`/organizations/${orgId}/farms`, {
      method: "POST",
      body: JSON.stringify({ name: `${user.name} Farm` }),
    });
    if (!created.ok) {
      return Response.json(
        { error: "Could not create your farm in AgroAPI", detail: created.body },
        { status: 502 }
      );
    }
    farmId = created.body.id;
    await supabaseAdmin
      .from("app_users")
      .update({ agro_farm_id: farmId })
      .eq("id", user.id);
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

  // 3. A cropzone, which is what carries the crop, imagery and activities.
  //    `crop_id` is mandatory, so a farmer who doesn't know gets AgroAPI's own
  //    "unspecified" placeholder rather than being blocked.
  let cropzoneId = null;
  let cropzoneError = null;

  const chosenCrop = cropId || (await unspecifiedCropId());
  if (chosenCrop) {
    const cropzone = await agroFetch(`/fields/${field.body.id}/cropzones`, {
      method: "POST",
      body: JSON.stringify({
        field_id: field.body.id,
        crop_id: chosenCrop,
        name: name.trim(),
        ...(plantingDate ? { planting_date: `${plantingDate}T00:00:00Z` } : {}),
      }),
    });
    if (cropzone.ok) cropzoneId = cropzone.body.id;
    else cropzoneError = cropzone.body;
  }

  // 4. Ours: who owns it. Without this row the field is invisible to everyone,
  //    including the farmer who just drew it.
  const { error } = await supabaseAdmin.from("user_fields").insert({
    app_user_id: user.id,
    organization_id: user.organization_id,
    agro_field_id: field.body.id,
    agro_cropzone_id: cropzoneId,
    name: name.trim(),
  });

  if (error) {
    console.error(error);
    return Response.json(
      { error: "Field was created but could not be linked to your account" },
      { status: 500 }
    );
  }

  return Response.json({
    fieldId: field.body.id,
    cropzoneId,
    areaM2: field.body.area ?? null,
    // Surfaced rather than swallowed: the field exists either way, but without
    // a cropzone there's no imagery, weather or activity history.
    cropzoneError,
  });
}

// AgroAPI's placeholder crop — the catalog entry whose species and variety are
// both "unspecified". Looked up rather than hardcoded.
async function unspecifiedCropId() {
  const { ok, body } = await agroFetch("/crops?page=1");
  if (!ok || !Array.isArray(body)) return null;
  return body.find((c) => c.canonical_name === "unspecified")?.id || null;
}
