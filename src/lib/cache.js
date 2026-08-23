import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Two-layer cache: process memory first, the shared `api_cache` table second,
// the real work last.
//
// How long to keep something is a question about the data, not about the app —
// so the TTLs live here in one place, each with the reason attached. The rule
// of thumb: cache for about as long as the underlying data stays true.

export const TTL = {
  // Conditions "right now" — updates roughly hourly at source.
  weatherCurrent: 30 * 60,
  // Day-by-day forecast — reissued a few times a day at most.
  forecast: 3 * 60 * 60,
  // Seasonal outlook is recomputed monthly (these rows were stamped 10 July).
  seasonal: 24 * 60 * 60,
  // Sentinel-2 revisits every ~5 days, so this is never stale in a way that
  // matters — and decoding the raster is the most expensive thing the app does.
  // Twelve hours means a capture that lands overnight is picked up by the
  // morning, and there's a "check for a newer one" control for the impatient.
  ndvi: 12 * 60 * 60,
  // Field geometry and crop info are edited by hand — in FarmAI or in this app
  // — and whoever just made the edit expects to see it. Ten minutes here meant
  // adding a crop variety appeared not to work at all, so this is deliberately
  // short: long enough to absorb tab-switching, short enough that a real edit
  // shows up before anyone concludes the app is broken. Cheap to fetch anyway
  // (~0.3s); the expensive calls are elsewhere.
  cropzone: 60,
  // Machines carry live GPS. Short, or the map lies about where a tractor is.
  machines: 2 * 60,
  // Every field in the org, fetched farm-by-farm (100+ AgroAPI calls even
  // rate-limit-safe at 5-concurrency) for Select Area's tap-to-pick map.
  // Field boundaries change rarely; longer than `machines` on purpose so
  // that expensive fetch isn't repeated every couple of minutes.
  siteFields: 5 * 60,
  // Which farms belong to this org's community — same shape of cost as
  // siteFields (a full paginated walk of the org's farms), same reasoning.
  siteFarmIds: 5 * 60,
  // AgroAPI's vocabularies are effectively static.
  catalog: 24 * 60 * 60,
  // Same "a finished window can't change" logic, applied to raw GPS
  // windows (see trackWindowTtl() below) — a window that ended more than a few
  // minutes ago is permanent, so re-viewing a machine's trajectory tomorrow, or
  // switching between Today/2 days/Custom when they overlap, costs no AgroAPI
  // call for anything already fetched. Cache it hard, not forever, in case
  // AgroAPI ever backfills/corrects a reading after the fact.
  trackWindowFinished: 30 * 24 * 60 * 60,
};

// A GPS window is only "still moving" if it reaches into the last few
// minutes — a device can lag a little, so a window that ended 2 minutes ago
// might still get a late point. Anything older than that is settled for good.
const TRACK_LIVE_BUFFER_MS = 5 * 60 * 1000;
export function isTrackWindowFinished(untilMs) {
  return untilMs < Date.now() - TRACK_LIVE_BUFFER_MS;
}
export function trackWindowTtl(untilMs) {
  return isTrackWindowFinished(untilMs) ? TTL.trackWindowFinished : TTL.machines;
}

const memory = new Map();

function fromMemory(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

/**
 * @param key         stable identifier — include every input that changes the answer
 * @param ttlSeconds  how long the answer stays true
 * @param loader      does the real work when there's no usable cached copy
 * @param force       skip both layers and refetch, then overwrite them
 *
 * `force` exists because a TTL alone leaves no way out: with satellite imagery
 * held for a day, someone who knows the data changed would otherwise have to
 * wait it out. Every cached endpoint takes `?refresh=1`.
 */
export async function cached(key, ttlSeconds, loader, { force = false } = {}) {
  if (force) {
    memory.delete(key);
  }

  const hit = force ? null : fromMemory(key);
  if (hit) return hit;

  try {
    if (force) throw new Error("skip cache read");
    const { data } = await supabaseAdmin
      .from("api_cache")
      .select("payload, expires_at")
      .eq("key", key)
      .maybeSingle();

    if (data && new Date(data.expires_at) > new Date()) {
      memory.set(key, {
        value: data.payload,
        expires: new Date(data.expires_at).getTime(),
      });
      return data.payload;
    }
  } catch (error) {
    // A cache that's down must never take the app with it.
    console.error("cache read failed", error);
  }

  const value = await loader();

  // Don't cache failures — a bad minute shouldn't become a bad hour.
  if (value == null || value.__noCache) return value;

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  memory.set(key, { value, expires: expiresAt.getTime() });

  try {
    await supabaseAdmin
      .from("api_cache")
      .upsert({ key, payload: value, expires_at: expiresAt.toISOString() });
  } catch (error) {
    console.error("cache write failed", error);
  }

  return value;
}

// Tell the browser it may reuse the response too, so reopening a screen within
// the window costs no request at all. `private` because these answers are
// scoped to one signed-in user and must never land in a shared proxy.
//
// The browser's window is deliberately much shorter than the server's. The
// server can hold a satellite image for a day quite safely, but if the browser
// also held it for a day, a user could not see a server-side refresh — or a
// deployed fix — until tomorrow. Ten minutes is enough to make navigating
// between tabs instant, which is the point, while leaving the server cache to
// do the real work of not hammering AgroAPI.
const MAX_BROWSER_SECONDS = 10 * 60;

export function cacheHeaders(ttlSeconds) {
  const browser = Math.min(ttlSeconds, MAX_BROWSER_SECONDS);
  return {
    "Cache-Control": `private, max-age=${browser}, stale-while-revalidate=${browser * 2}`,
  };
}
