import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { modalWorkWidth } from "@/lib/trajectory";

// Width and fuel for one machine doing one service — resolved from the
// contractor's own local settings first, telemetry only as a last resort.
//
// Width priority, deliberately local-first (stated directly: "we want to
// enforce our width setting and fuel rate setting locally from the app"):
//   1. The implement currently assigned to this machine (Machine Details →
//      Implement) — the most explicit "what's actually attached right now"
//      signal, and the one a contractor expects to control directly.
//   2. machine_rates' per-service width (Settings' older width/fuel editor).
//   3. The machine's own reported width (NoukiOpenAPI telemetry) — last
//      resort only, since a swapped implement in the field doesn't
//      necessarily show up in what the machine reports.
//
// Fuel has always been local-only (AgroAPI reports no fuel figure) — per-
// service override on machine_rates, falling back to that machine's Default
// row (service_id null). The Default row is new; a plain `.find(service_id
// === X)` never matches it, which silently dropped the Default rate
// wherever this logic was duplicated before this file existed.
export async function resolveWidthAndFuel({ machineId, serviceId, points }) {
  const [{ data: assignment }, { data: rateRows }] = await Promise.all([
    supabaseAdmin
      .from("machine_implements")
      .select("implement:implements(width_m)")
      .eq("agro_machine_id", machineId)
      .maybeSingle(),
    supabaseAdmin.from("machine_rates").select("service_id, width_m, fuel_l_per_km").eq("agro_machine_id", machineId),
  ]);

  const perService = (rateRows || []).find((r) => r.service_id === serviceId);
  const defaultRow = (rateRows || []).find((r) => r.service_id === null);

  let widthM = assignment?.implement?.width_m != null ? Number(assignment.implement.width_m) : null;
  let widthSource = widthM != null ? "implement" : null;

  if (widthM == null && perService?.width_m != null) {
    widthM = Number(perService.width_m);
    widthSource = "settings";
  }

  if (widthM == null) {
    const reported = modalWorkWidth(points);
    if (reported != null) {
      widthM = reported;
      widthSource = "machine";
    }
  }

  const fuelLPerKm =
    perService?.fuel_l_per_km != null
      ? Number(perService.fuel_l_per_km)
      : defaultRow?.fuel_l_per_km != null
        ? Number(defaultRow.fuel_l_per_km)
        : null;

  return { widthM, widthSource, fuelLPerKm };
}
