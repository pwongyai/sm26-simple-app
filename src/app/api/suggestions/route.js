import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { computeWork, toUnits, serviceCharge } from "@/lib/engine";
import { contractorOrgId } from "@/lib/contractor";
import { cached, suggestionTtl, TTL } from "@/lib/cache";
import { siteFarmIds } from "@/lib/siteFarms";

// "What did my machines work on this day?"
//
// AgroAPI's own suggested-bookings endpoint already does the hard part:
// it intersects every machine measurement against every cropzone boundary,
// detects entry and exit, merges sessions less than 30 minutes apart, and
// discards anything under 500 m or 10 minutes as noise. That is exactly steps
// 1–2 of version 2's three-tap mechanism, already field-hardened, so we use it
// rather than reimplementing it.
//
// ONE OR TWO DAYS AT A TIME. Measured against production: 1 day ~2.4s, 7 days
// ~24s, 3 months times out entirely — the function scans measurements against
// cropzones, so cost grows with the window. Two days is the practical ceiling,
// and it covers the normal real case: work that runs overnight because it
// wasn't finished, or because the machine broke down and resumed the next day.
//
// Never call the POST variant of this endpoint — that one creates real bookings.
const MAX_DAYS = 2;
const MAX_DRAW_POINTS = 400;

// Keep the part of a track that's in or around this field, downsampled enough
// to draw. A small margin around the boundary keeps the approach visible, which
// is what makes an odd-looking result explainable rather than mysterious.
function nearFieldTrack(points, boundary) {
  const ring = boundary?.[0];
  if (!ring?.length) return [];

  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const padLng = (Math.max(...lngs) - Math.min(...lngs)) * 0.25 || 0.0005;
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.25 || 0.0005;

  const near = points.filter(
    (p) =>
      p.coord[0] >= Math.min(...lngs) - padLng &&
      p.coord[0] <= Math.max(...lngs) + padLng &&
      p.coord[1] >= Math.min(...lats) - padLat &&
      p.coord[1] <= Math.max(...lats) + padLat
  );

  const step = Math.ceil(near.length / MAX_DRAW_POINTS) || 1;
  return near.filter((_, i) => i % step === 0).map((p) => ({ coord: p.coord }));
}

export async function GET(request) {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return Response.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  }

  const days = Math.min(MAX_DAYS, Math.max(1, Number(searchParams.get("days")) || 1));

  const orgId = contractorOrgId(user);
  const from = `${date}T00:00:00Z`;
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days - 1);
  const to = `${end.toISOString().slice(0, 10)}T23:59:59Z`;

  const query = new URLSearchParams();
  query.set("filter[from]", from);
  query.set("filter[to]", to);

  // The slowest call in the app (~2.4s for one day). A day that has already
  // finished can never produce different work, so it's cached for a week;
  // today's is cached for ten minutes because machines are still moving.
  const { ok, status, body } = await cached(
    `suggested:${orgId}:${date}:${days}`,
    suggestionTtl(date, days),
    () => agroFetch(`/organizations/${orgId}/bookings/suggested?${query}`)
  );
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }

  // Merge sessions on the same field by the same machine within the window
  // into one job. AgroAPI splits on any gap over 30 minutes, so a single job
  // interrupted by nightfall, lunch or a breakdown arrives as several sessions
  // — the contractor thinks of that as one piece of work and should bill it
  // once. The individual sittings are kept for display.
  const merged = new Map();
  for (const s of body || []) {
    const op = (s.operations || [])[0] || {};
    const key = `${s.cropzone?.id}::${op.machine_id}`;
    const found = merged.get(key);
    if (!found) {
      merged.set(key, { ...s, parts: [{ start: s.start_date, end: s.end_date }] });
      continue;
    }
    found.parts.push({ start: s.start_date, end: s.end_date });
    if (s.start_date < found.start_date) found.start_date = s.start_date;
    if (!found.end_date || (s.end_date && s.end_date > found.end_date)) {
      found.end_date = s.end_date;
    }
  }
  // Keep only work done inside this contractor's own community. AgroAPI's
  // detection matches against every cropzone in the database, so without this
  // a contractor would be offered — and could bill for — fields belonging to
  // organizations they have no relationship with.
  const allowedFarms = await siteFarmIds(user.organization.agro_org_id);
  const inSite = [...merged.values()].filter((s) =>
    allowedFarms.has(s.service_for?.id)
  );
  const outsideSite = merged.size - inSite.length;
  const sessionList = inSite;

  // Which of these already became reports? Those are shown as done rather than
  // offered again — version 2's green/purple field distinction.
  const { data: existing } = await supabaseAdmin
    .from("work_reports")
    .select("id, agro_cropzone_id, agro_machine_id, started_at")
    .eq("contractor_agro_org_id", orgId)
    // Anything already reported for this field and machine inside the window
    // we're looking at. Deliberately not an exact timestamp match: the stored
    // start is when the machine was measured inside the field, which is not
    // the same as AgroAPI's detected session start.
    .gte("started_at", from)
    .lte("started_at", to);

  // The contractor's own price list and fuel rates — not AgroAPI's fixed
  // service price (version 2 §4.2: pricing is the contractor's setting).
  const [{ data: services }, { data: rates }] = await Promise.all([
    supabaseAdmin
      .from("services")
      .select("*")
      .eq("contractor_agro_org_id", orgId)
      .eq("active", true)
      .order("sort_order"),
    supabaseAdmin
      .from("machine_rates")
      .select("*")
      .eq("contractor_agro_org_id", orgId),
  ]);

  const emissionKgPerL = Number(user.organization.emission_kg_per_l ?? 2.68);

  const machines = await agroFetch(`/organizations/${orgId}/machines`);
  const machineName = (id) =>
    machines.ok ? machines.body.find((m) => m.id === id)?.name || null : null;

  const unitM2 = Number(user.organization.area_unit_m2);

  // One track fetch per machine for the WHOLE window, not per detected session.
  //
  // Found by testing: AgroAPI's session boundaries can be well off. On 5 Nov a
  // harvester's RK0340 session was reported as 06:30–09:57, but the machine
  // spent almost all of that driving 7 km to get there and only arrived at
  // 09:57 — measuring inside that window caught 86 m of a 5 rai job. Taking the
  // machine's full day and letting the field boundary do the filtering is both
  // more accurate and cheaper: one fetch per machine instead of one per session.
  const trackCache = new Map();

  // 1,000 points is a hard ceiling per request — the controller applies
  // `.limit(1000)` before paginating, so `page=2` comes back empty and the
  // documented paging is a dead end. A busy machine easily exceeds that in a
  // day (one harvester filled it by 03:46), and results are oldest-first, so a
  // single request silently truncates the afternoon. Instead we walk forward:
  // fetch, then re-request starting one second after the last point received,
  // until a page comes back short.
  const PAGE = 1000;
  const MAX_PAGES = 8;

  async function trackFor(machineId) {
    if (trackCache.has(machineId)) return trackCache.get(machineId);

    const points = [];
    let cursor = from;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await cached(
        `track:${machineId}:${cursor}:${to}`,
        suggestionTtl(date, days),
        () =>
          agroFetch(
            `/nouki/devices/${machineId}/locations?items=${PAGE}` +
              `&since=${encodeURIComponent(cursor)}&until=${encodeURIComponent(to)}`
          )
      );
      if (!res.ok) break;

      const features = res.body?.features || [];
      for (const f of features) {
        const coord = f.geometry?.coordinates?.slice(0, 2);
        if (!Array.isArray(coord) || coord.length !== 2) continue;
        points.push({
          coord,
          time: f.properties?.date_time,
          isWorking: f.properties?.is_working ?? null,
          workWidth: f.properties?.work_width ?? null,
        });
      }

      if (features.length < PAGE) break;

      const lastTime = features[features.length - 1]?.properties?.date_time;
      if (!lastTime) break;
      cursor = new Date(new Date(lastTime).getTime() + 1000).toISOString();
      if (cursor >= to) break;
    }

    trackCache.set(machineId, points);
    return points;
  }

  const sessions = await Promise.all(
    sessionList.map(async (s) => {
      const op = (s.operations || [])[0] || {};
      const machineId = op.machine_id;
      const boundary = s.cropzone?.location?.boundary?.coordinates;

      let work = null;
      let widthM = null;
      let widthSource = null;

      if (machineId && boundary) {
        const points = await trackFor(machineId);

        // Width as reported by the machine itself, most frequent value wins.
        const counts = new Map();
        for (const p of points) {
          if (!p.workWidth) continue;
          const k = Math.round(p.workWidth * 10) / 10;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

        if (modal) {
          widthM = modal[0];
          widthSource = "machine";
        }

        work = computeWork({ points, boundary, widthM });
      }

      // Pick the contractor's own service. AgroAPI's detected service is only
      // a hint for which of theirs to preselect; the price is always theirs.
      const hinted = (op.service?.name || "").toLowerCase();
      const service =
        (services || []).find((sv) => sv.name.toLowerCase() === hinted) ||
        (services || []).find((sv) =>
          hinted.includes(sv.activity_canonical?.split("_")[0] || " ")
        ) ||
        (services || [])[0] ||
        null;

      const price = service ? Number(service.price_per_unit) : null;

      const rate = (rates || []).find(
        (r) => r.agro_machine_id === machineId && r.service_id === service?.id
      );

      // Most machines don't report their working width, and without a width
      // there's no area and therefore no bill. Fall back to what the contractor
      // set in Settings for this machine and job, and recompute.
      if (widthM == null && rate?.width_m) {
        widthM = Number(rate.width_m);
        widthSource = "settings";
        if (boundary) {
          const points = await trackFor(machineId);
          work = computeWork({ points, boundary, widthM });
        }
      }

      // Fuel: litres per km for this machine doing this service, applied to the
      // distance actually driven inside the field. Emissions follow from fuel.
      const fuelLPerKm = rate ? Number(rate.fuel_l_per_km) : null;
      const fuelL =
        fuelLPerKm != null && work
          ? Number(((work.insideDistanceM / 1000) * fuelLPerKm).toFixed(2))
          : null;
      const emissionsKg =
        fuelL != null ? Number((fuelL * emissionKgPerL).toFixed(2)) : null;

      const done = (existing || []).find(
        (r) =>
          r.agro_cropzone_id === s.cropzone?.id &&
          r.agro_machine_id === machineId
      );

      return {
        cropzoneId: s.cropzone?.id,
        fieldName: s.cropzone?.name,
        boundary,
        cropAreaM2: s.cropzone?.area ?? null,
        // Times come from when the machine was actually inside the field,
        // falling back to AgroAPI's detected session where we can't tell.
        startedAt: work?.firstInside || s.start_date,
        endedAt: work?.lastInside || s.end_date,
        detectedStart: s.start_date,
        detectedEnd: s.end_date,
        // More than one entry means the job was interrupted and resumed.
        parts: s.parts,
        machineId,
        machineName: machineName(machineId),
        detectedService: op.service?.name || null,
        service: service
          ? {
              id: service.id,
              name: service.name,
              activityCanonical: service.activity_canonical,
              price,
            }
          : null,
        widthM,
        widthSource,
        work,
        // A trimmed copy of the track for drawing: only the points near this
        // field, capped so four fields' worth doesn't bloat the response. The
        // picture of the passes is what makes the area figure believable.
        trackPoints: machineId && boundary
          ? nearFieldTrack(await trackFor(machineId), boundary)
          : [],
        fuelLPerKm,
        fuelL,
        emissionsKg,
        // Everything the review screen needs, pre-computed in the units the
        // contractor bills in.
        workAreaUnits: work ? toUnits(work.workAreaM2, unitM2) : null,
        fieldAreaUnits: work ? toUnits(work.fieldAreaM2, unitM2) : null,
        estimatedCharge: work
          ? serviceCharge({
              workAreaM2: work.workAreaM2,
              unitM2,
              pricePerUnit: price,
            })
          : null,
        reportId: done?.id || null,
      };
    })
  );

  return Response.json({
    date,
    days,
    // Say so rather than silently dropping them: work outside the community is
    // real work, it just isn't reportable here.
    outsideSite,
    unit: user.organization.area_unit,
    currency: user.organization.currency,
    emissionKgPerL,
    // So the review screen can offer the full price list, not just the guess.
    services: (services || []).map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price_per_unit),
      activityCanonical: s.activity_canonical,
    })),
    sessions,
  });
}
