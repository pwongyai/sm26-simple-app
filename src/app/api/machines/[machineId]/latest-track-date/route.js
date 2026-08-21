import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";
import { findLatestActivityDate } from "@/lib/trajectory";

// The "Latest" range option: which calendar day this machine most recently
// reported real GPS data on, found by backward-doubling search (see
// findLatestActivityDate) rather than a day-by-day scan — bounded to a
// handful of probes even for a machine idle for months, and cached.
export async function GET(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  const machines = await agroFetch(`/organizations/${orgId}/machines`);
  if (!machines.ok) {
    return Response.json({ error: "Could not verify machine" }, { status: 502 });
  }
  const machine = machines.body.find((m) => m.id === machineId);
  if (!machine) return Response.json({ error: "Not found" }, { status: 404 });

  const date = await findLatestActivityDate(machineId);
  return Response.json({ date });
}
