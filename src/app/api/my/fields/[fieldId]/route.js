import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Editing a field the farmer owns: its name, its boundary, and what's growing.
//
// The name and boundary belong to the Field; the crop belongs to the Cropzone.
// One request from the app can touch both, so each part is applied
// independently and reported on — a boundary that saves while a crop change
// fails should say exactly that, not roll the whole thing back and lose the
// farmer's work.
export async function PATCH(request, { params }) {
  const { fieldId } = await params;
  const { user, response } = await requireAccess({ fieldId });
  if (response) return response;

  const { name, boundary, cropId } = await request.json();

  // The ownership row tells us which cropzone is the live one for this field.
  const { data: owned } = await supabaseAdmin
    .from("user_fields")
    .select("id, agro_field_id, agro_cropzone_id")
    .eq("agro_field_id", fieldId)
    .eq("app_user_id", user.id)
    .maybeSingle();

  if (!owned) return Response.json({ error: "Not found" }, { status: 404 });

  const applied = [];
  const failed = [];

  // --- Field: name and boundary ---
  const fieldPatch = {};
  if (name?.trim()) fieldPatch.name = name.trim();
  if (boundary) {
    const ring = boundary[0];
    if (!Array.isArray(ring) || ring.length < 4) {
      return Response.json(
        { error: "A boundary needs at least three points" },
        { status: 400 }
      );
    }
    fieldPatch.location = { type: "Polygon", coordinates: boundary };
  }

  if (Object.keys(fieldPatch).length) {
    const res = await agroFetch(`/fields/${fieldId}`, {
      method: "PATCH",
      body: JSON.stringify(fieldPatch),
    });
    if (res.ok) applied.push(...Object.keys(fieldPatch));
    else failed.push({ part: "field", detail: res.body });
  }

  // --- Cropzone: crop and variety ---
  if (cropId && owned.agro_cropzone_id) {
    const res = await agroFetch(`/cropzones/${owned.agro_cropzone_id}`, {
      method: "PATCH",
      body: JSON.stringify({ crop_id: cropId }),
    });
    if (res.ok) applied.push("crop");
    else failed.push({ part: "crop", detail: res.body });
  }

  // Keep our own denormalised label in step with the real one.
  if (fieldPatch.name) {
    await supabaseAdmin
      .from("user_fields")
      .update({ name: fieldPatch.name })
      .eq("id", owned.id);
  }

  if (failed.length && !applied.length) {
    return Response.json({ error: "Nothing could be saved", failed }, { status: 502 });
  }

  return Response.json({ applied, failed });
}
