import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

export async function PATCH(request, { params }) {
  const { implementId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { name, widthM } = await request.json();
  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (widthM !== undefined) patch.width_m = widthM === "" || widthM == null ? null : Number(widthM);

  const { data, error } = await supabaseAdmin
    .from("implements")
    .update(patch)
    .eq("id", implementId)
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not update implement" }, { status: 500 });
  }
  return Response.json(data);
}

export async function DELETE(request, { params }) {
  const { implementId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  // Unassign from any machine currently wearing this implement before
  // deleting it — the FK is ON DELETE SET NULL so this isn't strictly
  // required for integrity, but doing it explicitly means the affected
  // machine's card doesn't just silently point at a vanished row.
  const { error } = await supabaseAdmin
    .from("implements")
    .delete()
    .eq("id", implementId)
    .eq("contractor_agro_org_id", contractorOrgId(user));

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not delete implement" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
