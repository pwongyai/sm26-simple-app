import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// Which field boundaries this contractor has already reported on, ever —
// for Select Area's green/purple map tint. Sourced directly from our own
// frozen `work_reports` rows instead of asking AgroAPI's `bookings/suggested`
// to separately re-detect the same work for a single day and matching that
// back by boundary string (the old, stale approach) — a field that's been
// reported doesn't stop being reported once its report's date rolls past
// "today", so there's no date to scope this to.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("work_reports")
    .select("boundary")
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .not("boundary", "is", null);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load reported boundaries" }, { status: 500 });
  }

  return Response.json(data.map((r) => r.boundary));
}
