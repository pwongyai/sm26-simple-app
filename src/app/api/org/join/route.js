import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUser, USER_SELECT } from "@/lib/session";

// Lists the sites a user may join. Inactive sites (Vietnam, until the Thailand
// prototype is done) are never returned, so they can't be joined by guessing
// the code either.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, join_code")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load organizations" }, { status: 500 });
  }
  return Response.json(data);
}

// Join by code — the same gesture as v3's QR scan, which encodes this code.
// One organization per user; everything they create afterwards lands in it.
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { code } = await request.json();
  const cleanCode = (code || "").trim().toUpperCase();

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("join_code", cleanCode)
    .eq("active", true)
    .maybeSingle();

  if (!org) {
    return Response.json({ error: "That code isn't valid" }, { status: 404 });
  }

  if (user.organization_id && user.organization_id !== org.id) {
    // Switching sites would orphan everything already created in the old one.
    return Response.json(
      { error: "You already belong to a different organization" },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("app_users")
    .update({ organization_id: org.id })
    .eq("id", user.id)
    .select(USER_SELECT)
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not join" }, { status: 500 });
  }

  return Response.json({ user: updated });
}
