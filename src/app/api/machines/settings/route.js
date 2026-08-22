import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// One batch write for the Machines tab's Edit mode — active/inactive and
// display order for every machine, saved together (mirrors Settings'
// Services & pricing: one Save commits every row's draft at once, not a
// PATCH per toggle/reorder tap).
export async function PUT(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { settings } = await request.json();
  if (!Array.isArray(settings) || settings.length === 0) {
    return Response.json({ error: "settings must be a non-empty array" }, { status: 400 });
  }

  const orgId = contractorOrgId(user);
  const rows = settings.map(({ machineId, active, sortOrder }) => ({
    agro_machine_id: machineId,
    contractor_agro_org_id: orgId,
    active: !!active,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("machine_settings")
    .upsert(rows, { onConflict: "agro_machine_id" });

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save machine settings" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
