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
    // The community's currency and area unit. A farmer cannot change these —
    // they belong to the community (review item R4) and the contractor sets
    // them — but every price and area the farmer reads is expressed in them, so
    // the profile says which.
    currency: user.organization.currency,
    areaUnit: user.organization.area_unit,
    areaUnitM2: user.organization.area_unit_m2,
    joinedAt: user.created_at,
  });
}

export async function PATCH(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) {
    return Response.json({ error: "Enter your name" }, { status: 400 });
  }

  // A farmer changing their own number is changing their login — so it has to
  // be a number they can actually type at the sign-in screen. Spaces, dashes
  // and a leading +, which are how people write a phone down, are stripped
  // rather than refused; anything left over is not a phone.
  const phone = (body.phone || "").replace(/[\s\-()+]/g, "");

  // Say which thing is wrong. One combined message told someone who typed
  // "12345" that the number had to be digits only — which it was.
  if (!phone) {
    return Response.json({ error: "Enter your mobile number" }, { status: 400 });
  }
  if (!/^\d+$/.test(phone)) {
    return Response.json(
      { error: "A mobile number can only contain digits" },
      { status: 400 }
    );
  }
  if (phone.length < 8 || phone.length > 15) {
    return Response.json(
      { error: "That does not look like a mobile number" },
      { status: 400 }
    );
  }

  // Checked rather than guessed. The unique index on app_users.phone caught
  // this before, but only as a 500 that said the number "may" be in use, which
  // reads as the app breaking rather than as pick-another-number.
  if (phone !== user.phone) {
    const { data: taken } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (taken && taken.id !== user.id) {
      return Response.json(
        { error: "That number is already registered" },
        { status: 400 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ name, phone })
    .eq("id", user.id);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }

  // The same person exists twice: as a login (app_users) and as an entry in
  // the contractor's customer book (farmers), which is what every work order
  // card and the customer list read. Writing only the login left the
  // contractor holding the old number — the one person who needs to phone the
  // farmer had the dead one (2026-09-22).
  if (user.role === "farmer") {
    const { error: mirrorError } = await supabaseAdmin
      .from("farmers")
      .update({ name, phone })
      .eq("app_user_id", user.id);
    // Not fatal: the login is already saved and is the thing the farmer is
    // about to sign in with. Logged so a drift between the two is traceable.
    if (mirrorError) console.error("farmer record not updated", mirrorError);
  }

  return Response.json({ ok: true });
}
