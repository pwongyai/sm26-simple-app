import { getAgroToken, isRefreshable } from "@/lib/agroToken";

// Server-only AgroAPI helper. The credentials live in the environment and never
// reach the browser — every call the app makes goes through a route that
// imports this. It is also the only place in the repo that builds an
// Authorization header, which is what makes the token handling below apply to
// all ~45 AgroAPI call sites at once.
//
// Tokens are short-lived (six hours) and minted by lib/agroToken.js. Nothing
// here needs a human to paste anything.
export async function agroFetch(path, options = {}) {
  const send = async (token) => {
    const res = await fetch(`${process.env.AGROAPI_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      cache: "no-store",
    });

    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { ok: res.ok, status: res.status, body };
  };

  let out = await send(await getAgroToken());

  // AgroAPI returns 401 for three different situations and only the `code`
  // field tells them apart (application_controller.rb + models/errors/token/*):
  //
  //   token_expired   the access token aged out -> mint a new one and retry
  //   access_denied   the credential itself is dead -> retrying cannot help
  //   invalid_scopes  a refresh token was used on a normal endpoint -> our bug
  //
  // Before 2026-08-26 none of this was checked, so a dead token surfaced as
  // partially-empty screens and, in one path, a partial result cached for five
  // minutes. Status alone is not enough to distinguish them.
  if (out.status === 401 && out.body?.code === "token_expired" && isRefreshable()) {
    // Safe to replay, writes included: a 401 means AgroAPI never executed the
    // request, and every `options.body` in this codebase is an
    // already-serialised string rather than a stream, so it can be re-sent.
    out = await send(await getAgroToken({ force: true }));
  } else if (out.status === 401) {
    const why =
      out.body?.code === "token_expired"
        ? "the pinned AGROAPI_TOKEN has expired — unset it to let the app mint " +
          "its own tokens, or paste a fresh one"
        : out.body?.code === "access_denied"
          ? "AGROAPI_CLIENT_SECRET is dead or revoked and must be re-issued; " +
            "retrying will not help"
          : "check the token's scopes";
    console.error(`AgroAPI refused the credential (${out.body?.code || "no code"}) on ${path} — ${why}`);
  }

  return out;
}
