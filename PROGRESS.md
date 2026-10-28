# PROGRESS — SM26 Smart Machine Contractor App

**Read this whole file before touching code.** It is the shared handoff between
machines and agents (Claude Code, Codex). It records current state, not a
transcript.

> **This repository is public.** Never write credentials, passwords, connection
> strings, database/org IDs, real customer names, billing amounts or internal
> ticket links here. The full private history (with those details) lives in
> the project's private folder outside this repo — ask the user for it.

---

## Handoff block — update at the end of every session

| | |
|---|---|
| Last updated | 2026-10-28 — consolidated from the private PROGRESS (last real dev session 2026-10-15) |
| Machine / agent | Mac, Claude Code |
| Branch / base commit | `main` @ `4712744` (= origin/main) |
| Uncommitted / unpushed | this file + the AGENTS.md pointer (first handoff commit) |
| Tests run this session | none — documentation only |
| Production | auto-deploys from `main` to Vercel; last verified 2026-10-15 |

**Next steps, in order**
1. Confirm the Safari 16.3 fix on the real iPad (see "Current state").
2. Ruang Kaeo field test, end of Oct 2026 — workflows B and C.
3. After RK: decide multi-field orders and build the duplicate-field cleanup tool (both below).

---

## Current state (as of 2026-10-15)

- **Huong Ngai (Vietnam, workflow A)** — done, deployed, translated (EN/TH/VN).
- **Ruang Kaeo (Thailand)** — runs workflows **B and C** at the end-of-Oct test.
  **Real customer use has already started**: a real, paid report exists. Never
  bulk-delete RK data; draw the line between test and real rows first.
- RK test data was reset 2026-10-15 (Supabase only, AgroAPI untouched; field
  numbering continues, numbers are never reused).
- Shipped and verified on production 2026-10-14/15: B.1 (book against a
  customer's own field), work-order note removed (column dropped), booking map
  opens on home base, unclaimed-plot claim flow, live-cropzone claim, map no
  longer snaps back while drawing, translation of dates/units/work types.
- **iPad blank screen**: caused by Next 16 compiling for Safari 16.4 (a class
  `static {}` block is a syntax error on 16.3). Fixed with a `browserslist`
  entry in package.json. Verified in built chunks — **not yet confirmed on the
  real iPad**.

### Workflows

    A   farmer requests → contractor accepts → records work → report
    B   order first, then work, then report      (contractor registers the job)
      B.1  pick an existing customer's field polygon
      B.2  mark a lat/lon for an existing customer
      B.3  existing customer, no field
      B.4  brand-new customer, unknown area
    C   work first, then backfill order + report (contractor draws the polygon)
    D   "already reported" detection on the Select Area map

B.3/B.4 end in a fieldless order → Force Close path. C tested end to end twice
after the 24 Sep fix.

---

## Open items

**Agreed, not built**
- **Duplicate-field cleanup tool** (decided 2026-10-15). Workflows do not change.
  A separate tool lists overlapping fields (excluding smart farmers' own fields,
  as a filter in the tool only) and the contractor resolves each. It is a
  **merge, not a delete**: pick the keeper, move the loser's reports across,
  archive the loser. Leave AgroAPI alone unless separately decided.
  Rejected: fixing polygons inside the report workflow (touches the money path).
- **One order, many reports.** Schema already allows it (`work_reports.work_order_id`
  is not unique). The only blocker: saving a report sets the order to
  `completed` (`src/app/api/reports/route.js`, ~line 358). Deliberately waiting
  for RK to show whether multi-field booking is real.

**Known bugs / gaps**
- Select Area purple tint matches exact boundary JSON — misses fields whose
  boundary was edited after reporting (server still catches the duplicate).
- Tapping a purple field still asks "Match Work Order" before opening the saved report.
- Language survives logout until reload (i18n module cache).
- Services edit shows float noise on some prices (per-m² round-trip).
- Weather 5-day forecast starts at yesterday.
- Silent 7-day clamp on trajectory range (`machines/[machineId]/track/route.js`).
- Fuel rates still 0 on some machines → no fuel/emissions on those reports,
  and that cannot be reconstructed later.
- Planting dates missing on most cropzones (fields read "Not planted yet");
  set by hand before real testing.
- Vietnamese strings are machine-written and unreviewed by a native speaker.
- RK0547 / RK0549 have no boundary in AgroAPI (bookable, placeholder tile).
- `api_cache` grows unbounded (expired rows) — purge job someday.
- Code repo lives on a personal GitHub account; move to company GitLab is planned.

---

## What this is

SM26 is a government-funded proof-of-concept run by ListenField, demonstrating
NoukiOpenAPI + ADAPT data exchange. Users are agricultural machine contractors.
Guiding rule: **"Running the machine gets them money. Using the app doesn't"** —
the app must never gate real work.

Design references (in the private project folder, not this repo):
`version 3/transfer/digital-notebook-prototype.html` is the UX spec — port,
don't redesign. `V3_CONTRACTOR_SCREENS.md` gives screen IDs (BK-1…, MC-1…,
RP-1, ST-1) — use them when talking to the user.

## Architecture

- **Next.js 16** (Turbopack, App Router). All API routes are server-only
  (`src/app/api/**/route.js`). No client holds an AgroAPI token or the
  Supabase service-role key.
- **Supabase (Postgres)**. RLS on, zero policies — reached only server-side via
  the service-role key (`src/lib/supabaseAdmin.js`). **Production and local
  development share one database**: any write during testing is a real write.
- **AgroAPI** (ListenField backend). All calls through `src/lib/agroapi.js`
  `agroFetch()`, concurrency-capped and retried (`src/lib/agroConcurrency.js`).
  The app mints its own 6-hour tokens from a client credential
  (`src/lib/agroToken.js`, OAuth2 client_credentials). See `SM_AGROAPI_CREDENTIAL.md`.
- **Auth**: phone number + password → signed HMAC session cookie
  (`src/lib/session.js`, `src/lib/password.js`). No self-signup; accounts are
  provisioned out of band. Sign-in lasts a year.
- **Deploy**: push to `main` → Vercel builds. **A failed build silently keeps
  serving the previous version** — run `npm run build` locally before every push.

### Environment variables (names only — values come from the user, never from a doc)

Required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SESSION_SECRET`, `AGROAPI_BASE_URL`, `SM_CLIENT_ID`, `SM_CLIENT_SECRET`.
Optional override: `AGROAPI_TOKEN` (wins if set; expires in 6 h — leave unset).
Present but unused: `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Dev tooling only:
`SUPABASE_DB_PASSWORD`. Local file: `.env.local` (gitignored).

### Database

Check live schema with `node db-check.js` — do not trust `setup.sql` alone
(`create table if not exists` never adds a later column to an existing table).
Current core tables: `farm_organizations`, `contractor_organizations`,
`farm_contractor_relationships`, `app_users`, `farmers`, `fields`,
`work_orders`, `work_reports`, `services`, `machines`, `fuel_rates`,
`machine_fuel_types`, `implements`, `machine_implements`, `adapt_documents`,
`api_cache`. Migration files at repo root are history; each has an `apply-*.js`.

Every schema change is named to the user before it is applied — none silent.

---

## Decisions — do not re-litigate

- **Work-area engine** (`src/lib/engine.js` `computeWork`): buffer the inside-
  field track by implement width, union, clip to the polygon, measure (Turf).
  If a report looks wrong, check `computeWork()` and `reports/preview/route.js`;
  don't add a detection-matching layer.
- **Width/fuel resolution** (`src/lib/machineRates.js`): implement → per-service
  override → telemetry, in that order.
- **Work reports are frozen** at approval (boundary, track, figures, money,
  currency, unit label). Only `payment_status` stays editable. A boundary fix
  never re-bills.
- **Areas stored in m², prices in THB/m²**, rendered per reader. Currency and
  area unit belong to the community; language is per user. 1 THB = 800 VND fixed.
- **Thai dates use the Gregorian calendar** (2025, not 2568).
- **Force Close is a real report.** Field known → report + ADAPT Work Record +
  AgroAPI activity. No field → report only. No ADAPT document without a field.
- **Fuel and emissions are NULL, never 0**, on a report with no machine.
- **One AgroAPI Farm per field**, named like the field (a Farm's location is
  set once and never updates).
- **"Unassigned" is a real `farmers` row**, not null. It shows on the map, never
  in the customer picker. Tapping an unclaimed plot asks whose it is.
- **Customer book is community-wide**; tenancy is admission control
  (`farm_contractor_relationships`), not row filtering.
- **Contractor-drawn fields take the next registry number** (`claim_next_field_number`);
  farmers name their own fields freely.
- **Work-order note removed.** If it returns, the farmer writes it and the
  contractor reads it — not the reverse.
- **Machines are read-only** (live telemetry devices).
- **Simplicity is a standing rule** — no branch piles; the user must be able to
  trace the logic.
- **Don't re-add `viewport-fit=cover`** (puts headers behind the camera, brings
  back the iOS zoom). Form fields stay 16 px.

## AgroAPI facts worth not re-discovering

- Telemetry is copied from the provider only when a work order ends or on
  AgroAPI's timer — a past window can still grow. Never cache an empty
  telemetry window; finished-window TTL is 1 day; Refresh always re-fetches.
- `/nouki/devices/:id/locations` caps at 1000 rows before pagination →
  4-hour windows, recursively bisected (`src/lib/trajectory.js`).
- `GET /fields/:id/cropzones` returns an **array**.
- A cropzone keeps its **own** boundary copy — any boundary edit must patch the
  field **and** the cropzone (`api/my/fields/[fieldId]` is the model).
- A field's `farm_id` cannot change. Deleting a field cascades cropzones and activities.
- One planting activity per cropzone; set it via the cropzone's `planting_date`.
  Activity PATCH accepts only `extra` and returns 200 for discarded updates — read back.
- Fuel consumption in machine metadata is km/L, not L/km — invert it.
- AgroAPI cannot store work reports (no structured area/price/geometry) —
  that is why `work_reports` exists locally.

## Lessons that cost real time

- Before dropping a column, check code that **selects** it as well as code that
  writes it (a dropped column broke the tenancy guard → every request 404'd).
- A failed page in a paginated walk must throw, not end the loop (a partial list
  was cached as complete).
- Clearing `api_cache` is not enough on a long-running dev server — `cached()`
  checks process memory first.
- Don't accept a bare shell `grep` as proof of zero references; re-check with a
  file walk.
- Browser automation against a live account can write to production — verify
  DB state after each step.
- Translation rules: no hooks in module-level constants or plain helpers;
  `.map((t) => …)` shadows the translator; JSX attributes need braces; never
  unwrap `t("…")` with a blind regex.
- `ON DELETE SET NULL` on `work_orders/work_reports.farmer_id` orphans reports
  when a customer is deleted; `fields.farmer_id` cascades.

---

## Verification protocol

No automated test suite. Verify by driving the app against real data:
1. Dev server on port 3000 (via the harness launch config if present, else `npm run dev`).
2. Sign in with a test account (ask the user; not listed here).
3. After any write, reload and confirm it persisted.
4. AgroAPI writes are permanent and real. Use `GET /api/reports/preview` to test
   computation without approving a report.
5. Same-browser tabs share one session cookie.
6. `npm run build` before every push.

## Docs status (private project folder)

Stale: `SCREEN_INVENTORY.md`, `version 2/HANDOFF.md`.
Current: `V3_CONTRACTOR_SCREENS.md`, the v3 prototype + ER diagram,
`TEST_PLAN.md`, `TRAJECTORY_FETCH_GUIDE.md`, `LOGIC_SPEC.md`, `WORK_TYPE_MAP.md`.

---

## Session-end checklist

Update the handoff block: date, machine/agent, branch + base commit, what
changed, tests run, unresolved issues, next steps, anything uncommitted or
unpushed. Review the exact diff before any commit or push. Keep this file free
of anything listed in the public-repo warning at the top.
