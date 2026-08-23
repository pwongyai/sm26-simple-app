// The work-area engine.
//
// The "coloring book" method, on real data: take the machine's actual GPS
// track, keep only the part inside the field boundary, buffer that track by
// the implement's real working width (painting a strip along the ground it
// actually covered), union every overlapping strip together so a turn or a
// repeated pass never double-counts, then clip the result to the field
// boundary. The area of what's left is the area actually worked, and it is
// what the bill is based on.
//
// AgroAPI computes something similar in its `operation_area_coverages` view
// — a real buffered/painted coverage shape, not a length×width estimate —
// but with a hardcoded 3 m buffer around every GPS point; it has no concept
// of implement width, so a 1.5 m tiller and a 6 m header score identically.
// Ours uses the width the machine itself reports instead of AgroAPI's fixed
// 3 m, but the *method* — real geometry, not an estimate — is the same one.
import * as turf from "@turf/turf";

const EARTH_R = 6371000;

// Local flat projection around a reference point. Over a single field
// (hundreds of metres) the error is negligible, and it lets us do all the
// geometry in plain metres.
function projector(refLng, refLat) {
  const kx = (Math.PI / 180) * EARTH_R * Math.cos((refLat * Math.PI) / 180);
  const ky = (Math.PI / 180) * EARTH_R;
  return ([lng, lat]) => [(lng - refLng) * kx, (lat - refLat) * ky];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Shoelace area, in m² once the ring is projected.
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function dist([x1, y1], [x2, y2]) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function closeRing(ring) {
  const [x0, y0] = ring[0];
  const [xn, yn] = ring[ring.length - 1];
  return x0 === xn && y0 === yn ? ring : [...ring, ring[0]];
}

/**
 * @param points  [{coord:[lng,lat], time, isWorking}] — the machine's track
 * @param boundary GeoJSON Polygon coordinates (first ring is the outer boundary)
 * @param widthM  implement working width in metres
 */
export function computeWork({ points, boundary, widthM }) {
  const outer = boundary?.[0];
  if (!outer?.length || points.length < 2) return null;

  const [refLng, refLat] = outer[0];
  const project = projector(refLng, refLat);

  const ring = outer.map(project);
  const fieldPolygon = turf.polygon([closeRing(outer)]);
  const fieldAreaM2 = turf.area(fieldPolygon);

  const track = points.map((p) => ({ ...p, xy: project(p.coord) }));

  // Walk the track segment by segment, sampling how much of each segment lies
  // inside the field — and, while walking, collect the inside portions as
  // real [lng,lat] runs (a new run starts wherever the track leaves the
  // field) to paint below. Sampling handles segments that cross the boundary
  // without needing real per-segment clipping for the distance/time figures.
  const SAMPLES = 8;
  let insideLengthM = 0;
  let firstInside = null;
  let lastInside = null;
  const runs = [];
  let currentRun = null;

  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const segLen = dist(a.xy, b.xy);

    // A machine sitting still with the engine on shouldn't accumulate area.
    if (segLen === 0) continue;

    let insideSamples = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const t = (s + 0.5) / SAMPLES;
      const p = [
        a.xy[0] + (b.xy[0] - a.xy[0]) * t,
        a.xy[1] + (b.xy[1] - a.xy[1]) * t,
      ];
      if (pointInRing(p, ring)) insideSamples++;
    }

    if (insideSamples > 0) {
      insideLengthM += segLen * (insideSamples / SAMPLES);
      firstInside = firstInside || a.time;
      lastInside = b.time || lastInside;

      if (!currentRun) {
        currentRun = [a.coord];
        runs.push(currentRun);
      }
      currentRun.push(b.coord);
    } else {
      currentRun = null;
    }
  }

  const workAreaM2 = paintedAreaM2({ runs, widthM: widthM || 0, fieldPolygon });

  return {
    fieldAreaM2: Math.round(fieldAreaM2),
    // No cap needed: the painted shape is clipped to the field polygon
    // itself, so it cannot mathematically exceed the field's own area —
    // unlike a length×width estimate, which has to be capped by hand.
    workAreaM2: Math.round(workAreaM2),
    percentWorked: fieldAreaM2 ? Math.round((workAreaM2 / fieldAreaM2) * 100) : 0,
    insideDistanceM: Math.round(insideLengthM),
    firstInside,
    lastInside,
    hours:
      firstInside && lastInside
        ? Number(
            ((new Date(lastInside) - new Date(firstInside)) / 3600000).toFixed(2)
          )
        : null,
  };
}

// Buffer every inside run by half the implement width — painting a strip
// along the ground actually covered — union every strip together so an
// overlapping or repeated pass never double-counts, then clip to the field
// (trims any sliver of buffer that pokes past the true boundary near an
// entry/exit point). Degenerate geometry from a single run (rare, but real
// GPS jitter can produce a self-intersecting buffer) is skipped rather than
// failing the whole report — a dropped sliver undercounts by at most a few
// square metres, which is safer than overcounting or crashing.
function paintedAreaM2({ runs, widthM, fieldPolygon }) {
  if (!widthM || !runs.length) return 0;

  const strips = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    try {
      strips.push(turf.buffer(turf.lineString(run), widthM / 2, { units: "meters" }));
    } catch {
      // Skip this one run; the rest still count.
    }
  }
  if (!strips.length) return 0;

  let painted = strips[0];
  for (let i = 1; i < strips.length; i++) {
    try {
      painted = turf.union(turf.featureCollection([painted, strips[i]])) || painted;
    } catch {
      // Leave the shape as painted so far — that one strip's overlap stays
      // uncombined rather than losing the rest of the union.
    }
  }

  try {
    const clipped = turf.intersect(turf.featureCollection([painted, fieldPolygon]));
    return clipped ? turf.area(clipped) : 0;
  } catch {
    return turf.area(painted);
  }
}

// The subset of the track actually inside the field — what the review
// screen shows overlaid on the polygon, so the "coloring book" math is
// visible, not just its numeric output. Plain point-inside test (not the
// per-segment sampling computeWork uses for the area figure) — good enough
// for drawing, and simpler.
export function clipToPolygon(points, boundary) {
  const outer = boundary?.[0];
  if (!outer?.length) return [];
  const [refLng, refLat] = outer[0];
  const project = projector(refLng, refLat);
  const ring = outer.map(project);
  return points.filter((p) => pointInRing(project(p.coord), ring));
}

export function toUnits(m2, unitM2) {
  return Number((m2 / unitM2).toFixed(2));
}

// What to charge: the service's own price per unit, applied to the area
// actually worked. Frozen onto the report at approval — a later boundary
// correction must never silently re-bill a finished job (version 2 §15.5).
export function serviceCharge({ workAreaM2, unitM2, pricePerUnit }) {
  if (!pricePerUnit) return null;
  return Math.round(toUnits(workAreaM2, unitM2) * pricePerUnit);
}

// Area of a drawn boundary, in m². Used while the farmer is still drawing, so
// they can see the plot size before committing — AgroAPI computes its own once
// the field is saved, and that one is authoritative.
export function polygonAreaM2(ring) {
  if (!ring || ring.length < 3) return 0;

  const [refLng, refLat] = ring[0];
  const project = projector(refLng, refLat);
  const xy = ring.map(project);

  let sum = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    sum += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]);
  }
  return Math.abs(sum / 2);
}

// Rough centre of a field boundary, as [lng, lat].
//
// Stamped onto a work order at creation so Today's Work can sort jobs by
// distance from the contractor's home base (see nearestNeighborOrder in
// contractor/page.js). That routing existed but silently never ran, because
// nothing ever populated work_orders.location_lat/lng — the Settings screen
// claimed "the closest open job to home comes first" while the calculation had
// no coordinates to work with (fixed 2026-08-23).
//
// A plain average of the ring's vertices, not a true area centroid: for a
// field-shaped polygon the two are close enough that the driving order never
// differs, and this needs no projection. Returns null rather than a guess when
// the boundary is unusable, because a wrong pin is worse than no pin — an
// unmapped job is shown separately rather than mis-routed.
export function boundaryCentre(boundary) {
  const ring = boundary?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;

  let lng = 0;
  let lat = 0;
  let n = 0;
  for (const c of ring) {
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    lng += c[0];
    lat += c[1];
    n++;
  }
  if (!n) return null;
  return [lng / n, lat / n];
}
