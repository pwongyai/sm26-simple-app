import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";
import { cropzoneInSite } from "@/lib/siteFarms";
import { fetchMachineTrack } from "@/lib/trajectory";
import { resolveWidth, resolveFuel } from "@/lib/machineRates";
import { computeWork, clipToPolygon, toUnits, serviceCharge } from "@/lib/engine";
import { cached, TTL } from "@/lib/cache";
import { doesFieldwork, defaultCanonicalForKind } from "@/lib/workTypes";
import { emissionKgPerLForFuelType } from "@/lib/emissions";

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
  // An alternative entry point to the same cropzone — used when re-running
  // this same preview for a corrected implement width (Edit Details), where
  // the field was already resolved once and re-resolving it from scratch
  // would be redundant. Skips step 1 entirely below.
  const cropzoneIdParam = searchParams.get("cropzoneId");
  const machineId = searchParams.get("machineId");
  const machineName = searchParams.get("machineName") || null;
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");
  const serviceIdParam = searchParams.get("serviceId");
  // Set only when the contractor corrects the implement on Edit Details —
  // the physical implement was swapped in the field without ever updating
  // Settings' assignment, so this report alone needs a different width than
  // resolveWidth() would otherwise pick. A one-off override, not a
  // change to the machine's stored assignment.
  const widthMOverrideParam = searchParams.get("widthM");

  if (!(fieldId || cropzoneIdParam) || !machineId || !sinceParam) {
    return Response.json(
      { error: "fieldId (or cropzoneId), machineId, since are required" },
      { status: 400 }
    );
  }

  const sinceMs = new Date(sinceParam).getTime();
  const untilMs = untilParam ? new Date(untilParam).getTime() : Date.now();

  // Work type assignment, version 1 (LOGIC_SPEC.md §2): a machine's own
  // AgroAPI `kind` decides both whether it does fieldwork at all, and which
  // service this report should default to if the caller didn't pick one.
  // A service/utility vehicle gets no default at all (see the service
  // selection below) — but the contractor can still manually pick a
  // service and generate a report for one if they choose to. No block:
  // this is a default-selection convenience, not a structural restriction.
  const machinesOrgId = contractorOrgId(user);
  const { body: orgMachines } = await cached(
    `machines:${machinesOrgId}`,
    TTL.machines,
    () => agroFetch(`/organizations/${machinesOrgId}/machines`)
  );
  const machineKind = Array.isArray(orgMachines)
    ? orgMachines.find((m) => m.id === machineId)?.kind || null
    : null;
  const machineDoesFieldwork = doesFieldwork(machineKind);
  const defaultCanonical = defaultCanonicalForKind(machineKind);

  // Already reported *for this window*? Checked as early as possible and
  // re-checked once cropzoneId is fully resolved below — a tap on an
  // already-reported field only ever needs this id to redirect to the real,
  // frozen report (see SelectArea's onViewExisting), so it must never pay
  // for a real machine-track fetch or a real buffer/union/intersect
  // geometry computation whose result is about to be thrown away. Scoped to
  // whether an existing report's own [started_at, ended_at] actually
  // overlaps the window being viewed right now, not merely whether this
  // cropzone/machine pair has ever been reported at all — land prep
  // reported yesterday must not block planting being reported today.
  async function findExistingReport(czId) {
    const { data } = await supabaseAdmin
      .from("work_reports")
      .select("id, started_at, ended_at")
      .eq("agro_cropzone_id", czId)
      .eq("agro_machine_id", machineId);
    // Not .maybeSingle(): the same cropzone/machine legitimately has more
    // than one report over time once each is scoped to its own window.
    return (data || []).find((r) => {
      if (!r.started_at || !r.ended_at) return false;
      const startMs = new Date(r.started_at).getTime();
      const endMs = new Date(r.ended_at).getTime();
      return startMs <= untilMs && endMs >= sinceMs;
    });
  }

  let cropzoneId = null;
  let boundary = null;
  let fieldName = null;

  if (cropzoneIdParam) {
    // The id is already known — no AgroAPI call needed to find out whether
    // this is already reported.
    const existing = await findExistingReport(cropzoneIdParam);
    if (existing) return Response.json({ reportId: existing.id });

    const cz = await agroFetch(`/cropzones/${cropzoneIdParam}`);
    if (!cz.ok) {
      return Response.json({ error: "This cropzone no longer exists" }, { status: 404 });
    }
    cropzoneId = cropzoneIdParam;
    boundary = cz.body?.location?.boundary?.coordinates || null;
    fieldName = cz.body?.name || null;
    if (!boundary) {
      return Response.json({ error: "This field has no boundary yet" }, { status: 404 });
    }
  } else {
    // A field created through this app already has its cropzone id cached
    // locally (farmer_fields) — check for an existing report using that,
    // entirely skipping AgroAPI, before falling back to the slow real
    // resolution below (needed regardless for a real pre-existing field
    // this app never wrote a mapping row for, or for boundary once we know
    // this genuinely isn't already reported).
    const { data: cached } = await supabaseAdmin
      .from("fields")
      .select("agro_cropzone_id")
      .eq("agro_field_id", fieldId)
      .eq("organization_id", user.organization_id)
      .maybeSingle();
    if (cached?.agro_cropzone_id) {
      const existing = await findExistingReport(cached.agro_cropzone_id);
      if (existing) return Response.json({ reportId: existing.id });
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
    cropzoneId = existingCropzone?.id || null;
    boundary = existingCropzone?.location?.boundary?.coordinates || null;
    fieldName = existingCropzone?.name || null;

    if (!cropzoneId) {
      const fieldRes = await agroFetch(`/fields/${fieldId}`);
      boundary = fieldRes.ok ? fieldRes.body?.location?.boundary?.coordinates : null;
      fieldName = fieldRes.ok ? fieldRes.body?.name : null;
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
  }

  // Refuse a cropzone from outside this contractor's own community, same
  // guard every other write/compute path against real AgroAPI data uses.
  if (!(await cropzoneInSite(cropzoneId, user.organization.agro_org_id))) {
    return Response.json({ error: "That field is not in your organization" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);

  // Re-checked with the now-fully-resolved cropzoneId: covers a real
  // pre-existing field with no farmer_fields row (the fast check above
  // never ran for it), or a farmer_fields row whose cached id turned out
  // stale.
  const existingReport = await findExistingReport(cropzoneId);
  if (existingReport) {
    return Response.json({ reportId: existingReport.id });
  }

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
  // No explicit service picked — default to whichever of this contractor's
  // own services matches this machine kind's default work type (version 1,
  // LOGIC_SPEC.md §2). A non-fieldwork kind (utility vehicle, etc.) gets no
  // default and no first-in-list fallback either — left unselected so the
  // contractor sees a real "choose one" instead of a guessed-wrong service;
  // they can still pick one manually and generate a report either way.
  const defaultService = defaultCanonical
    ? services.find((s) => s.activity_canonical === defaultCanonical)
    : null;
  const service = serviceIdParam
    ? services.find((s) => s.id === serviceIdParam) || services[0] || null
    : defaultService || (machineDoesFieldwork ? services[0] : null) || null;

  const [widthResolved, fuelResolved] = await Promise.all([
    resolveWidth({ machineId, points: track.points }),
    resolveFuel({ machineId, serviceId: service?.id || null }),
  ]);
  const widthMOverride = widthMOverrideParam ? Number(widthMOverrideParam) : null;
  const widthM = widthMOverride ?? widthResolved.widthM;
  const widthSource = widthMOverride != null ? "override" : widthResolved.widthSource;
  const fuelLPerKm = fuelResolved.fuelLPerKm;

  const work = computeWork({ points: track.points, boundary, widthM });
  const unitM2 = Number(user.organization.area_unit_m2);
  const price = service ? Number(service.price_per_unit) : null;
  const emissionKgPerL = emissionKgPerLForFuelType(fuelResolved.fuelType);
  const fuelL =
    fuelLPerKm != null && work ? Number(((work.insideDistanceM / 1000) * fuelLPerKm).toFixed(2)) : null;
  const emissionsKg = fuelL != null ? Number((fuelL * emissionKgPerL).toFixed(2)) : null;

  return Response.json({
    cropzoneId,
    fieldName,
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
    emissionKgPerL,
    emissionsKg,
    unit: user.organization.area_unit,
    currency: user.organization.currency,
    workAreaUnits: work ? toUnits(work.workAreaM2, unitM2) : null,
    fieldAreaUnits: work ? toUnits(work.fieldAreaM2, unitM2) : null,
    estimatedCharge: work ? serviceCharge({ workAreaM2: work.workAreaM2, unitM2, pricePerUnit: price }) : null,
    // Always null here — the existingReport branch above already returned.
    reportId: null,
  });
}
