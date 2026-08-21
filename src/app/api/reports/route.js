import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, unassignedFarmerId } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";
import { cropzoneInSite } from "@/lib/siteFarms";

export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  let query = supabaseAdmin
    .from("work_reports")
    .select("*, farmer:farmers(id, name, phone)")
    .eq("contractor_agro_org_id", contractorOrgId(user))
    // Unpaid first: the point of this list is knowing who still owes you
    // (version 2 §14.1). Most recent first within each group.
    .order("payment_status", { ascending: true })
    .order("started_at", { ascending: false });

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load reports" }, { status: 500 });
  }
  return Response.json(data);
}

// Approve a detected session: freeze the numbers, record the work in AgroAPI,
// and make sure the notebook ends up with a matching order.
export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const b = await request.json();
  const required = ["cropzoneId", "machineId", "startedAt"];
  for (const key of required) {
    if (!b[key]) return Response.json({ error: `${key} is required` }, { status: 400 });
  }

  // The field must belong to this contractor's own community. Re-checked here
  // rather than trusted from the request: the suggestion list is filtered, but
  // a cropzone id posted directly would otherwise bypass that.
  if (!(await cropzoneInSite(b.cropzoneId, user.organization.agro_org_id))) {
    return Response.json(
      { error: "That field is not in your organization" },
      { status: 403 }
    );
  }

  // Refuse to bill the same session twice.
  const { data: dupe } = await supabaseAdmin
    .from("work_reports")
    .select("id")
    .eq("agro_cropzone_id", b.cropzoneId)
    .eq("agro_machine_id", b.machineId)
    .eq("started_at", b.startedAt)
    .maybeSingle();

  if (dupe) {
    return Response.json({ error: "Already reported", reportId: dupe.id }, { status: 409 });
  }

  // The contractor's chosen service decides both the price and what this
  // records as in AgroAPI. Its canonical name is resolved to a real activity
  // type id at write time, so no AgroAPI uuid is ever hardcoded here.
  let service = null;
  if (b.serviceId) {
    const { data } = await supabaseAdmin
      .from("services")
      .select("*")
      .eq("id", b.serviceId)
      .eq("contractor_agro_org_id", contractorOrgId(user))
      .maybeSingle();
    service = data || null;
  }

  const types = await agroFetch("/activity_types");
  const canonical = service?.activity_canonical || "other";
  const activityType =
    (types.ok &&
      (types.body.find((t) => t.canonical_name === canonical) ||
        types.body.find((t) => t.canonical_name === "other"))) ||
    null;

  // Write the permanent record into AgroAPI first. If this fails we do not
  // save a report — a report that claims work was recorded when it wasn't is
  // worse than no report.
  let activityId = null;
  if (activityType) {
    const orgId = user.organization.agro_org_id;
    const startDate = String(b.startedAt).slice(0, 10);
    const written = await agroFetch(
      `/cropzones/${b.cropzoneId}/activities?organization_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          activity_type_id: activityType.id,
          start_date: `${startDate}T00:00:00Z`,
          note:
            `${b.workAreaUnits ?? "?"} ${user.organization.area_unit} worked by ` +
            `${b.machineName || "machine"} — recorded via SM26`,
        }),
      }
    );

    if (!written.ok) {
      return Response.json(
        { error: "AgroAPI rejected the activity", detail: written.body },
        { status: 502 }
      );
    }
    activityId = written.body?.id || null;
  }

  // Match or backfill (version 2 §15.4). Which order this report fulfills,
  // if any, is decided by Select Area's own Match Work Order step (real
  // farmer, real open orders, contractor's own choice) — trust that
  // explicit answer rather than re-deriving one here. Orders never carry a
  // cropzone_id (Add Work Order lets a job be booked before a field is
  // known), so an exact-cropzone auto-match essentially never fires; it's
  // kept only as a harmless fallback for whatever old data predates the
  // Match step.
  let workOrderId = b.workOrderId || null;
  let farmerId = b.farmerId || null;
  let matched = false;

  if (workOrderId) {
    const { data: order } = await supabaseAdmin
      .from("work_orders")
      .select("id, farmer_id")
      .eq("id", workOrderId)
      .eq("contractor_org_id", contractorOrgId(user))
      .maybeSingle();
    if (!order) {
      return Response.json({ error: "That work order no longer exists" }, { status: 400 });
    }
    farmerId = order.farmer_id;
    matched = true;
  } else if (!farmerId) {
    const { data: openOrder } = await supabaseAdmin
      .from("work_orders")
      .select("id, farmer_id")
      .eq("contractor_org_id", contractorOrgId(user))
      .eq("cropzone_id", b.cropzoneId)
      .neq("status", "completed")
      .neq("status", "declined")
      .maybeSingle();
    if (openOrder) {
      workOrderId = openOrder.id;
      farmerId = openOrder.farmer_id;
      matched = true;
    }
  }

  // Backfilling a brand-new order for a pre-existing field with no owner on
  // record — fall back to the placeholder rather than leaving it NULL.
  if (!workOrderId && !farmerId) {
    farmerId = await unassignedFarmerId(user);
  }

  if (workOrderId) {
    await supabaseAdmin
      .from("work_orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        agroapi_activity_id: activityId,
        // Reality overwrites the plan: the measured area replaces the estimate.
        crop_size_rai: b.workAreaUnits ?? null,
        scheduled_date: String(b.startedAt).slice(0, 10),
        unseen_by_farmer: true,
      })
      .eq("id", workOrderId);
  } else {
    const { data: created } = await supabaseAdmin
      .from("work_orders")
      .insert({
        organization_id: user.organization_id,
        contractor_org_id: contractorOrgId(user),
        farmer_id: farmerId,
        cropzone_id: b.cropzoneId,
        field_id: b.fieldId || null,
        field_name: b.fieldName || null,
        activity_type_id: activityType?.id || null,
        activity_type_name: activityType?.name || null,
        crop_size_rai: b.workAreaUnits ?? null,
        scheduled_date: String(b.startedAt).slice(0, 10),
        booking_date: String(b.startedAt).slice(0, 10),
        source: "backfilled",
        status: "completed",
        completed_at: new Date().toISOString(),
        agroapi_activity_id: activityId,
      })
      .select("id")
      .single();
    workOrderId = created?.id || null;
  }

  const { data: report, error } = await supabaseAdmin
    .from("work_reports")
    .insert({
      organization_id: user.organization_id,
      contractor_agro_org_id: contractorOrgId(user),
      work_order_id: workOrderId,
      farmer_id: farmerId,
      agro_cropzone_id: b.cropzoneId,
      agro_machine_id: b.machineId,
      field_name: b.fieldName || null,
      machine_name: b.machineName || null,
      work_type_id: activityType?.id || null,
      work_type_name: activityType?.name || null,
      boundary: b.boundary || null,
      track_points: b.trackPoints || null,
      started_at: b.startedAt,
      ended_at: b.endedAt || null,
      width_m: b.widthM ?? null,
      field_area_m2: b.fieldAreaM2 ?? null,
      field_area_units: b.fieldAreaUnits ?? null,
      work_area_m2: b.workAreaM2 ?? null,
      work_area_units: b.workAreaUnits ?? null,
      percent_worked: b.percentWorked ?? null,
      inside_distance_m: b.insideDistanceM ?? null,
      total_distance_m: b.totalDistanceM ?? null,
      hours: b.hours ?? null,
      currency: user.organization.currency,
      unit_label: user.organization.area_unit,
      service_id: service?.id || null,
      service_name: service?.name || null,
      price_per_unit: b.pricePerUnit ?? null,
      service_charge: b.serviceCharge ?? null,
      fuel_l_per_km: b.fuelLPerKm ?? null,
      fuel_l: b.fuelL ?? null,
      emission_kg_per_l: Number(user.organization.emission_kg_per_l ?? 2.68),
      emissions_kg: b.emissionsKg ?? null,
      agroapi_activity_id: activityId,
      // Cash sometimes changes hands on the spot, before the report is even
      // approved — version 3's Payment Status toggle is live on this same
      // screen, not a separate step. Falls back to the column default
      // (unpaid) when not sent.
      ...(b.paymentStatus ? { payment_status: b.paymentStatus } : {}),
    })
    .select("*, farmer:farmers(id, name, phone)")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save report" }, { status: 500 });
  }

  return Response.json({ report, matched, activityId });
}
