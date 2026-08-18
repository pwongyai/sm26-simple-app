import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// Which implement is currently attached to this real AgroAPI machine —
// local-only state, since AgroAPI has no concept of a swappable implement.
export async function GET(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  const { data, error } = await supabaseAdmin
    .from("machine_implements")
    .select("implement_id, implement:implements(*)")
    .eq("agro_machine_id", machineId)
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load implement" }, { status: 500 });
  }
  return Response.json(data?.implement || null);
}

export async function PUT(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { implementId } = await request.json();
  const orgId = contractorOrgId(user);

  const { data, error } = await supabaseAdmin
    .from("machine_implements")
    .upsert(
      {
        agro_machine_id: machineId,
        contractor_agro_org_id: orgId,
        implement_id: implementId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agro_machine_id" }
    )
    .select("implement_id, implement:implements(*)")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not assign implement" }, { status: 500 });
  }
  return Response.json(data.implement || null);
}
