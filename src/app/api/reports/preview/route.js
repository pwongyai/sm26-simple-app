import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";
import { cropzoneInSite } from "@/lib/siteFarms";
import { fetchMachineTrack } from "@/lib/trajectory";
import { resolveWidthAndFuel } from "@/lib/machineRates";
import { computeWork, clipToPolygon, toUnits, serviceCharge } from "@/lib/engine";

const MAX_DRAW_POINTS = 400;

async function unspecifiedCropId() {
  const { ok, body } = await agroFetch("/crops?page=1");
  if (!ok || !Array.isArray(body)) return null;
  return body.find((c) => c.canonical_name === "unspecified")?.id || null;
}

// The "coloring book" visual, for real: only the part of the track actually
// inside the polygon — travel to/from the field is deliberately not shown,
// since it isn't what got billed.
function insideTrack(points, boundary) {
  const inside = clipToPolygon(points, boundary);
  const step = Math.ceil(inside.length / MAX_DRAW_POINTS) || 1;
  return inside.filter((_, i) => i % step === 0).map((p) => ({ coord: p.coord }));
}

// Compute a report directly from a field the contractor actually tapped on
// Select Area's map — not by asking AgroAPI's own `bookings/suggested` to
// separately re-detect the same work and hoping the two agree on an exact
// boundary match. The contractor already told us which field, once, by
// tapping it; that's the discovery step, done. This just runs the same real
// engine (`computeWork` — trajectory clipped to the polygon, swept by
// implement width, "coloring book" math) directly against the field and
// machine we already know, for the same time window already on screen.
export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fieldId = searchParams.get("fieldId");
  const machineId = searchParams.get("machineId");
  const machineName = searchParams.get("machineName") || null;
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");
  const serviceIdParam = searchParams.get("serviceId");
  // Set only when the contractor corrects the implement on Edit Details —
  // the physical implement was swapped in the field without ever updating
  // Settings' assignment, so this report alone needs a different width than
  // resolveWidthAndFuel() would otherwise pick. A one-off override, not a
  // change to the machine's stored assignment.
  const widthMOverrideParam = searchParams.get("widthM");

  if (!fieldId || !machineId || !sinceParam) {
    return Response.json({ error: "fieldId, machineId, since are required" }, { status: 400 });
  }

  // 1. This field's cropzone — where activities actually get recorded.
  // Some real fields in this org were drawn but never got a cropzone (no
  // crop ever assigned) — same gap Draw Boundary already fixes for a
  // brand-new field, via AgroAPI's own "unspecified" crop placeholder. Do
  // the same thing here rather than dead-ending on a field the contractor
  // can plainly see and tapped on purpose.
  // GET /fields/:id/cropzones is AgroAPI's index action — it returns an
  // array (possibly holding an archived cropzone from a prior renewal
  // alongside the live one), never a single object.
  let cropzoneRes = await agroFetch(`/fields/${fieldId}/cropzones`);
  const existingCropzones = cropzoneRes.ok && Array.isArray(cropzoneRes.body) ? cropzoneRes.body : [];
  const existingCropzone =
    existingCropzones.find((cz) => !cz.archived_at) || existingCropzones[0] || null;
  let cropzoneId = existingCropzone?.id || null;
  let boundary = existingCropzone?.location?.boundary?.coordinates || null;

  if (!cropzoneId) {
    const fieldRes = await agroFetch(`/fields/${fieldId}`);
    boundary = fieldRes.ok ? fieldRes.body?.location?.boundary?.coordinates : null;
    if (!boundary) {
      return Response.json({ error: "This field has no boundary yet" }, { status: 404 });
    }
    const cropId = await unspecifiedCropId();
    if (cropId) {
      const created = await agroFetch(`/fields/${fieldId}/cropzones`, {
        method: "POST",
        body: JSON.stringify({ field_id: fieldId, crop_id: cropId, name: fieldRes.body?.name || "Field" }),
      });
      if (created.ok) cropzoneId = created.body?.id;
    }
    if (!cropzoneId) {
      return Response.json({ error: "Could not create a cropzone for this field" }, { status: 502 });
    }
  }

  // Refuse a cropzone from outside this contractor's own community, same
  // guard every other write/compute path against real AgroAPI data uses.
  if (!(await cropzoneInSite(cropzoneId, user.organization.agro_org_id))) {
    return Response.json({ error: "That field is not in your organization" }, { status: 403 });
  }

  // Already reported? Show it as done rather than recomputing — version 2's
  // green/purple distinction, checked directly instead of through a
  // separately-fetched suggestion list.
  const { data: existingReport } = await supabaseAdmin
    .from("work_reports")
    .select("id")
    .eq("agro_cropzone_id", cropzoneId)
    .eq("agro_machine_id", machineId)
    .maybeSingle();

  const orgId = contractorOrgId(user);
  const sinceMs = new Date(sinceParam).getTime();
  const untilMs = untilParam ? new Date(untilParam).getTime() : Date.now();

  const [track, servicesRes] = await Promise.all([
    fetchMachineTrack(machineId, sinceMs, untilMs),
    supabaseAdmin
      .from("services")
      .select("*")
      .eq("contractor_agro_org_id", orgId)
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (track.failed) {
    return Response.json({ error: "Could not load this machine's track" }, { status: 502 });
  }

  const services = servicesRes.data || [];
  const service = serviceIdParam
    ? services.find((s) => s.id === serviceIdParam) || services[0] || null
    : services[0] || null;

  const resolved = await resolveWidthAndFuel({
    machineId,
    serviceId: service?.id || null,
    points: track.points,
  });
  const widthMOverride = widthMOverrideParam ? Number(widthMOverrideParam) : null;
  const widthM = widthMOverride ?? resolved.widthM;
  const widthSource = widthMOverride != null ? "override" : resolved.widthSource;
  const fuelLPerKm = resolved.fuelLPerKm;

  const work = computeWork({ points: track.points, boundary, widthM });
  const unitM2 = Number(user.organization.area_unit_m2);
  const price = service ? Number(service.price_per_unit) : null;
  const emissionKgPerL = Number(user.organization.emission_kg_per_l ?? 2.68);
  const fuelL =
    fuelLPerKm != null && work ? Number(((work.insideDistanceM / 1000) * fuelLPerKm).toFixed(2)) : null;
  const emissionsKg = fuelL != null ? Number((fuelL * emissionKgPerL).toFixed(2)) : null;

  return Response.json({
    cropzoneId,
    fieldName: cropzoneRes.body?.name || null,
    boundary,
    machineId,
    machineName,
    service: service
      ? { id: service.id, name: service.name, activityCanonical: service.activity_canonical, price }
      : null,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price_per_unit),
      activityCanonical: s.activity_canonical,
    })),
    widthM,
    widthSource,
    work,
    startedAt: work?.firstInside || sinceParam,
    endedAt: work?.lastInside || null,
    trackPoints: insideTrack(track.points, boundary),
    fuelLPerKm,
    fuelL,
    emissionsKg,
    unit: user.organization.area_unit,
    currency: user.organization.currency,
    workAreaUnits: work ? toUnits(work.workAreaM2, unitM2) : null,
    fieldAreaUnits: work ? toUnits(work.fieldAreaM2, unitM2) : null,
    estimatedCharge: work ? serviceCharge({ workAreaM2: work.workAreaM2, unitM2, pricePerUnit: price }) : null,
    reportId: existingReport?.id || null,
  });
}
