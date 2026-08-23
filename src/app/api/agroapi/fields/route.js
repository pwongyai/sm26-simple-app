import { requireAccess, unassignedFarmerId } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, TTL } from "@/lib/cache";
import { agroFetchWithRetry, mapWithConcurrency } from "@/lib/agroConcurrency";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_RADIUS_M = 250;
const MAX_RADIUS_M = 5000;

function haversineM([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Fields near a point, for the Machine tab's Select Area map: "tap the map —
// inside a field, or anywhere else if none match." Scoped by real distance,
// not org-wide — this org has 100+ farms, and the trajectory being reported
// against only ever needs the handful of fields actually near it.
//
// AgroAPI's own farms#index supports `sort_by=distance&location=lng,lat`
// (real PostGIS ST_Distance on each farm's centroid, verified live) — farms
// come back nearest-first, but the endpoint never actually includes a
// `distance` field in this response shape (that's a separate, unused scope
// in AgroAPI's own code), so the radius cutoff is computed here instead,
// from each farm's own `location` point — still just a haversine per farm
// already in memory, no extra calls. Nearest-first order means we can still
// stop reading pages once we pass the radius. Only then do we fetch each
// nearby farm's fields — a handful of calls instead of the ~100+ an earlier,
// unscoped version made (see git history: that version silently dropped a
// rate-limited farm's fields under the load).
export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required" }, { status: 400 });
  }
  const radiusM = Math.min(
    Number(searchParams.get("radiusM")) || DEFAULT_RADIUS_M,
    MAX_RADIUS_M
  );

  const orgId = user.organization.agro_org_id;
  // Rounded to ~110m so nearby requests (the same trajectory re-opened,
  // slightly different last-point) share a cache entry.
  const cacheKey = `site-fields:${orgId}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusM}`;

  const { ok, status, body } = await cached(cacheKey, TTL.siteFields, async () => {
    const nearbyFarms = [];
    for (let page = 1; page <= 40; page++) {
      const r = await agroFetch(
        `/organizations/${orgId}/farms?sort_by=distance&location=${lng},${lat}&simple=true&page=${page}`
      );
      if (!r.ok || !Array.isArray(r.body) || r.body.length === 0) break;

      let hitEdge = false;
      for (const farm of r.body) {
        const coord = farm.location?.coordinates;
        const distanceM = coord ? haversineM([lng, lat], coord) : Infinity;
        if (distanceM > radiusM) {
          hitEdge = true;
          break;
        }
        nearbyFarms.push(farm);
      }
      if (hitEdge || r.body.length < 50) break;
    }

    const fieldLists = await mapWithConcurrency(nearbyFarms, (farm) =>
      agroFetchWithRetry(`/farms/${farm.id}/fields`)
    );

    const fields = [];
    let failedFarms = 0;
    fieldLists.forEach((r, i) => {
      if (!r.ok || !Array.isArray(r.body)) {
        failedFarms++;
        return;
      }
      for (const f of r.body) {
        const ring = f.location?.boundary?.coordinates;
        if (!ring) continue; // no shape drawn yet — can't be tapped on the map
        fields.push({
          id: f.id,
          name: f.name,
          farmId: nearbyFarms[i].id,
          farmerName: nearbyFarms[i].name,
          boundary: ring,
          areaM2: f.area ?? null,
        });
      }
    });

    if (failedFarms) {
      console.error(`/api/agroapi/fields: ${failedFarms}/${nearbyFarms.length} nearby farms' field-lists failed`);
    }

    // Fields under this community's one shared Farm (every locally-drawn
    // field, smart or manual) all carry that Farm's generic name from
    // AgroAPI — the real owner is an app-layer concept, tracked here. A real
    // pre-existing AgroAPI field with no farmer_fields row at all (most of
    // this org's fields predate the app) is still never truly ownerless —
    // it reads as "Unassigned" from the moment it's seen here, the same
    // placeholder /api/reports falls back to when a report against one is
    // actually saved, so Select Area doesn't show a blank owner only to have
    // one appear retroactively after the report is approved.
    if (fields.length) {
      const { data: owned } = await supabaseAdmin
        .from("fields")
        .select("agro_field_id, farmer_id, farmers(name)")
        .in("agro_field_id", fields.map((f) => f.id));
      const ownerByField = new Map(
        (owned || []).map((row) => [row.agro_field_id, { farmerId: row.farmer_id, farmerName: row.farmers?.name }])
      );
      const unclaimed = fields.some((f) => !ownerByField.has(f.id));
      const unassignedId = unclaimed ? await unassignedFarmerId(user) : null;
      for (const f of fields) {
        const owner = ownerByField.get(f.id);
        f.farmerId = owner ? owner.farmerId : unassignedId;
        f.farmerName = owner ? owner.farmerName : "Unassigned";
      }
    }

    return { ok: true, status: 200, body: fields };
  });

  if (!ok) {
    return Response.json({ error: "Could not load fields" }, { status });
  }
  return Response.json(body);
}
