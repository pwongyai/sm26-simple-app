import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setSession, USER_SELECT } from "@/lib/session";

// Sign in by phone number, no verification code (prototype — see
// identity-schema.sql). An existing phone signs back into the same account
// from any device, which is what makes fields survive a new browser. Unlike
// earlier, an unrecognized phone is no longer a signup trigger — accounts are
// provisioned separately (seeded test accounts, or a real onboarding flow
// later), not created just because someone typed a number into this screen.
// A wrong digit should look like a wrong password, not silently open a
// "create an account" form.
export async function POST(request) {
  const { phone } = await request.json();

  const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
  if (!cleanPhone) {
    return Response.json({ error: "Phone number is required" }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("app_users")
    .select(USER_SELECT)
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (lookupError) {
    console.error(lookupError);
    return Response.json({ error: "Could not sign in" }, { status: 500 });
  }

  if (!existing) {
    return Response.json({ error: "Incorrect phone number" }, { status: 401 });
  }

  await setSession(existing.id);
  return Response.json({ user: existing, created: false });
}
