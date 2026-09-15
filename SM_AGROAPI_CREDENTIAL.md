# SM AgroAPI Credential — how it works, and how to use it in the SM app

Quick reference for wiring the client ID / secret into the SM application.
**Never print, log, commit, or paste the actual values anywhere.**

---

## What the two values are

| | What it is |
|---|---|
| `SM_CLIENT_ID` | the **user id (UUID)** that owns the credential |
| `SM_CLIENT_SECRET` | a **long-lived refresh token** — treat it like a password |

The secret is not an API key you send on requests. It is a refresh token you
**trade in** for a short-lived access token. The access token is what actually
goes on API calls.

## The exchange

```
POST https://agro.api.listenfield.com/token
Content-Type: application/json

{ "grant_type": "client_credentials",
  "client_id":  "<SM_CLIENT_ID>",
  "client_secret": "<SM_CLIENT_SECRET>" }
```

Returns:

```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 21600 }
```

Then every API call carries:

```
Authorization: Bearer <access_token>
```

**`expires_in` is 21600 seconds = 6 hours.** After that the access token is dead
and you exchange again. The refresh token itself keeps working (until it is
revoked or expires, at which point a new one must be issued — there is no
self-service way to renew it).

Optional: pass `"scopes": [...]` in the exchange to get a **narrower** access
token than the credential allows. It can only narrow, never widen.

## What this credential can reach

- `organizations:*` — orgs, machines, bookings, operations, cropzones, and the
  `/nouki/devices/:id/locations` telemetry
- **Not** `users:read` — `GET /user` returns `invalid_scopes`. That is correct
  for a machine credential; do not "fix" it by asking for a broader token.
- Four organizations: 2 farm orgs, 2 contractor orgs (Kinari, Nguyen The Thinh)

Note: the general `AGROAPI_TOKEN` used elsewhere **cannot see the Vietnam org**
and returns **404** (not 403) for its devices. In the SM app, use this
credential only — mixing them produces misleading "machine not found" errors.

---

## Rules for the SM app

**1. Server-side only.** The secret must never reach the browser. In Next.js
that means API routes / server actions / server components — never a
`NEXT_PUBLIC_*` variable, never a client component, never in a fetch the browser
makes directly. A refresh token in client JS is fully compromised the moment
anyone opens devtools.

**2. Store as env vars**, in `.env.local` (already gitignored in Simple App),
`chmod 600`. Same two names as `Projects/SM26/Credential/.env`:
`SM_CLIENT_ID`, `SM_CLIENT_SECRET`. For deploys, put them in the host's secret
store, not in the repo.

**3. Cache the access token server-side** and reuse it until ~5 minutes before
expiry. Do not exchange on every request: each exchange creates a new token row
server-side, so exchanging per-request leaves hundreds of live credentials
lying around for 6 hours each. Cache the token plus its absolute expiry time
and compare against the clock — there is no introspection endpoint, so
"checking validity" would cost the same round-trip as just exchanging.

**4. Retry once on 401**, forcing a fresh exchange. Covers the case where a
long-running job crosses the 6-hour boundary.

**5. Never log the values.** Not the secret, not the access token. Log
`token_type`, `expires_in`, or the org id — never the credential itself. Scrub
them from error reports too.

---

## Reference implementation

`Projects/SM26/Credential/sm_api.sh` already does all of the above in ~60 lines:
exchange, disk cache with expiry check, 401-retry, and per-call usage logging.
Port the logic, not the shell script.

Rough server-side shape:

```js
// server-side module, never imported by a client component
let cached = null;                      // { token, expiresAt }

async function getToken() {
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  const r = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.SM_CLIENT_ID,
      client_secret: process.env.SM_CLIENT_SECRET,
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("SM token exchange failed");  // no values in the message
  cached = { token: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 };
  return cached.token;
}
```

In a multi-instance deploy each instance keeps its own cache — that is fine, it
just means one exchange per instance per 6 hours.

## Migration note

Simple App currently calls AgroAPI with `AGROAPI_TOKEN` in `.env.local`.
Switching to this credential changes **what it can see** (SM orgs only, no
`users:read`), so check every existing call still resolves before removing the
old token.

Paths above are relative to the `claude_workspace` root, outside this repo:

- `Projects/SM26/Credential/` — the credential itself (`.env`, chmod 600, never committed),
  plus `README.md` describing the flow as implemented in AgroAPI
- `Projects/SM26/vietnam_trajectory_fetching.md` — how trajectory data is pulled

**This file contains no secret values** — only variable names and structure — so
it is safe to commit. The credential values themselves live only in
`.env.local` (gitignored) and must never enter this repo.
