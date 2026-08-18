import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";

async function loadOrder(orderId, user) {
  const { data } = await supabaseAdmin
    .from("work_orders")
    .select("*, farmer:farmers(id, name, phone, type, app_user_id)")
    .eq("id", orderId)
    .maybeSingle();

  // Same-organization check, and a farmer may only touch their own request.
  if (!data || data.organization_id !== user.organization_id) return null;
  if (user.role !== "contractor" && data.farmer?.app_user_id !== user.id) return null;
  return data;
}

export async function PATCH(request, { params }) {
  const { orderId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  const order = await loadOrder(orderId, user);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updates = {};

  // Marking an order seen is the one thing either side may always do.
  if (body.markSeen) {
    updates[user.role === "contractor" ? "unseen_by_contractor" : "unseen_by_farmer"] = false;
  }

  if (user.role === "contractor") {
    // Accept / decline a smart farmer's request, optionally moving the date —
    // version 2 §8.2: the contractor can adjust the day before confirming.
    if (body.status) {
      if (!["pending", "booked", "completed", "declined"].includes(body.status)) {
        return Response.json({ error: "Unknown status" }, { status: 400 });
      }
      updates.status = body.status;
      // Tell the farmer something happened to their request.
      if (order.source === "smart_farmer") updates.unseen_by_farmer = true;
    }
    // Force Close — the job is genuinely done but never went through the real
    // match-or-backfill report path. v3's own decision: no reason collected,
    // just a lightweight audit trail (who, when).
    if (body.forceClose) {
      updates.status = "completed";
      updates.completion_type = "force_closed";
      updates.history = [
        ...(order.history || []),
        { action: "force_closed", user: user.name, at: new Date().toISOString() },
      ];
      if (order.source === "smart_farmer") updates.unseen_by_farmer = true;
    }
    if (body.scheduledDate !== undefined) updates.scheduled_date = body.scheduledDate;
    if (body.workType !== undefined) {
      updates.activity_type_id = body.workType?.id ?? null;
      updates.activity_type_name = body.workType?.name ?? null;
    }
    if (body.cropSizeRai !== undefined) updates.crop_size_rai = body.cropSizeRai;
    if (body.note !== undefined) updates.note = body.note;
    if (body.lat !== undefined) updates.location_lat = body.lat;
    if (body.lng !== undefined) updates.location_lng = body.lng;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json(order);
  }

  const { data, error } = await supabaseAdmin
    .from("work_orders")
    .update(updates)
    .eq("id", orderId)
    .select("*, farmer:farmers(id, name, phone, type)")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not update" }, { status: 500 });
  }
  return Response.json(data);
}

// Delete is the one terminal action (version 2 §8.6) — no separate "cancel"
// concept, and it applies whatever the order's origin. A farmer may also
// delete, but only their own request and only while it's still pending —
// once the contractor has accepted or completed it, it's their job to manage.
export async function DELETE(request, { params }) {
  const { orderId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  const order = await loadOrder(orderId, user);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "contractor" && order.status !== "pending") {
    return Response.json(
      { error: "This request can no longer be cancelled" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin.from("work_orders").delete().eq("id", orderId);
  if (error) {
    console.error(error);
    return Response.json({ error: "Could not delete" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
