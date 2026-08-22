import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { modalWorkWidth } from "@/lib/trajectory";

// Width and fuel are resolved separately — they used to live in one
// function, but they don't actually depend on each other. Width is driven
// by whatever implement is physically attached right now; fuel is a
// property of the machine itself (a default rate, optionally overridden
// per service for work that genuinely burns differently), and has nothing
// to do with the implement.

// Deliberately local-first (stated directly: "we want to enforce our width
// setting ... locally from the app") —
//   1. The implement currently assigned to this machine (Machine Details →
//      Implement) — the most explicit "what's actually attached right now"
//      signal, and the one a contractor expects to control directly.
//   2. The machine's own reported width (NoukiOpenAPI telemetry) — last
//      resort only, since a swapped implement in the field doesn't
//      necessarily show up in what the machine reports.
//
// There used to be a step between those two: machine_rates' per-service
// width_m, from an older Settings width/fuel editor. That editor is gone
// (redundant with Machine Details), so nothing could write width_m any
// more, and its one remaining row was already unreachable — that machine
// has an assigned implement, which wins at step 1. Removed rather than
// left as a branch that can never fire. The column itself is retained for
// history; see DATABASE_ERD.md.
export async function resolveWidth({ machineId, points }) {
  const { data: assignment } = await supabaseAdmin
    .from("machine_implements")
    .select("implement:implements(width_m)")
    .eq("agro_machine_id", machineId)
    .maybeSingle();

  let widthM = assignment?.implement?.width_m != null ? Number(assignment.implement.width_m) : null;
  let widthSource = widthM != null ? "implement" : null;

  if (widthM == null) {
    const reported = modalWorkWidth(points);
    if (reported != null) {
      widthM = reported;
      widthSource = "machine";
    }
  }

  return { widthM, widthSource };
}

// Always local-only (AgroAPI reports no fuel figure) — that machine's
// Default row (service_id null) applies unless the specific work being
// done has its own override. The Default row is new; a plain
// `.find(service_id === X)` never matches it, which silently dropped the
// Default rate wherever this logic was duplicated before this file
// existed.
//
// Fuel type (machine_fuel_types, defaults "diesel") is resolved here too —
// callers need it to pick the right emissions factor
// (src/lib/emissions.js), not just the L/km rate.
export async function resolveFuel({ machineId, serviceId }) {
  const [{ data: rateRows }, { data: fuelTypeRow }] = await Promise.all([
    supabaseAdmin.from("machine_rates").select("service_id, fuel_l_per_km").eq("agro_machine_id", machineId),
    supabaseAdmin.from("machine_fuel_types").select("fuel_type").eq("agro_machine_id", machineId).maybeSingle(),
  ]);

  const perService = (rateRows || []).find((r) => r.service_id === serviceId);
  const defaultRow = (rateRows || []).find((r) => r.service_id === null);

  const fuelLPerKm =
    perService?.fuel_l_per_km != null
      ? Number(perService.fuel_l_per_km)
      : defaultRow?.fuel_l_per_km != null
        ? Number(defaultRow.fuel_l_per_km)
        : null;

  const fuelType = fuelTypeRow?.fuel_type || "diesel";

  return { fuelLPerKm, fuelType };
}
