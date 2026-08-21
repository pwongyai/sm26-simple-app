import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";

// A single frozen report — used when Select Area's tap lands on a field
// that's already been reported (`/api/reports/preview` returns its
// `reportId` instead of computing a new one) and the contractor should just
// see it, not hit a "nothing to review" dead end.
export async function GET(request, { params }) {
  const { reportId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("work_reports")
    .select("*, farmer:farmers(id, name, phone)")
    .eq("id", reportId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load the report" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(data);
}

// Payment status is the one thing about a report that may change after
// approval — every measured figure is frozen (version 2 §15.5).
export async function PATCH(request, { params }) {
  const { reportId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { paymentStatus } = await request.json();
  if (!["paid", "unpaid"].includes(paymentStatus)) {
    return Response.json({ error: "Unknown payment status" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("work_reports")
    .select("id, organization_id")
    .eq("id", reportId)
    .maybeSingle();

  if (!existing || existing.organization_id !== user.organization_id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("work_reports")
    .update({ payment_status: paymentStatus })
    .eq("id", reportId)
    .select("*, farmer:farmers(id, name, phone)")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not update" }, { status: 500 });
  }
  return Response.json(data);
}
