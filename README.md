# SM26 Simple App

The simplest possible real, deployed version of a farmer ↔ contractor loop: a farmer signs up, posts a work request; a contractor signs up, sees the open requests, accepts one, marks it done. Real accounts (Supabase Auth), real database (Postgres via Supabase), no mock data.

This is a throwaway-simple companion to `Projects/SM26/version 2/` — proving a real build → deploy pipeline works, before applying the fuller Booking/Machine/Report/Settings design from that folder onto real infrastructure. Not a replacement for that design work.

## What's here

- `src/app/login/page.js` — sign up (name, role, email, password) / sign in.
- `src/app/farmer/page.js` — post a request, see your own requests and their status.
- `src/app/contractor/page.js` — see open requests, accept one, mark it done.
- `supabase-schema.sql` — the two tables (`profiles`, `requests`), a trigger that creates a profile row on signup, and row-level security policies. Run this once in your Supabase project.

## 1. Create a free Supabase project (you do this — I can't create accounts for you)

1. Go to [supabase.com](https://supabase.com), sign up free, create a new project.
2. In the project dashboard, open **SQL Editor → New query**, paste in the contents of `supabase-schema.sql` from this folder, and run it.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key.

## 2. Run it locally

```bash
cd "Projects/SM26/Simple App"
cp .env.local.example .env.local
```

Paste your real Project URL and anon key into `.env.local`, then:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Sign up once as a farmer and once as a contractor (two different browsers or an incognito window) to try the full loop.

## 3. Deploy it for free (you do this part — account creation and payment/login screens are yours to click through)

Easiest path is Vercel, since it's built by the Next.js team and has a generous free tier:

1. Push this folder to a GitHub repo (or just this `Simple App` folder as its own repo).
2. Go to [vercel.com](https://vercel.com), sign up free (can use GitHub login), **Add New → Project**, import that repo.
3. In the import screen's **Environment Variables** section, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**. Vercel gives you a live `https://your-app.vercel.app` URL a minute or two later.

Alternative if you'd rather do it from the terminal once you have a Vercel account: run `npx vercel` from this folder and follow its prompts (it'll open your browser to log in — that's you authenticating, not me).

## What's deliberately not here

No offline support, no payments, no LINE integration, no AgroAPI link yet, no polygon/GPS anything — just enough real logic to prove two real users can talk to each other through a live, deployed app. AgroAPI integration and the fuller SM26 design are meant to layer on top of this once the pipeline itself is proven, per [.claude/skills/agroapi/SKILL.md](../../../.claude/skills/agroapi/SKILL.md) for how AgroAPI calls/output should be handled when that happens.
