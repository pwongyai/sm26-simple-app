-- SM26 Simple App — contractor-side rebuild (matching v3's concluded UX).
-- Safe to re-run. Run once in Supabase: Dashboard > SQL Editor > New query.

-- 1. Force Close — a contractor can close a job by hand when it's genuinely
--    done but never went through the real match-or-backfill report path.
--    No reason is collected (v3's own decision, after an earlier 5-reason
--    form was removed) — just a lightweight audit trail of who/when.
alter table work_orders add column if not exists completion_type text
  check (completion_type in ('matched', 'force_closed'));
alter table work_orders add column if not exists history jsonb not null default '[]'::jsonb;

-- 2. Contractor Profile + Home Base. One row per business
--    (contractor_agro_org_id), not per login — a business can have more than
--    one staff account signed in over time, and the profile/home-base should
--    survive that. Mirrors the ER diagram's CONTRACTOR entity, minus the
--    fields AgroAPI already owns (machines, org membership).
create table if not exists contractor_profiles (
  contractor_agro_org_id text primary key,
  organization_id text references organizations(id),
  business_name text,
  owner_name text,
  phone text,
  line_account text,
  language text not null default 'th' check (language in ('th', 'en')),
  home_lat double precision,
  home_lng double precision,
  updated_at timestamptz not null default now()
);

alter table contractor_profiles enable row level security;
-- Server-only (service-role key), same posture as every other app table.
