import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setSession, USER_SELECT } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

// Sign in with a phone number and a password.
//
// The phone number is the user ID — an existing number signs back into the same
// account from any device, which is what makes a farmer's fields survive a new
// phone. Until Huong Ngai the number alone was enough (a prototype the team
// click-tested alone); it now needs proof, because the app is in front of
// people who are not us.
//
// Accounts are still provisioned separately — an unrecognised number is not a
// signup trigger. Passwords are set with `node set-password.js <phone>`, never
// through this route: there is no self-service reset, deliberately, because the
// alternative is SMS and A2P delivery to Vietnam is unreliable enough that it
// would be the thing that breaks on demo day.
export async function POST(request) {
  const { phone, password } = await request.json();

  const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
  if (!cleanPhone) {
    return Response.json({ error: "Phone number is required" }, { status: 400 });
  }
  if (!password) {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("app_users")
    .select(`${USER_SELECT}, password_hash`)
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (lookupError) {
    console.error(lookupError);
    return Response.json({ error: "Could not sign in" }, { status: 500 });
  }

  // One message for "no such number", "no password set" and "wrong password".
  // Telling them apart would let anyone confirm which numbers have accounts,
  // and these are real people's mobile numbers.
  const ok = existing && (await verifyPassword(password, existing.password_hash));
  if (!ok) {
    return Response.json({ error: "Incorrect phone number or password" }, { status: 401 });
  }

  // Never let the hash reach the client, even though it is only a hash.
  const { password_hash, ...user } = existing;

  await setSession(user.id);
  return Response.json({ user, created: false });
}
