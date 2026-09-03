import { supabaseAdmin } from "@/lib/supabaseAdmin";

// A valid AgroAPI bearer token, minted and refreshed by the app itself.
//
// AgroAPI access tokens live SIX HOURS (Token::DEFAULT_EXPIRATION in
// agroapi-master), which is why a single pasted-in `AGROAPI_TOKEN` cannot work
// for a deployed service: it dies twice a day and takes every machine, map,
// weather and report screen with it. That is exactly what happened on
// 2026-08-26.
//
// The fix is not "paste a new token more often". Nothing here ever needs
// updating by hand:
//
//   AGROAPI_CLIENT_ID      the service account's user UUID
//   AGROAPI_CLIENT_SECRET  a token carrying scope `tokens:refresh_token`,
//                          which itself NEVER expires (expires_at is null)
//
// Those two are set once, in .env.local and in Vercel — the same two places
// AGROAPI_TOKEN used to live. This module exchanges them for a six-hour access
// token via `POST /token` (OAuth2 client_credentials), caches it, and mints a
// new one when it is close to expiring or when AgroAPI says it is done.
//
// The short-lived token is never written to a config file. It lives in process
// memory and in one `api_cache` row.
const CACHE_KEY = "agro:access_token";

// Refresh this far ahead of the real expiry. A report preview fans out to
// dozens of AgroAPI calls and can run for tens of seconds; a token that is
// "valid for another 4 seconds" is worse than useless because the failure
// lands mid-request. Thirty minutes of a six-hour life is cheap insurance.
const REFRESH_MARGIN_MS = 30 * 60 * 1000;

// Instance-scoped, same lifetime as supabaseAdmin's client singleton.
let memo = null; // { token, expiresAtMs }
let inFlight = null; // de-dupes concurrent mints within one process

function stillGood(expiresAtMs) {
  return typeof expiresAtMs === "number" && expiresAtMs - REFRESH_MARGIN_MS > Date.now();
}

// Mint a fresh access token. Throws — a caller with no token cannot do anything
// useful, and a silent empty string would surface later as a confusing 401.
async function mint() {
  const base = process.env.AGROAPI_BASE_URL;
  const clientId = process.env.AGROAPI_CLIENT_ID;
  const clientSecret = process.env.AGROAPI_CLIENT_SECRET;

  if (!base) throw new Error("AGROAPI_BASE_URL is not set — see .env.local.example");
  if (!clientId || !clientSecret) {
    throw new Error(
      "AgroAPI credentials missing: set AGROAPI_CLIENT_ID and AGROAPI_CLIENT_SECRET " +
        "(or AGROAPI_TOKEN for a static token) — see .env.local.example"
    );
  }

  // No Authorization header: `POST /token` skips the token check entirely
  // (tokens_controller.rb skips :check_token_exists for this action).
  const res = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  // AgroAPI answers a malformed credentials payload with HTTP 204 and an empty
  // body rather than an error — it falls through the controller with nothing
  // rendered. Treated as the hard failure it is, because otherwise it reads as
  // success and every later call 401s for no visible reason.
  if (!body?.access_token) {
    throw new Error(
      `AgroAPI token request failed (HTTP ${res.status}${
        res.status === 204 ? " — empty body, usually malformed credentials" : ""
      }): ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body)}`
    );
  }

  // `expires_in` is seconds. Fall back to six hours if it is ever absent, so a
  // response shape change degrades to the documented default rather than to a
  // token treated as instantly stale.
  const ttlSeconds = Number(body.expires_in) > 0 ? Number(body.expires_in) : 6 * 60 * 60;
  const expiresAtMs = Date.now() + ttlSeconds * 1000;

  // Value never logged — only its lifetime. Workspace rule, and a token in a
  // Vercel log is a token in a place nobody is watching.
  console.log(
    `AgroAPI token minted, valid ${Math.round(ttlSeconds / 60)} min ` +
      `(until ${new Date(expiresAtMs).toISOString()})`
  );

  memo = { token: body.access_token, expiresAtMs };

  // Share it with the other serverless instances. Deliberately NOT via
  // lib/cache.js `cached()`: that has no single-flight and its upsert is
  // last-write-wins, so a slow loser can overwrite a fresher winner's row.
  try {
    await supabaseAdmin.from("api_cache").upsert({
      key: CACHE_KEY,
      payload: { access_token: body.access_token, expires_at_ms: expiresAtMs },
      expires_at: new Date(expiresAtMs).toISOString(),
    });
  } catch (error) {
    // A token we hold but failed to share is still a usable token.
    console.error("could not cache the AgroAPI token", error);
  }

  return body.access_token;
}

// Read the token another instance may already have minted.
async function fromCache() {
  try {
    const { data } = await supabaseAdmin
      .from("api_cache")
      .select("payload")
      .eq("key", CACHE_KEY)
      .maybeSingle();

    const token = data?.payload?.access_token;
    const expiresAtMs = data?.payload?.expires_at_ms;
    if (token && stillGood(expiresAtMs)) {
      memo = { token, expiresAtMs };
      return token;
    }
  } catch (error) {
    // Cache down is not auth down — fall through and mint.
    console.error("AgroAPI token cache read failed", error);
  }
  return null;
}

// Can a fresh token actually be obtained? False when a static AGROAPI_TOKEN is
// pinned (re-minting cannot replace it) or when no credentials are configured.
// agroFetch uses this to decide whether a 401 is worth retrying — without it, a
// dead static token would make every single call fire twice for nothing, which
// is the exact state the app is in while waiting for a credential.
export function isRefreshable() {
  return (
    !process.env.AGROAPI_TOKEN &&
    !!process.env.AGROAPI_CLIENT_ID &&
    !!process.env.AGROAPI_CLIENT_SECRET
  );
}

// The only other export. `force` skips every cache layer and mints — used by
// agroFetch when AgroAPI reports the current token expired.
export async function getAgroToken({ force = false } = {}) {
  // A static token still wins, when set. It keeps the previous behaviour
  // available: production can be repaired in minutes by pasting a fresh token,
  // and it is a one-variable rollback if the refresh flow ever misbehaves.
  const stat = process.env.AGROAPI_TOKEN;
  if (stat) return stat;

  if (!force) {
    if (memo && stillGood(memo.expiresAtMs)) return memo.token;
    const shared = await fromCache();
    if (shared) return shared;
  } else {
    memo = null;
  }

  // Single-flight within this process: five mapWithConcurrency workers hitting
  // a cold instance should cause one mint, not five. Across instances a
  // duplicate mint is wasteful but harmless — issuing a token does not
  // invalidate existing ones — so this deliberately stops short of a
  // distributed lock, which would be more machinery and more ways to wedge.
  if (inFlight) return inFlight;
  inFlight = mint().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
