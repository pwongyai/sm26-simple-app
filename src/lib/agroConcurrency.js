import { agroFetch } from "@/lib/agroapi";

// Shared with the trajectory fetch (TRAJECTORY_FETCH_GUIDE.md) — any route
// that fans out to many AgroAPI calls (one per farm, one per time window,
// etc.) needs the same two protections: a concurrency cap, because
// unbounded Promise.all against 100+ farms trips AgroAPI's rate limiter and
// silently drops whatever failed, and retry-with-backoff on 429 so a
// rate-limited call doesn't just crash mid-fetch.
const CONCURRENCY = 5; // 8 workers tripped AgroAPI's rate limiter in testing

export async function agroFetchWithRetry(path, attempt = 0) {
  const res = await agroFetch(path);
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return agroFetchWithRetry(path, attempt + 1);
  }
  return res;
}

export async function mapWithConcurrency(items, fn, limit = CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
