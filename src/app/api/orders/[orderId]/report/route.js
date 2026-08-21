import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, resolveFarmerId } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// The frozen work_reports row behind one work order, if the job has been
// reported yet — the same record the contractor's Report tab shows, scoped
// to whichever side (farmer or contractor) the order actually belongs to.
export async function GET(request, { params }) {
  const { orderId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  const { data: order } = await supabaseAdmin
    .from("work_orders")
    .select("id, organization_id, contractor_org_id, farmer_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.organization_id !== user.organization_id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (user.role === "contractor") {
    if (order.contractor_org_id !== contractorOrgId(user)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    const farmerId = await resolveFarmerId(user);
    if (order.farmer_id !== farmerId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  const { data: report, error } = await supabaseAdmin
    .from("work_reports")
    .select("*, farmer:farmers(id, name, phone)")
    .eq("work_order_id", orderId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load the report" }, { status: 500 });
  }

  return Response.json(report || null);
}
