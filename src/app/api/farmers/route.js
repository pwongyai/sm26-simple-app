import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";

// The contractor's customer list. Used by the notebook's search-or-create
// field (version 2 §8.3: typing a name that matches an existing customer
// offers to autofill, to cut repeat data entry) and by Select Area's Match
// Work Order step (a real farmer already known locally — never AgroAPI's
// raw farm-name text — see /api/reports' placeholder-farmer note for why).
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  // Your own customers, plus any smart farmer in this community — they joined
  // the site and can request work from you, so they must be reachable. Another
  // contractor's hand-written customer list is not yours to see.
  const { data, error } = await supabaseAdmin
    .from("farmers")
    .select("id, name, phone, type")
    .eq("organization_id", user.organization_id)
    .or(`contractor_agro_org_id.eq.${contractorOrgId(user)},type.eq.smart`)
    .order("name");

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load customers" }, { status: 500 });
  }
  return Response.json(data);
}

export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { name, phone } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("farmers")
    .insert({
      organization_id: user.organization_id,
      contractor_agro_org_id: contractorOrgId(user),
      name: name.trim(),
      phone: phone?.trim() || null,
      type: "manual",
    })
    .select("id, name, phone, type")
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not add customer" }, { status: 500 });
  }
  return Response.json(data);
}
