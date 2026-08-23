import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, resolveFarmerId } from "@/lib/ownership";
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
  if (user.role !== "farmer") {
    return Response.json({ error: "Farmers only" }, { status: 403 });
  }

  const { name, boundary, cropId, plantingDate } = await request.json();

  // The ownership row tells us which cropzone is the live one for this field.
  const farmerId = await resolveFarmerId(user);
  const { data: owned } = await supabaseAdmin
    .from("fields")
    .select("agro_field_id, agro_cropzone_id")
    .eq("agro_field_id", fieldId)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (!owned) return Response.json({ error: "Not found" }, { status: 404 });

  const applied = [];
  const failed = [];

  // --- Field: name and boundary ---
  const fieldPatch = {};
  if (name?.trim()) fieldPatch.name = name.trim();
  let boundaryGeo = null;
  if (boundary) {
    const ring = boundary[0];
    if (!Array.isArray(ring) || ring.length < 4) {
      return Response.json(
        { error: "A boundary needs at least three points" },
        { status: 400 }
      );
    }
    boundaryGeo = { type: "Polygon", coordinates: boundary };
    fieldPatch.location = boundaryGeo;
  }

  if (Object.keys(fieldPatch).length) {
    const res = await agroFetch(`/fields/${fieldId}`, {
      method: "PATCH",
      body: JSON.stringify(fieldPatch),
    });
    if (res.ok) applied.push(...Object.keys(fieldPatch));
    else failed.push({ part: "field", detail: res.body });
  }

  // --- Cropzone: crop, planting date, and its own copy of the boundary ---
  // A cropzone stores its own `boundary`, snapshotted from the field once at
  // creation time (AgroAPI's `set_default_polygon`) — it never tracks the
  // field's boundary afterwards. Every screen in this app renders the
  // cropzone's boundary (not the field's), so a boundary edit has to patch
  // both records or it silently never shows up.
  const cropzonePatch = {};
  if (cropId) cropzonePatch.crop_id = cropId;
  if (plantingDate) cropzonePatch.planting_date = `${plantingDate}T00:00:00Z`;
  if (boundaryGeo) cropzonePatch.location = boundaryGeo;

  if (Object.keys(cropzonePatch).length && owned.agro_cropzone_id) {
    const res = await agroFetch(`/cropzones/${owned.agro_cropzone_id}`, {
      method: "PATCH",
      body: JSON.stringify(cropzonePatch),
    });
    if (res.ok) {
      applied.push(
        ...Object.keys(cropzonePatch).map((k) =>
          k === "crop_id" ? "crop" : k === "location" ? "cropzone boundary" : k
        )
      );
    } else {
      failed.push({ part: "cropzone", detail: res.body });
    }
  }

  // Keep our own denormalised label in step with the real one.
  if (fieldPatch.name) {
    await supabaseAdmin
      .from("fields")
      .update({ name: fieldPatch.name })
      // Addressed by agro_field_id — the field's own identity, and the table's
      // primary key. The surrogate `id` it replaced identified a "registration"
      // that nothing referenced (R12, 2026-08-23).
      .eq("agro_field_id", owned.agro_field_id);
  }

  if (failed.length && !applied.length) {
    return Response.json({ error: "Nothing could be saved", failed }, { status: 502 });
  }

  return Response.json({ applied, failed });
}
