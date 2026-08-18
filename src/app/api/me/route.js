import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";
import { agroFetch } from "@/lib/agroapi";

// The signed-in account, for the Profile screen.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  // Which contractor this farmer's requests go to — version 3 shows it, and
  // it's the one piece of the arrangement a farmer can't otherwise see.
  let contractorName = null;
  const orgId = contractorOrgId(user);
  if (orgId) {
    const { ok, body } = await agroFetch("/contractors");
    if (ok) contractorName = (body || []).find((c) => c.id === orgId)?.name || null;
  }

  return Response.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    organization: user.organization.name,
    contractor: contractorName,
    joinedAt: user.created_at,
  });
}

export async function PATCH(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  const { name, phone } = await request.json();
  if (!name?.trim()) {
    return Response.json({ error: "Enter your name" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ name: name.trim(), phone: phone?.trim() || user.phone })
    .eq("id", user.id);

  if (error) {
    // The phone number is the login, so a collision is a real possibility.
    console.error(error);
    return Response.json(
      { error: "Could not save — that phone number may already be in use" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
