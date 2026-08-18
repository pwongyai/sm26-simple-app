-- SM26 Simple App — a shared response cache.
--
-- AgroAPI is the slow part of every screen: a weather call is ~1s, decoding an
-- NDVI raster a few seconds, and the work-detection query 2–3s. Most of that
-- work is repeated — the same field's forecast, the same satellite capture, the
-- same finished day's work — so it should be done once and reused.
--
-- In-memory caching alone isn't enough: on Vercel each serverless instance has
-- its own memory and instances come and go, so a cache that lives only in
-- memory misses constantly and dies on every deploy. This table is the shared
-- layer behind it. Memory first, this second, AgroAPI last.
--
-- Run this once in Supabase, after contractors-schema.sql.

create table if not exists api_cache (
  key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists api_cache_expires_idx on api_cache (expires_at);

alter table api_cache enable row level security;

-- Expired rows are ignored on read; this just stops the table growing forever.
-- Safe to run by hand, or from a scheduled job later.
delete from api_cache where expires_at < now() - interval '7 days';
