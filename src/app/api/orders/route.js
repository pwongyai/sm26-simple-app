import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, resolveFarmerId } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// Work orders, server-side. Previously the browser talked to Supabase directly
// with the anon key and wide-open policies — anyone could read or edit every
// contractor's jobs. Now every read and write goes through here, scoped to the
// caller's organization and role.

export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  let query = supabaseAdmin
    .from("work_orders")
    .select("*, farmer:farmers(id, name, phone, type)")
    .eq("organization_id", user.organization_id)
    .order("booking_date", { ascending: false })
    .order("created_at", { ascending: false });

  // A contractor sees only their own jobs; a farmer only their own requests.
  if (user.role === "contractor") {
    query = query.eq("contractor_org_id", contractorOrgId(user));
  } else {
    const farmerId = await resolveFarmerId(user);
    query = query.eq("farmer_id", farmerId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load work orders" }, { status: 500 });
  }

  // Not every "completed" order has a real report behind it — a simple
  // "Mark work complete" or a Force Close writes no work_reports row at all
  // (see /api/orders/[orderId]/report). The list needs to know which is
  // which so it can badge only the ones a tap will actually open a report
  // for, rather than promising one that isn't there.
  const completedIds = data.filter((o) => o.status === "completed").map((o) => o.id);
  let reportedIds = new Set();
  if (completedIds.length) {
    const { data: reports } = await supabaseAdmin
      .from("work_reports")
      .select("work_order_id")
      .in("work_order_id", completedIds);
    reportedIds = new Set((reports || []).map((r) => r.work_order_id));
  }

  return Response.json(data.map((o) => ({ ...o, has_report: reportedIds.has(o.id) })));
}

export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  const body = await request.json();

  // A farmer's request arrives pending (the contractor must accept it); a
  // contractor writing in their own notebook is already a booked job.
  const isFarmer = user.role !== "contractor";

  let farmerId = body.farmerId || null;

  if (isFarmer) {
    farmerId = await resolveFarmerId(user);
  }

  const { data, error } = await supabaseAdmin
    .from("work_orders")
    .insert({
      organization_id: user.organization_id,
      farmer_id: farmerId,
      farmer_org_id: user.organization.agro_org_id,
      contractor_org_id: contractorOrgId(user),
      field_id: body.fieldId || null,
      cropzone_id: body.cropzoneId || null,
      field_name: body.fieldName || null,
      activity_type_id: body.activityTypeId || null,
      activity_type_name: body.activityTypeName || null,
      crop_size_rai: body.cropSizeRai ?? null,
      location_lat: body.lat ?? null,
      location_lng: body.lng ?? null,
      requested_date: body.scheduledDate || null,
      scheduled_date: body.scheduledDate || null,
      note: body.note || null,
      source: isFarmer ? "smart_farmer" : "manual",
      status: isFarmer ? "pending" : "booked",
      unseen_by_contractor: isFarmer,
      unseen_by_farmer: false,
    })
    .select("*, farmer:farmers(id, name, phone, type)")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not create work order" }, { status: 500 });
  }
  return Response.json(data);
}
