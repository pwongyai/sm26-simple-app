import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { hashPassword, verifyPassword } from "@/lib/password";

// Change your own password, from the Profile screen.
//
// Until now the only way to set one was `set-password.js`, run by us against
// the database — fine for handing out a shared `sm2026` before a demo, useless
// to a farmer who wants their account to be theirs.
//
// The current password is required. The phone in a farmer's hand is unlocked
// and often shared within a household; without this, anyone holding it for a
// minute can lock the owner out of their own fields.
const MIN_LENGTH = 6;

export async function POST(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  const { currentPassword, newPassword } = await request.json();

  if (!newPassword || newPassword.length < MIN_LENGTH) {
    return Response.json(
      { error: `New password must be at least ${MIN_LENGTH} characters` },
      { status: 400 }
    );
  }

  // `requireAccess` returns the user without the hash, so read it here rather
  // than widening what every other route carries around.
  const { data: row } = await supabaseAdmin
    .from("app_users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();

  const ok = row && (await verifyPassword(currentPassword || "", row.password_hash));
  if (!ok) {
    return Response.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ password_hash: await hashPassword(newPassword) })
    .eq("id", user.id);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not change password" }, { status: 500 });
  }

  // The session cookie is not invalidated: the person who just proved they
  // know the old password is the one holding this session. Other devices stay
  // signed in until their cookie ages out — a deliberate simplification, noted
  // so it is not mistaken for an oversight.
  return Response.json({ ok: true });
}
