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
