import { agroFetch } from "@/lib/agroapi";
import { cached, TTL } from "@/lib/cache";

// Which farms belong to this site's organization?
//
// This is the boundary of a contractor's world. AgroAPI's work detection scans
// every cropzone in the database, not just the ones in the community the
// contractor belongs to — so without this filter, กินรี would see (and could
// bill for) fields belonging to organizations they have nothing to do with.
//
// A cropzone's `farm.id` is the same id the detection returns as `service_for`,
// so membership of this set is the test in both directions.

const PAGE_SIZE = 50;
const MAX_PAGES = 40; // 2,000 farms — far beyond any real community

// Backed by the shared Supabase `api_cache` table (via `cached()`), not a
// bare in-memory Map — this used to be process-memory-only, which is fine
// under `next dev`'s one long-lived process but silently never warms up in
// production: Vercel's serverless functions don't reliably share memory
// between invocations, so every single report tap could pay for a full,
// unpaginated walk of every farm in the org (up to 40 sequential AgroAPI
// calls) before ever reaching the actual trajectory computation. Farms are
// added rarely, and a stale entry only means a newly-created field isn't
// reportable for a few minutes — a wrong-org field never becomes
// reportable, which is the direction that actually matters.
export async function siteFarmIds(agroOrgId) {
  // A FAILED page and "no more pages" used to break the same way, so one
  // transient AgroAPI hiccup mid-walk cached a partial list as if it were
  // complete — for the full TTL. This is the guard that decides whether a
  // cropzone belongs to the community, so a short list means false 403s:
  // "That field is not in your organization" for land that plainly is.
  //
  // Found 2026-08-23 with 250 of 641 farms cached (exactly 5 pages, so page 6
  // failed), which made report creation impossible for most of the community's
  // fields until the cache expired.
  //
  // Now a failed page throws, so `cached()` stores nothing and the next request
  // retries. Better a slow retry than a wrong answer held for five minutes.
  const ids = await cached(`site-farm-ids:${agroOrgId}`, TTL.siteFarmIds, async () => {
    const found = [];
    let complete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { ok, status, body } = await agroFetch(
        `/organizations/${agroOrgId}/farms?page=${page}`
      );
      if (!ok) {
        throw new Error(
          `site farm walk failed on page ${page} (AgroAPI ${status}) — refusing to cache a partial list`
        );
      }
      if (!Array.isArray(body) || body.length === 0) {
        complete = true;
        break;
      }
      for (const farm of body) found.push(farm.id);
      if (body.length < PAGE_SIZE) {
        complete = true;
        break;
      }
    }
    // Hitting MAX_PAGES without a short page means the community is bigger than
    // this walk supports — also not a complete list, so don't cache it.
    if (!complete) {
      throw new Error(
        `site farm walk hit MAX_PAGES (${MAX_PAGES}) without finishing — refusing to cache a partial list`
      );
    }
    return found;
  });
  return new Set(ids || []);
}

// Does this cropzone belong to the site? Used before writing anything against
// it, so an id passed in from a client can't reach outside the community.
export async function cropzoneInSite(cropzoneId, agroOrgId) {
  const { ok, body } = await agroFetch(`/cropzones/${cropzoneId}`);
  if (!ok) return false;
  const farmId = body?.farm?.id;
  if (!farmId) return false;
  const ids = await siteFarmIds(agroOrgId);
  return ids.has(farmId);
}
