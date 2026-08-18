import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setSession } from "@/lib/session";

// Find-or-create by phone number, no verification code (prototype — see
// identity-schema.sql). An existing phone signs back into the same account from
// any device, which is what makes fields survive a new browser; a new phone
// creates an account and lands on the join-organization step.
export async function POST(request) {
  const { phone, name, role } = await request.json();

  const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
  if (!cleanPhone) {
    return Response.json({ error: "Phone number is required" }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("app_users")
    .select("*, organization:organizations(*)")
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (lookupError) {
    console.error(lookupError);
    return Response.json({ error: "Could not sign in" }, { status: 500 });
  }

  if (existing) {
    await setSession(existing.id);
    return Response.json({ user: existing, created: false });
  }

  if (!name || !role) {
    // First time this number is seen — the client needs to collect the rest.
    return Response.json({ needsSignup: true }, { status: 200 });
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("app_users")
    .insert({ phone: cleanPhone, name, role })
    .select("*, organization:organizations(*)")
    .single();

  if (insertError) {
    console.error(insertError);
    return Response.json({ error: "Could not create account" }, { status: 500 });
  }

  await setSession(created.id);
  return Response.json({ user: created, created: true });
}
