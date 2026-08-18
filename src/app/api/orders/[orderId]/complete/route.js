import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";

// Marks a work order done and records which real AgroAPI Activity it produced.
// The activity itself is written by the AgroAPI proxy route; this just closes
// the order and stamps the link, so every completed job can be traced to a
// permanent record in FarmAI.
export async function POST(request, { params }) {
  const { orderId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { agroApiActivityId } = await request.json();

  const { data: order } = await supabaseAdmin
    .from("work_orders")
    .select("id, organization_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.organization_id !== user.organization_id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("work_orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      agroapi_activity_id: agroApiActivityId || null,
      unseen_by_farmer: true,
    })
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not complete" }, { status: 500 });
  }
  return Response.json(data);
}
