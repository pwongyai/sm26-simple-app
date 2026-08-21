import { agroFetchWithRetry, mapWithConcurrency } from "@/lib/agroConcurrency";
import { cached, trackWindowTtl, isTrackWindowFinished } from "@/lib/cache";

// One machine's real trajectory, from NoukiOpenAPI telemetry — fetch strategy
// per Projects/SM26/TRAJECTORY_FETCH_GUIDE.md (validated against live AgroAPI).
// Shared by the Trajectory pane's own track route and anything else that needs
// a machine's real points for a real window (e.g. computing a report directly
// from a tapped field, without going through AgroAPI's separate suggested-
// bookings detection).
//
//   1. `/nouki/devices/:id/locations` hard-caps every call at 1000 rows,
//      applied BEFORE pagination — split the range into windows instead.
//   2. `/operations/:id/tracks` only covers a logged Start→End session — never
//      use it for "where has this machine been," raw `/locations` is the only
//      safe source.
const MAX_ROWS_PER_CALL = 1000;
const BASE_CHUNK_HOURS = 4; // validated fastest-or-tied setting, guide §3
const MAX_BISECT_DEPTH = 4;

function splitWindows(sinceMs, untilMs, hours) {
  const windows = [];
  const stepMs = hours * 3600 * 1000;
  let start = sinceMs;
  while (start < untilMs) {
    const end = Math.min(start + stepMs, untilMs);
    windows.push([start, end]);
    start = end;
  }
  return windows;
}

// Truncation is self-healing: a maxed-out window gets bisected and each half
// re-fetched, at the cost of one extra round-trip for that window — not lost
// points.
async function fetchWindow(machineId, sinceMs, untilMs, force, depth = 0) {
  const cacheKey = `track:${machineId}:${sinceMs}-${untilMs}`;
  const bypassCache = force && !isTrackWindowFinished(untilMs);
  const { ok, status, body } = await cached(
    cacheKey,
    trackWindowTtl(untilMs),
    async () => {
      const query = new URLSearchParams({
        items: String(MAX_ROWS_PER_CALL),
        since: new Date(sinceMs).toISOString(),
        until: new Date(untilMs).toISOString(),
      });
      const r = await agroFetchWithRetry(`/nouki/devices/${machineId}/locations?${query}`);
      return r.ok ? r : { ...r, __noCache: true };
    },
    { force: bypassCache }
  );
  if (!ok) return { features: [], stillTruncated: false, failed: true, status };

  const features = body.features || [];
  if (features.length < MAX_ROWS_PER_CALL) {
    return { features, stillTruncated: false };
  }
  if (depth >= MAX_BISECT_DEPTH) {
    return { features, stillTruncated: true };
  }
  const mid = Math.floor((sinceMs + untilMs) / 2);
  const [a, b] = await Promise.all([
    fetchWindow(machineId, sinceMs, mid, force, depth + 1),
    fetchWindow(machineId, mid, untilMs, force, depth + 1),
  ]);
  return {
    features: [...a.features, ...b.features],
    stillTruncated: a.stillTruncated || b.stillTruncated,
  };
}

/**
 * @returns {{points, truncated, failed}} points sorted oldest-first, deduped.
 */
export async function fetchMachineTrack(machineId, sinceMs, untilMs, force = false) {
  const windows = splitWindows(sinceMs, untilMs, BASE_CHUNK_HOURS);
  const results = await mapWithConcurrency(windows, ([s, u]) => fetchWindow(machineId, s, u, force));

  if (results.every((r) => r.failed)) {
    return { points: [], truncated: false, failed: true };
  }

  const truncated = results.some((r) => r.stillTruncated);
  const allFeatures = results.flatMap((r) => r.features);

  // De-dupe by timestamp + coordinate — adjacent windows share their
  // boundary instant, so the same ping can come back from both sides.
  const seen = new Set();
  const deduped = [];
  for (const f of allFeatures) {
    const key = `${f.properties?.date_time}|${f.geometry?.coordinates?.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  const points = deduped
    .map((f) => ({
      coord: f.geometry?.coordinates?.slice(0, 2),
      time: f.properties?.date_time,
      speed: f.properties?.speed ?? null,
      isWorking: f.properties?.is_working ?? null,
      workWidth: f.properties?.work_width ?? null,
    }))
    .filter((p) => Array.isArray(p.coord) && p.coord.length === 2)
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  return { points, truncated, failed: false };
}

// AgroAPI has no "when did this machine last report" shortcut — `locations`
// only returns ascending rows for a range you give it (capped at 1000), and
// the sensor's own `updated_at` is explicitly flagged unreliable in AgroAPI's
// own source (`# Is it updated_at or last_measurement.created_at?`). So
// finding the most recent day with real GPS data means actually searching —
// backward-doubling instead of a day-by-day scan keeps the *count* bounded
// (~9 windows to reach a year back), and the windows are anchored to the
// start of today (not `Date.now()` at call time) so repeated searches on the
// same day reuse the exact same cache keys — anchoring to the live clock
// meant every call built slightly different millisecond boundaries and
// never hit the cache at all, silently redoing the full search every time.
const PROBE_MAX_DAYS = 365;

function candidateWindows(anchorMs) {
  const windows = [];
  let end = anchorMs;
  let spanDays = 1;
  while (spanDays / 2 < PROBE_MAX_DAYS) {
    const start = end - spanDays * 24 * 3600 * 1000;
    windows.push([start, end]);
    end = start;
    spanDays *= 2;
  }
  return windows; // nearest-to-now window first
}

async function probeWindowHasPoints(machineId, sinceMs, untilMs) {
  const cacheKey = `track-probe:${machineId}:${sinceMs}-${untilMs}`;
  const { ok, body } = await cached(cacheKey, trackWindowTtl(untilMs), async () => {
    const query = new URLSearchParams({
      items: "1",
      since: new Date(sinceMs).toISOString(),
      until: new Date(untilMs).toISOString(),
    });
    const r = await agroFetchWithRetry(`/nouki/devices/${machineId}/locations?${query}`);
    return r.ok ? r : { ...r, __noCache: true };
  });
  return ok && (body.features || []).length > 0;
}

// Once a coarse window (up to ~256 days wide) is known to contain the
// answer, don't hand it to fetchMachineTrack — that fetch is built for
// *complete, gap-free* trajectories (4-hour chunks, bisected on truncation),
// exactly what real report billing needs but wildly disproportionate to
// "find the single most recent point": over a 128-day coarse window that
// meant hundreds of real sub-fetches and, in testing, 20+ seconds. Instead,
// keep bisecting with the same cheap existence check, always checking the
// *later* half first — the most recent point must be there if it has any
// data at all — until the window is a single day, small enough that the
// real, precise fetch is exactly as cheap as the existing "Today" filter.
const NARROW_TO_MS = 24 * 3600 * 1000;

async function narrowToLatestPointTime(machineId, sinceMs, untilMs) {
  if (untilMs - sinceMs <= NARROW_TO_MS) {
    const track = await fetchMachineTrack(machineId, sinceMs, untilMs);
    const last = track.points[track.points.length - 1];
    return last?.time || null;
  }
  const midMs = sinceMs + Math.floor((untilMs - sinceMs) / 2);
  if (await probeWindowHasPoints(machineId, midMs, untilMs)) {
    return narrowToLatestPointTime(machineId, midMs, untilMs);
  }
  return narrowToLatestPointTime(machineId, sinceMs, midMs);
}

// Probed in small parallel batches, nearest-to-now first — a machine used
// today or yesterday resolves in one batch (as fast as a single round trip);
// only a machine idle for months pays for a second or third. Fully
// sequential made the rare worst case (this app's "8 months idle" test
// machine) take minutes; firing all ~9 windows at once regardless would
// waste calls on the common case. This is the middle ground.
const BATCH_SIZE = 4;

/**
 * @returns {string|null} the machine's most recent activity date, as a plain
 *   `YYYY-MM-DD` (the caller's own timezone convention — same as the
 *   Custom-range date inputs), or null if nothing was found within a year.
 */
export async function findLatestActivityDate(machineId) {
  const anchorMs = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
  const windows = candidateWindows(anchorMs);

  for (let i = 0; i < windows.length; i += BATCH_SIZE) {
    const batch = windows.slice(i, i + BATCH_SIZE);
    const hits = await mapWithConcurrency(batch, ([s, u]) => probeWindowHasPoints(machineId, s, u));
    const hitIndex = hits.findIndex(Boolean);
    if (hitIndex === -1) continue;

    // Found the nearest-to-now window with data — narrow to its actual last
    // point rather than just returning "somewhere in this (possibly
    // months-wide) window".
    const [start, end] = batch[hitIndex];
    const lastTime = await narrowToLatestPointTime(machineId, start, end);
    if (!lastTime) return null;
    // This org is Bangkok-only, no DST (same convention as the Custom
    // range's own +07:00 date construction) — shift before taking the
    // calendar date, or a ping after 5pm UTC reports as the wrong day.
    return new Date(new Date(lastTime).getTime() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
  }
  return null;
}

// The machine's own most-frequently-reported width, if it reports one at all.
export function modalWorkWidth(points) {
  const counts = new Map();
  for (const p of points) {
    if (!p.workWidth) continue;
    const k = Math.round(p.workWidth * 10) / 10;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return modal ? modal[0] : null;
}
