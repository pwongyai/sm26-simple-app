import { agroFetch } from "@/lib/agroapi";

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

// Cached for the lifetime of the server process. Farms are added rarely, and a
// stale entry only means a newly-created field isn't reportable for a few
// minutes; a wrong-org field never becomes reportable, which is the direction
// that matters.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

export async function siteFarmIds(agroOrgId) {
  const hit = cache.get(agroOrgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;

  const ids = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { ok, body } = await agroFetch(
      `/organizations/${agroOrgId}/farms?page=${page}`
    );
    if (!ok || !Array.isArray(body) || body.length === 0) break;
    for (const farm of body) ids.add(farm.id);
    if (body.length < PAGE_SIZE) break;
  }

  cache.set(agroOrgId, { ids, at: Date.now() });
  return ids;
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
