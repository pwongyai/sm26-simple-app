import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";

// Litres per kilometre, real diesel farm machinery — one Default rate per
// machine, plus optional per-job overrides (the same job used costs
// differently on wet vs. dry ground, or with a heavier implement attached).
// A job without its own row just falls back to Default; that's the whole
// point of separating them rather than forcing every job to have a value.
const DEFAULT_L_PER_KM = {
  harvester: 4.0,
  tractor: 1.5,
  utility_vehicle: 0.3,
};

// AgroAPI's own machine.metadata.fuel_consumption is a *distance-per-litre*
// (fuel economy) figure, not litres-per-distance — confirmed against real
// Kubota DC-70G/M-series specs (published fuel burn for machinery this size
// lands at several L/km; AgroAPI's raw value read directly as L/km would
// mean a multi-ton harvester burns less fuel per km than a moped). Its own
// `fuel_consumption_unit` hint ("m/L") is itself inconsistent — present on
// some machine records and missing on others carrying the identical value —
// so it's not trustworthy as a real per-record signal, just corroboration
// that the quantity is "distance per litre." Converting to the L/km this
// app actually needs means inverting, not scaling directly.
function suggestedDefaultLPerKm(machine) {
  const raw = machine?.metadata?.fuel_consumption;
  if (!raw) return DEFAULT_L_PER_KM[machine?.kind] ?? 1.0;
  const kmPerL = raw * 1000;
  return Number((1 / kmPerL).toFixed(2));
}

export async function GET(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

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
      .select("service_id, fuel_l_per_km")
      .eq("contractor_agro_org_id", orgId)
      .eq("agro_machine_id", machineId),
  ]);

  const machine = (machines.ok ? machines.body : []).find((m) => m.id === machineId);
  const suggestedDefault = suggestedDefaultLPerKm(machine);

  const rows = rates.data || [];
  const defaultRow = rows.find((r) => r.service_id === null);
  const overrides = rows
    .filter((r) => r.service_id !== null)
    .map((r) => ({
      serviceId: r.service_id,
      serviceName: services.data?.find((s) => s.id === r.service_id)?.name || "Unknown service",
      fuelLPerKm: r.fuel_l_per_km,
    }));

  return Response.json({
    defaultLPerKm: defaultRow?.fuel_l_per_km ?? null,
    suggestedDefault,
    overrides,
    services: services.data || [],
  });
}

export async function PUT(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { serviceId, fuelLPerKm } = await request.json();
  const orgId = contractorOrgId(user);
  const rate = fuelLPerKm === "" || fuelLPerKm == null ? 0 : Number(fuelLPerKm);

  if (!serviceId) {
    // The Default row — service_id is null, so onConflict can't target the
    // usual (agro_machine_id, service_id) constraint (NULL is never "equal"
    // to NULL there). Check-then-write instead of upsert.
    const { data: existing } = await supabaseAdmin
      .from("machine_rates")
      .select("id")
      .eq("agro_machine_id", machineId)
      .is("service_id", null)
      .maybeSingle();

    const { error } = existing
      ? await supabaseAdmin.from("machine_rates").update({ fuel_l_per_km: rate }).eq("id", existing.id)
      : await supabaseAdmin.from("machine_rates").insert({
            contractor_agro_org_id: orgId,
          agro_machine_id: machineId,
          service_id: null,
          fuel_l_per_km: rate,
        });

    if (error) {
      console.error(error);
      return Response.json({ error: "Could not save the default rate" }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  const { error } = await supabaseAdmin.from("machine_rates").upsert(
    {
      contractor_agro_org_id: orgId,
      agro_machine_id: machineId,
      service_id: serviceId,
      fuel_l_per_km: rate,
    },
    { onConflict: "agro_machine_id,service_id" }
  );

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save this job's rate" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const serviceId = new URL(request.url).searchParams.get("serviceId");
  if (!serviceId) {
    return Response.json({ error: "serviceId required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("machine_rates")
    .delete()
    .eq("agro_machine_id", machineId)
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .eq("service_id", serviceId);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not remove this override" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
