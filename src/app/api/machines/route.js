import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";
import { contractorOrgId } from "@/lib/contractor";

// The contractor's machines — real NoukiSensor records from AgroAPI, including
// each machine's last known GPS position. AgroAPI owns the machine itself;
// `active`/sort order are a local-only display preference layered on top
// (machine_settings, one row per machine) — which machines the Machine tab
// shows and in what order, nothing AgroAPI has any concept of. A machine
// with no row is active by default, sorting after any machine that DOES
// have an explicit position (AgroAPI's own list order as the tiebreaker).
//
// `?activeOnly=1` filters to active machines only — the Machine tab's own
// list. Every other consumer (fuel rates, implement picker, report
// preview's kind lookup, the Manage Machines table itself) needs the full
// list regardless of active state, so that stays the default.
export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  if (!orgId) {
    return Response.json(
      { error: "No contractor organization configured for this site" },
      { status: 500 }
    );
  }

  const activeOnly = new URL(request.url).searchParams.get("activeOnly");

  const [{ ok, status, body }, { data: settingsRows }] = await Promise.all([
    cached(`machines:${orgId}`, TTL.machines, () => agroFetch(`/organizations/${orgId}/machines`)),
    supabaseAdmin
      .from("machine_settings")
      .select("agro_machine_id, active, sort_order")
      .eq("contractor_agro_org_id", orgId),
  ]);
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }

  const settingsById = new Map((settingsRows || []).map((r) => [r.agro_machine_id, r]));

  let machines = body.map((m, index) => {
    const s = settingsById.get(m.id);
    return {
      id: m.id,
      name: m.name,
      kind: m.kind,
      make: m.make,
      model: m.model,
      serialNumber: m.serial_number,
      // GeoJSON Point [lng, lat, altitude] — where the machine was last seen,
      // genuinely sourced from its last real measurement (AgroAPI's own
      // `measurements.order(:read_at).last`). `updated_at` used to be shown
      // here too as a "last seen X ago" label, but that's the sensor
      // *record's* own save timestamp, unrelated to actual telemetry — for
      // one real machine it read "1 year ago" while its true last GPS
      // activity (found via the Latest filter's search) was 4 days prior.
      // Dropped rather than fixed cheaply: getting a trustworthy timestamp
      // means the same backward search "Latest" does, per machine, which
      // is too much to run just for a list view.
      lastLocation: m.location?.coordinates || null,
      fuel: m.metadata || null,
      active: s?.active ?? true,
      sortOrder: s?.sort_order ?? 1000 + index,
    };
  });

  machines.sort((a, b) => a.sortOrder - b.sortOrder);
  if (activeOnly) machines = machines.filter((m) => m.active);

  return Response.json(machines);
}
