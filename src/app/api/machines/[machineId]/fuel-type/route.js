import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// Which fuel this real AgroAPI machine runs on — local-only, AgroAPI has no
// such field. Defaults to diesel (this fleet's overwhelming norm) until a
// contractor says otherwise.
//
// Lives on `machine_settings` (one row per machine, alongside the attached
// implement and active/order). It used to have a table of its own,
// `machine_fuel_types` — same shape, same key — folded in 2026-08-23.
export async function GET(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  const { data, error } = await supabaseAdmin
    .from("machines")
    .select("fuel_type")
    .eq("agro_machine_id", machineId)
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load fuel type" }, { status: 500 });
  }
  return Response.json({ fuelType: data?.fuel_type || "diesel" });
}

export async function PUT(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { fuelType } = await request.json();
  if (!["diesel", "gasoline"].includes(fuelType)) {
    return Response.json({ error: "fuelType must be diesel or gasoline" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("machines").upsert(
    {
      agro_machine_id: machineId,
      contractor_agro_org_id: contractorOrgId(user),
      fuel_type: fuelType,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agro_machine_id" }
  );

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save fuel type" }, { status: 500 });
  }
  return Response.json({ fuelType });
}
