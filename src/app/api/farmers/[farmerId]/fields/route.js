import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Create a field the contractor just drew for one of their own customers
// (Machine tab's Draw Field Boundary — v3's "Case C"). The real record goes
// into AgroAPI — Farm → Field → Cropzone, one brand-new Farm every time, for
// this one field alone — matching the 1-farm-1-field-1-cropzone shape every
// real pre-existing plot in this org already has. Reusing one Farm across a
// farmer's fields (an earlier version of this route did that, via
// farmers.agro_farm_id) breaks silently the moment that farmer's fields
// aren't all in the same place: AgroAPI only ever sets a Farm's own
// `location` once, from whatever field existed in it at the time, and never
// updates it as more fields are added — so a farmer's second field, drawn
// somewhere else entirely, becomes invisible to every location-based search
// near it, no matter how many times it's searched for. One Farm per field
// makes that class of bug structurally impossible: a Farm's location always
// matches its one field's real position.
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
// One customer's registered fields, for the contractor booking a job against
// one of them ("Existing field" on Add Work Order).
//
// The farmer's own /api/my/fields answers the same question for the person who
// owns the land; this answers it for the contractor working it, scoped to the
// one customer they just picked. It is deliberately NOT that route with a
// different guard: the farmer's screen needs the whole crop cycle (planting
// date, DAP, harvested, archived, season end) to sort fields into Active and
// No Active Crop, and it deletes the mapping row on a confirmed 404. Booking a
// job needs none of that — a field is bookable whether or not anything is
// growing in it — so this asks for the shape, the size and the crop label and
// nothing else, and leaves the farmer route's record-keeping alone.
export async function GET(request, { params }) {
  const { farmerId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("fields")
    .select("agro_field_id, agro_cropzone_id, name")
    .eq("farmer_id", farmerId)
    .eq("organization_id", user.organization_id)
    .order("name");

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load this customer's fields" }, { status: 500 });
  }

  // A field with no cropzone is a registered plot with nothing planted — a
  // normal state, and still perfectly bookable. Ask the field itself then.
  const fields = await Promise.all(
    rows.map(async (row) => {
      const { ok, body } = row.agro_cropzone_id
        ? await agroFetch(`/cropzones/${row.agro_cropzone_id}`)
        : await agroFetch(`/fields/${row.agro_field_id}`);

      const base = {
        fieldId: row.agro_field_id,
        cropzoneId: row.agro_cropzone_id,
        name: row.name,
      };
      // AgroAPI unreachable for this one row: show the field by name rather
      // than hide it. A contractor who knows the plot can still book it, and
      // a missing outline is obvious on screen in a way a missing row is not.
      if (!ok) return { ...base, areaM2: null, crop: null, boundary: null };

      return {
        ...base,
        name: body.field?.name || body.name || row.name,
        areaM2: body.area ?? null,
        crop: body.crop?.name_i18n?.en || body.crop?.name || null,
        boundary: body.location?.boundary?.coordinates || null,
      };
    })
  );

  return Response.json(fields);
}

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

  const body = await request.json();

  // Claim an AgroAPI field that already exists, rather than drawing a new one.
  //
  // Most of this org's plots pre-date the app, so they have no `fields` row and
  // read as the "Unassigned" placeholder. Before this, tapping one on the
  // machine map filed the report against that placeholder without ever asking
  // who the customer was — and since the placeholder never has open orders, the
  // Match Work Order step was skipped too, so a real booked job stayed open
  // while its work was reported against nobody (2026-10-14).
  //
  // Naming the customer now records it for good: the next tap on the same plot
  // goes straight to matching that customer's orders. A plot already claimed by
  // someone else is refused rather than silently reassigned — that is a real
  // disagreement about who farms it, and it belongs to a person, not a tap.
  if (body.fieldId && !body.boundary) {
    const { data: existing } = await supabaseAdmin
      .from("fields")
      .select("farmer_id, name, farmers(name)")
      .eq("agro_field_id", body.fieldId)
      .maybeSingle();

    if (existing && existing.farmer_id !== farmerId) {
      const holder = existing.farmers?.name;
      if (holder && holder !== "Unassigned") {
        return Response.json(
          { error: `${existing.name || "That field"} is already recorded as ${holder}'s.` },
          { status: 409 }
        );
      }
    }

    // Read the field back from AgroAPI rather than trusting the caller for
    // its name and cropzone — this row is what every later lookup reads.
    const field = await agroFetch(`/fields/${body.fieldId}`);
    if (!field.ok) {
      return Response.json({ error: "That field is not in AgroAPI" }, { status: 404 });
    }
    // Same rule the report path uses (api/reports/preview): the index action
    // returns an ARRAY that can hold an archived cropzone from a previous
    // renewal alongside the live one, so the live one has to be picked
    // deliberately. Taking [0] here recorded an archived cropzone — or, for a
    // field with none yet, null — while the report that followed resolved a
    // different, real one. The row this writes is what the B.1 field picker
    // and every later booking read, so the two must agree (2026-10-14).
    //
    // A field with no cropzone at all stays null rather than having one
    // created as a side effect of naming its owner; the report path creates
    // it properly, with AgroAPI's "unspecified" crop, when work is reported.
    const cropzones = await agroFetch(`/fields/${body.fieldId}/cropzones`);
    const list = cropzones.ok && Array.isArray(cropzones.body) ? cropzones.body : [];
    const live = list.find((cz) => !cz.archived_at) || list[0] || null;
    const cropzoneId = live?.id ?? null;

    const row = {
      farmer_id: farmerId,
      organization_id: user.organization_id,
      agro_field_id: body.fieldId,
      agro_cropzone_id: cropzoneId,
      name: field.body.name || existing?.name || null,
    };

    const { error: writeError } = existing
      ? await supabaseAdmin.from("fields").update(row).eq("agro_field_id", body.fieldId)
      : await supabaseAdmin.from("fields").insert(row);

    if (writeError) {
      console.error(writeError);
      return Response.json({ error: "Could not record who farms this field" }, { status: 500 });
    }

    return Response.json({
      fieldId: body.fieldId,
      cropzoneId,
      name: row.name,
      areaM2: field.body.area ?? null,
      claimed: true,
    });
  }

  const { boundary } = body;
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

  // 1. A brand-new Farm for this one field alone — see the note above on
  //    why this is never reused across a farmer's other fields.
  const createdFarm = await agroFetch(`/organizations/${orgId}/farms`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!createdFarm.ok) {
    return Response.json(
      { error: "Could not create this field's Farm in AgroAPI", detail: createdFarm.body },
      { status: 502 }
    );
  }
  const farmId = createdFarm.body.id;

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
  await supabaseAdmin.from("fields").insert({
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
