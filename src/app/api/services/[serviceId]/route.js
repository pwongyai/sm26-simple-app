import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

async function guard(serviceId, user) {
  const { data } = await supabaseAdmin
    .from("services")
    .select("id, contractor_agro_org_id")
    .eq("id", serviceId)
    .maybeSingle();
  return data && data.contractor_agro_org_id === contractorOrgId(user) ? data : null;
}

export async function PATCH(request, { params }) {
  const { serviceId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }
  if (!(await guard(serviceId, user))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const updates = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.pricePerUnit !== undefined) updates.price_per_unit = Number(body.pricePerUnit) || 0;
  if (body.activityCanonical !== undefined) updates.activity_canonical = body.activityCanonical;
  // Available/Unavailable toggle (version 3) — disables without deleting, so
  // price history and past reports that used this service keep reading
  // correctly. Same underlying flag DELETE already used, just reachable
  // without losing the row from Settings' own list.
  if (body.active !== undefined) updates.active = !!body.active;

  const { data, error } = await supabaseAdmin
    .from("services")
    .update(updates)
    .eq("id", serviceId)
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not update service" }, { status: 500 });
  }
  return Response.json(data);
}

// Soft delete: past reports reference this service and must keep reading
// correctly, so the row stays and simply stops being offered.
export async function DELETE(request, { params }) {
  const { serviceId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }
  if (!(await guard(serviceId, user))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("services")
    .update({ active: false })
    .eq("id", serviceId);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not remove service" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
