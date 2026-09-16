-- SM26: store the ADAPT documents the app exchanges.
--
-- The app already models the JOB — a work_orders row and a work_reports row.
-- What it has never stored is the DOCUMENTS about that job: the ADAPT Work
-- Order that goes out and the ADAPT Work Record that comes back. Once an
-- external FMIS is on the other end those documents are the deliverable, and
-- regenerating one later with newer code would produce something different
-- from what actually crossed the wire. So they are stored, once, as sent.
--
-- One table serves both directions. `direction` is data, not structure, and
-- keeping them together gives a single audit trail per job plus a free inbox:
-- an inbound row with match_status <> 'matched' and no job link IS the
-- pending-match queue, so no separate staging table is needed.
--
-- Design notes that are easy to get wrong later:
--
--   * payload is IMMUTABLE. Never edit a stored document — not to correct it,
--     not to add a field we later learned to read. It is evidence of what was
--     exchanged, including parts we do not understand. Anything we need that
--     ADAPT cannot carry goes in our own columns or our own tables.
--
--   * adapt_version is stamped per row, not assumed globally. A document
--     written against 2.0.2 stays readable after AgGateway publishes 2.1. See
--     Projects/SM26/WORK_TYPE_MAP.md for the re-map procedure.
--
--   * internal exchanges are ONE row, not two. A letter that never leaves the
--     building has one copy, marked counterparty IS NULL. Two rows — one out,
--     one in — only when a document genuinely crosses to an outside company.
--     This keeps the audit trail honest about what really went over the wire.
--
-- RLS is enabled with no policies, matching every other table here: the app
-- reaches this only through the service-role key, which bypasses RLS, and the
-- public anon key is shipped to every phone that opens the app. Four tables
-- shipped without RLS earlier and were world-readable AND world-writable until
-- 2026-09-16. Do not repeat that: this one holds counterparty documents.

create table if not exists public.adapt_documents (
  id uuid primary key default gen_random_uuid(),

  -- 'out' = we generated it. 'in' = we received it from outside.
  direction text not null check (direction in ('out', 'in')),

  doc_type text not null check (doc_type in ('work_order', 'work_record')),

  -- The ADAPT Standard version this document was built against, e.g. '2.0.2'.
  adapt_version text not null,

  -- The ADAPT document itself, exactly as sent or received. Immutable.
  payload jsonb not null,

  -- Which job this belongs to. Both NULL on an inbound document that has not
  -- been matched yet — that is the inbox state, not an error.
  work_order_id  uuid references public.work_orders(id)  on delete cascade,
  work_report_id uuid references public.work_reports(id) on delete cascade,

  -- The external system, as a URI or GLN. NULL means internal: generated and
  -- consumed inside this app, never posted anywhere.
  counterparty text,

  -- Their document id, when they send one. Used to correlate a reply; the
  -- existing match logic in LOGIC_SPEC.md section 1 does not depend on it.
  external_doc_id text,

  match_status text not null default 'matched'
    check (match_status in ('matched', 'unmatched', 'pending', 'rejected')),

  created_at timestamptz not null default now()
);

alter table public.adapt_documents enable row level security;

create index if not exists adapt_documents_order_idx
  on public.adapt_documents (work_order_id);

create index if not exists adapt_documents_report_idx
  on public.adapt_documents (work_report_id);

-- The inbox: partial index, because unmatched rows are the rare case and the
-- question "what is waiting to be matched?" should stay cheap as the table grows.
create index if not exists adapt_documents_unmatched_idx
  on public.adapt_documents (match_status)
  where match_status <> 'matched';


-- The ADAPT operation type a service maps to, chosen by the contractor from
-- the 19-entry picker in Projects/SM26/WORK_TYPE_MAP.md.
--
-- `activity_canonical` is deliberately LEFT IN PLACE for now. It is not only
-- the AgroAPI type: the report screen also uses it to pre-select a likely
-- service from the machine's kind. Dropping it is a separate change that has
-- to rewire that matching first.
alter table public.services add column if not exists adapt_code text;

-- Backfill only what maps with no ambiguity.
--   Land Preparation      -> 7 candidates, needs a human decision
--   Weed Control          -> removed from the picker
--   Pest & Disease Control-> removed from the picker
-- Those three stay NULL, and a NULL code exports as ADAPT's own 'UNKNOWN'
-- rather than guessing.
update public.services set adapt_code = 'HARVEST'
  where activity_canonical = 'harvesting' and adapt_code is null;

update public.services set adapt_code = 'APPLICATION_SOWING_AND_PLANTING_SEEDS'
  where activity_canonical = 'planting' and adapt_code is null;

update public.services set adapt_code = 'APPLICATION_FERTILIZING'
  where activity_canonical = 'fertilization' and adapt_code is null;
