import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// A signed session cookie. There is no OTP in this prototype — anyone may claim
// any phone number at first login — but once logged in, the session itself is
// tamper-proof: you cannot become another user by editing localStorage or the
// cookie, because the value carries an HMAC only the server can produce.
// That means the ownership gate is enforceable now, and adding real
// verification later changes the login route only, not the architecture.

const COOKIE = "sm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(userId) {
  const mac = crypto.createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${mac}`;
}

function unsign(value) {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx < 0) return null;
  const userId = value.slice(0, idx);
  const mac = value.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret()).update(userId).digest("hex");
  // timingSafeEqual throws on length mismatch, so guard first.
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return userId;
}

export async function setSession(userId) {
  const jar = await cookies();
  jar.set(COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// The one definition of "a signed-in user, fully loaded". Every place that
// builds a user object must use this, or `contractorOrgId()` silently falls
// back to the legacy column on some code paths and not others — a bug that
// looks like nothing at all, because the fallback returns the right answer
// today.
//
// The organization brings its contractor relationships along
// (`contractor_links`). That is what lets `contractorOrgId()` stay a plain
// synchronous function: a farmer's contractor now comes from
// farm_contractor_relationships rather than a column, and resolving it here —
// once, where the session is built — avoids making 38 call sites across 21
// files await a lookup.
export const USER_SELECT =
  "*, organization:farm_organizations(*, contractor_links:farm_contractor_relationships(contractor_organization_id, is_default, status))";

// Returns the full user row (with their organization joined) or null.
export async function getSessionUser() {
  const jar = await cookies();
  const userId = unsign(jar.get(COOKIE)?.value);
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select(USER_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
