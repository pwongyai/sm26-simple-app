import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";

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
  // contractor's hand-written customer list is not yours to see. "Unassigned"
  // is excluded — it's the default owner an unclaimed field shows on the map
  // (see /api/agroapi/fields), not a real customer to search for or pick here.
  const { data, error } = await supabaseAdmin
    .from("farmers")
    .select("id, name, phone, type")
    // Community-wide, not per-contractor. The community keeps one book of its
    // members; every contractor it admits sees all of them. Scoping this by
    // contractor was what forced a second contractor to invent a duplicate
    // customer (they could see the land but not its owner), which then split
    // one farmer's history in two and left reports billed against a different
    // record than the field's owner. Security is admission control — a
    // contractor needs a farm_contractor_relationships row to be here at all —
    // not row filtering (2026-08-23).
    .eq("organization_id", user.organization_id)
    .neq("name", "Unassigned")
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
