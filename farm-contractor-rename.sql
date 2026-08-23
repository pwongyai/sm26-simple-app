-- SM26 Simple App — STEP 2 of 2: rename organizations -> farm_organizations.
--
-- ⚠ DO NOT RUN THIS ON ITS OWN. Production shares this database (confirmed
-- 2026-08-23: sm26-simple-app.vercel.app reads the same Supabase project). The
-- moment this runs, every request breaks, because `src/lib/session.js` queries
-- `organizations` on every single call. It stays broken until the matching code
-- deploy lands — a minute or two of total outage with every session failing.
--
-- This step is COSMETIC. Step 1 already delivered the whole design: the two new
-- tables, the relationship, and both unique constraints. All this adds is a
-- clearer name. It is entirely reasonable to never run it.
--
-- IF YOU DO RUN IT, the safe order is:
--   1. Change the 6 code references below and push. Vercel builds.
--   2. The build will be broken against the live DB for as long as it takes to
--      run this SQL — so instead: put the site in a maintenance state, or accept
--      the window, or use the view trick at the bottom.
--   3. Run this SQL.
--   4. Verify login works, then remove the compatibility view if you used one.
--
-- The 6 code references (everything else uses the joined alias
-- `user.organization`, which a table rename does not disturb):
--   src/lib/session.js:63                  select("*, organization:organizations(*)")
--   src/app/api/auth/login/route.js:22     select("*, organization:organizations(*)")
--   src/app/api/contractors/route.js:85    select("*, organization:organizations(*)")
--   src/app/api/org/join/route.js:9        from("organizations")
--   src/app/api/org/join/route.js:31       from("organizations")
--   src/app/api/org/join/route.js:53       select("*, organization:organizations(*)")

begin;

alter table organizations rename to farm_organizations;

-- Postgres carries every foreign key with the table, so the ten FKs pointing
-- here keep working untouched (verified by dry run, 2026-08-23). The FK COLUMNS
-- elsewhere stay named `organization_id` on purpose: renaming those would touch
-- 9 tables and ~40 code references for zero functional gain.

-- The relationship table's FK was created against the old name; it follows the
-- rename automatically, but re-point it explicitly for clarity if you prefer.

commit;

-- ---------------------------------------------------------------------------
-- ZERO-DOWNTIME ALTERNATIVE, if the outage window is unacceptable.
-- Run the rename, then immediately create a read-through view under the old
-- name so un-deployed code keeps working:
--
--   create view organizations as select * from farm_organizations;
--
-- Reads then work under either name. Note this only covers reads —
-- `/api/org/join` WRITES to the table, and writes to a simple view need an
-- INSTEAD OF trigger or a rule. Given `/api/org/join` is the only writer,
-- deploying its change first and adding the view for the read paths is the
-- least fiddly route. Drop the view once the deploy is confirmed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- FOLLOW-UP CLEANUP — only after the app reads contractor_organizations:
--   drop table contractor_profiles;
--   alter table farm_organizations drop column contractor_agro_org_id;
-- ---------------------------------------------------------------------------
