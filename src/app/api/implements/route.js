import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// The contractor's own implement catalog (version 3's Implement Picker).
// Local-only — AgroAPI has no concept of a swappable implement, but its
// width directly drives the area calculation, so it must be editable by the
// contractor without a dev involved.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  const { data, error } = await supabaseAdmin
    .from("implements")
    .select("*")
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .order("name");

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load implements" }, { status: 500 });
  }
  return Response.json(data);
}

export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { name, widthM } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("implements")
    .insert({
      contractor_agro_org_id: contractorOrgId(user),
      name: name.trim(),
      width_m: widthM === "" || widthM == null ? null : Number(widthM),
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not add implement" }, { status: 500 });
  }
  return Response.json(data);
}
