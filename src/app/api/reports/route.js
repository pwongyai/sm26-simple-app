import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, unassignedFarmerId } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";
import { cropzoneInSite } from "@/lib/siteFarms";
import { EMISSION_KG_PER_L } from "@/lib/emissions";

export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  let query = supabaseAdmin
    .from("work_reports")
    // Explicit columns, not "*", to leave out `track_points` — ~2 kB per report,
    // 19 kB at nine reports and ~2.6 MB at a thousand. Only the map on a single
    // report needs the trace, and that view fetches it itself.
    //
    // `boundary` STAYS. It was excluded on the first attempt at this and the
    // list's polygon thumbnails (ReportThumb, contractor/reports/page.js:236)
    // silently rendered empty — every card showed a blank placeholder. It is
    // also an order of magnitude smaller than the trace: ~630 bytes against
    // ~2 kB, so dropping it saved little and cost the one thing the list draws.
    .select(
      "id, organization_id, work_order_id, farmer_id, agro_cropzone_id, agro_machine_id, boundary, " +
        "field_name, machine_name, work_type_id, work_type_name, started_at, ended_at, " +
        "width_m, field_area_m2, work_area_m2, percent_worked, inside_distance_m, hours, " +
        "currency, unit_label, price_per_unit, service_charge, payment_status, " +
        "agro_activity_id, created_at, service_id, service_name, fuel_l_per_km, fuel_l, " +
        "emission_kg_per_l, emissions_kg, work_area_units, field_area_units, " +
        "contractor_agro_org_id, farmer:farmers(id, name, phone)"
    )
    .eq("contractor_agro_org_id", contractorOrgId(user))
    // Unpaid first: the point of this list is knowing who still owes you
    // (version 2 §14.1). Most recent first within each group.
    // Most recently CREATED report first — the order the contractor made them
    // in, not the order the work happened in. A report written today for a
    // session back in November belongs at the top, because "the one I just
    // finished" is what the contractor is looking for.
    //
    // Two earlier versions of this were wrong. It first sorted on
    // payment_status, which floated every paid report above every unpaid one
    // regardless of age — and backwards even for that intent, since 'paid'
    // sorts before 'unpaid' alphabetically, so ascending buried the money still
    // owed. Grouping by payment does not belong in the sort at all: the
    // All / Unpaid / Paid filter above the list already does it, visibly. It
    // was then changed to started_at, the work date, which is the date the card
    // shows but not the one the contractor thinks in.
    //
    // NOTE for whoever reads the screen and not this file: because the card
    // displays started_at (the work date), the visible dates will NOT run in
    // order. That is correct — the list is newest-written first.
    .order("created_at", { ascending: false });

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
  // Two different answers, and they must not be confused: "this cropzone is
  // outside your community" (403, a real refusal) versus "AgroAPI would not
  // tell us right now" (503, try again). Before 2026-08-23 a truncated site
  // walk produced the first message for the second situation, so a transient
  // hiccup looked like a permissions problem on land the community plainly
  // owns.
  let inSite;
  try {
    inSite = await cropzoneInSite(b.cropzoneId, user.organization.agro_org_id);
  } catch (e) {
    console.error("site check failed", e);
    return Response.json(
      { error: "Could not verify this field with AgroAPI just now — try again" },
      { status: 503 }
    );
  }
  if (!inSite) {
    return Response.json({ error: "That field is not in your organization" }, { status: 403 });
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
      .select("id, farmer_id, cropzone_id, field_name")
      .eq("id", workOrderId)
      .eq("contractor_org_id", contractorOrgId(user))
      .maybeSingle();
    if (!order) {
      return Response.json({ error: "That work order no longer exists" }, { status: 400 });
    }
    // The order must be for the same land as the report. The client chooses
    // the match, and until 2026-08-23 the server took its word for it — which
    // let a report for one field be billed against another field's order (a
    // real case: a Test Plot East report attached to RK0541). It matters more
    // than a mislabelled row, because a successful match writes BACK to the
    // order: crop_size_rai becomes the measured area and scheduled_date
    // becomes the session date, so a wrong match silently rewrites an
    // unrelated job.
    //
    // Deliberately narrow: only enforced when the order actually names a
    // cropzone. Manual orders legitimately have none — Add Work Order allows
    // booking before the field is known — and those must stay matchable.
    if (order.cropzone_id && order.cropzone_id !== b.cropzoneId) {
      return Response.json(
        {
          error:
            "That job is for a different field" +
            (order.field_name ? ` (${order.field_name})` : "") +
            ". Pick the job for this field, or leave it unmatched.",
        },
        { status: 400 }
      );
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
  const assignedExplicitly = !!b.farmerId;
  if (!workOrderId && !farmerId) {
    farmerId = await unassignedFarmerId(user);
  }

  // ---- Ownership follows the contractor's assignment (2026-08-23) ----
  //
  // Naming a customer on a report is how an unclaimed field gets an owner, and
  // how a wrongly-owned one is corrected. The contractor is standing in the
  // field and knows whose it is; most of this community's 630+ AgroAPI plots
  // have no owner on record, and this is the only moment anyone is in a
  // position to say.
  //
  // The trust rule, and it is asymmetric on purpose:
  //
  //   MANUAL customers  — the contractor is the authority. They may claim an
  //                       unowned field, and may transfer one held by another
  //                       manual customer. A manual customer cannot speak for
  //                       themselves; they do not use the app.
  //   SMART farmers     — untouchable. They registered the field themselves
  //                       and can be asked. Nobody overrides them.
  //
  // Only ever runs on an EXPLICIT assignment (b.farmerId). A farmer inherited
  // from a matched work order, or the Unassigned fallback, is not somebody
  // claiming anything.
  if (assignedExplicitly && farmerId) {
    await claimFieldOwnership({ user, cropzoneId: b.cropzoneId, farmerId });
  }

  if (workOrderId) {
    await supabaseAdmin
      .from("work_orders")
      .update({
        status: "completed",
        // How the job finished, not just that it did. Without this the column
        // only ever held 'force_closed', so a properly reported job and one
        // merely marked complete both read as NULL and could not be told
        // apart without joining work_reports (2026-08-23).
        completion_type: "matched",
        completed_at: new Date().toISOString(),
        agro_activity_id: activityId,
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
        agro_activity_id: activityId,
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
      hours: b.hours ?? null,
      currency: user.organization.currency,
      unit_label: user.organization.area_unit,
      service_id: service?.id || null,
      service_name: service?.name || null,
      price_per_unit: b.pricePerUnit ?? null,
      service_charge: b.serviceCharge ?? null,
      fuel_l_per_km: b.fuelLPerKm ?? null,
      fuel_l: b.fuelL ?? null,
      // Frozen from whatever preview actually used (resolved by the
      // machine's real fuel type, src/lib/emissions.js) — never re-derived
      // independently here, or this could silently diverge from the number
      // emissions_kg was actually computed with.
      emission_kg_per_l: b.emissionKgPerL ?? EMISSION_KG_PER_L.diesel,
      emissions_kg: b.emissionsKg ?? null,
      agro_activity_id: activityId,
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

// Claim or transfer a field's ownership on the strength of a contractor's
// report assignment. See the trust rule at the call site.
//
// Never throws into the caller's path: a report that is otherwise correct must
// not fail because ownership bookkeeping did. Anything unexpected is logged and
// the report still saves.
async function claimFieldOwnership({ user, cropzoneId, farmerId }) {
  try {
    // The order's field_id is NULL on backfilled rows, so resolve the field
    // from the cropzone — AgroAPI knows which field it belongs to.
    const { ok, body } = await agroFetch(`/cropzones/${cropzoneId}`);
    const fieldId = ok ? body?.field?.id : null;
    if (!fieldId) return;
    const fieldName = body?.field?.name || body?.name || null;

    const { data: existing } = await supabaseAdmin
      .from("fields")
      .select("agro_field_id, farmer_id, farmers(type, name)")
      .eq("agro_field_id", fieldId)
      .maybeSingle();

    if (!existing) {
      // Unclaimed land: register it to this customer.
      await supabaseAdmin.from("fields").insert({
        agro_field_id: fieldId,
        agro_cropzone_id: cropzoneId,
        farmer_id: farmerId,
        organization_id: user.organization_id,
        name: fieldName || fieldId.slice(0, 8),
      });
      return;
    }

    if (existing.farmer_id === farmerId) return; // already theirs

    // A smart farmer registered this field themselves — they are the authority
    // on it, so the contractor's assignment bills whoever they chose but does
    // NOT move the land.
    if (existing.farmers?.type === "smart") {
      console.warn(
        `ownership unchanged: field ${fieldId} belongs to smart farmer ` +
          `${existing.farmers?.name}; report attributed to ${farmerId}`
      );
      return;
    }

    // Held by another manual customer — the contractor is correcting it.
    await supabaseAdmin
      .from("fields")
      .update({ farmer_id: farmerId, agro_cropzone_id: cropzoneId })
      .eq("agro_field_id", fieldId);
  } catch (e) {
    console.error("claimFieldOwnership failed", e);
  }
}
