# SM26 Simple App

A real, deployed farmer ↔ contractor loop on real infrastructure: a farmer requests machine work on a real AgroAPI field, a contractor sees it and marks it done, and that writes a real, permanent Activity record back into AgroAPI.

This is where `Projects/SM26/version 2/` (contractor concept) and `version 3/` (farmer expansion) are being merged into something buildable — see [INTEGRATION_PLAN.md](../INTEGRATION_PLAN.md) for the full plan, architecture and open questions.

## What's here

- `src/app/login/page.js` — phone-number sign-in (no OTP in this prototype; the session cookie is signed, so it can't be forged).
- `src/app/join/page.js` — join your organization by code (`RK2026`). One org per user.
- `src/app/farmer/` — your fields (from the ownership mapping, hydrated live from AgroAPI), activity history, request machine work.
- `src/app/contractor/` — incoming requests, mark work complete → real AgroAPI Activity.
- `src/lib/ownership.js` — **the ownership gate.** Every AgroAPI proxy route calls it first. AgroAPI cannot tell our users apart (one shared organization, one shared token), so this is the only thing keeping one farmer out of another's data.
- `identity-schema.sql` — sites, users, and the ownership mapping. **Run this once.**
- `work-orders-schema.sql` — the pending work-request table. Run this once.
- `supabase-schema.sql` — superseded (the old email/password test tables); safe to ignore.

## 1. Supabase setup (you do this — I can't run SQL in your dashboard)

1. In the project dashboard, open **SQL Editor → New query** and run `work-orders-schema.sql`, then `identity-schema.sql`.
2. Go to **Project Settings → API**. Copy the **Project URL**, the **anon public** key, and the **`service_role`** key.
   - The `service_role` key bypasses row-level security. It is server-only: never prefix it `NEXT_PUBLIC_`, never commit it. The identity tables have RLS on with no policies, so without it nothing can read them — including anyone who extracts the anon key from the browser bundle.

## 2. Run it locally

```bash
cd "Projects/SM26/Simple App"
cp .env.local.example .env.local
```

Fill in `.env.local` — Supabase URL, anon key, `SUPABASE_SERVICE_ROLE_KEY`, `AGROAPI_TOKEN`, and a
`SESSION_SECRET` (`openssl rand -hex 32`). Then:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Three accounts are seeded by `identity-schema.sql`:

| Phone | Who | Sees |
|---|---|---|
| `0800000001` | Demo Farmer | RK0540, RK0541, RK0542 |
| `0800000002` | Second Farmer | nothing — **the isolation test**: RK0540 must be unreachable even by direct id |
| `0900000001` | Kinari Contractor | incoming requests for the Ruang Kaeo site |

Use two browsers (or an incognito window) to run farmer and contractor side by side.

## 3. Deploy it for free (you do this part — account creation and payment/login screens are yours to click through)

Easiest path is Vercel, since it's built by the Next.js team and has a generous free tier:

1. Push this folder to a GitHub repo (or just this `Simple App` folder as its own repo).
2. Go to [vercel.com](https://vercel.com), sign up free (can use GitHub login), **Add New → Project**, import that repo.
3. In the import screen's **Environment Variables** section, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role key (server-only)
   - `SESSION_SECRET` = a long random string
   - `AGROAPI_BASE_URL` = `https://agro.api.listenfield.com`
   - `AGROAPI_TOKEN` = your AgroAPI bearer token
4. Click **Deploy**. Vercel gives you a live `https://your-app.vercel.app` URL a minute or two later.

Alternative if you'd rather do it from the terminal once you have a Vercel account: run `npx vercel` from this folder and follow its prompts (it'll open your browser to log in — that's you authenticating, not me).

## What's deliberately not here

No offline support, no payments, no LINE integration, no AgroAPI link yet, no polygon/GPS anything — just enough real logic to prove two real users can talk to each other through a live, deployed app. AgroAPI integration and the fuller SM26 design are meant to layer on top of this once the pipeline itself is proven, per [.claude/skills/agroapi/SKILL.md](../../../.claude/skills/agroapi/SKILL.md) for how AgroAPI calls/output should be handled when that happens.
