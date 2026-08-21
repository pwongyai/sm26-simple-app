import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// Which field boundaries are already reported for the specific time window
// Select Area is currently looking at — for its green/purple map tint.
// "Already reported" is scoped to time, not permanent: land prep reported
// yesterday must not block planting reported today on the same field: two
// real, separate jobs, two separate windows, neither should read as a
// duplicate of the other. A field only tints purple when an existing
// report's own [started_at, ended_at] actually overlaps the window being
// viewed right now — sourced from our own frozen `work_reports` rows, not
// AgroAPI's `bookings/suggested` re-detecting the same work separately.
export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");

  const { data, error } = await supabaseAdmin
    .from("work_reports")
    .select("boundary, started_at, ended_at")
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .not("boundary", "is", null);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load reported boundaries" }, { status: 500 });
  }

  // No window given — same permanent behaviour as before (needed nowhere in
  // this app today, but a safe fallback for any future caller).
  if (!sinceParam || !untilParam) {
    return Response.json(data.map((r) => r.boundary));
  }

  const sinceMs = new Date(sinceParam).getTime();
  const untilMs = new Date(untilParam).getTime();
  const overlapping = data.filter((r) => {
    if (!r.started_at || !r.ended_at) return false;
    const startMs = new Date(r.started_at).getTime();
    const endMs = new Date(r.ended_at).getTime();
    return startMs <= untilMs && endMs >= sinceMs;
  });

  return Response.json(overlapping.map((r) => r.boundary));
}
