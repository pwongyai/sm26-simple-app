import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";

// Fuel burn per machine per service, litres per kilometre.
//
// Burn genuinely depends on both: the same tractor uses far more diesel
// puddling than pulling a trailer. Where a machine reports its own consumption
// in AgroAPI metadata we use that as the starting default; otherwise we default
// by machine kind. Either way the contractor can change it — these are
// estimates, and they know their fleet.
const DEFAULT_L_PER_KM = {
  harvester: 4.0,
  tractor: 1.5,
  utility_vehicle: 0.3,
};

export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  const [machines, services, rates] = await Promise.all([
    agroFetch(`/organizations/${orgId}/machines`),
    supabaseAdmin
      .from("services")
      .select("id, name")
      .eq("contractor_agro_org_id", orgId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabaseAdmin
      .from("machine_rates")
      .select("*")
      .eq("contractor_agro_org_id", orgId),
  ]);

  return Response.json({
    services: services.data || [],
    machines: (machines.ok ? machines.body : []).map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      // metadata.fuel_consumption is litres per metre where present.
      defaultLPerKm: m.metadata?.fuel_consumption
        ? Number((m.metadata.fuel_consumption * 1000).toFixed(2))
        : (DEFAULT_L_PER_KM[m.kind] ?? 1.0),
      rates: (services.data || []).map((s) => {
        const row = (rates.data || []).find(
          (r) => r.agro_machine_id === m.id && r.service_id === s.id
        );
        return {
          serviceId: s.id,
          serviceName: s.name,
          fuelLPerKm: row?.fuel_l_per_km ?? null,
          widthM: row?.width_m ?? null,
        };
      }),
    })),
  });
}

export async function PUT(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { machineId, serviceId, fuelLPerKm, widthM } = await request.json();
  if (!machineId || !serviceId) {
    return Response.json({ error: "machineId and serviceId required" }, { status: 400 });
  }

  // Only overwrite what was actually sent — the two fields are edited
  // independently in Settings and saving one must not blank the other.
  const { data: existing } = await supabaseAdmin
    .from("machine_rates")
    .select("fuel_l_per_km, width_m")
    .eq("agro_machine_id", machineId)
    .eq("service_id", serviceId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("machine_rates")
    .upsert(
      {
        organization_id: user.organization_id,
        contractor_agro_org_id: contractorOrgId(user),
        agro_machine_id: machineId,
        service_id: serviceId,
        fuel_l_per_km:
          fuelLPerKm !== undefined
            ? Number(fuelLPerKm) || 0
            : (existing?.fuel_l_per_km ?? 0),
        width_m:
          widthM !== undefined
            ? widthM === "" || widthM === null
              ? null
              : Number(widthM)
            : (existing?.width_m ?? null),
      },
      { onConflict: "agro_machine_id,service_id" }
    )
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save rate" }, { status: 500 });
  }
  return Response.json(data);
}
