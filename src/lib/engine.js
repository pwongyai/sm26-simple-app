// The work-area engine.
//
// Version 2's core calculation, on real data: take the machine's actual GPS
// track, keep only the part that falls inside the field boundary, multiply that
// length by the implement's working width. That is the area the contractor
// actually worked, and it is what the bill is based on.
//
// AgroAPI computes something similar in its `operation_area_coverages` view,
// but with a hardcoded 3 m buffer around every GPS point — it has no concept of
// implement width, so a 1.5 m tiller and a 6 m header score identically. Ours
// uses the width the machine itself reports, so ours is the billing number.

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
  const fieldAreaM2 = ringArea(ring);

  const track = points.map((p) => ({ ...p, xy: project(p.coord) }));

  // Walk the track segment by segment. A segment counts toward worked length
  // in proportion to how much of it lies inside the field — sampling handles
  // the segments that cross the boundary, without needing real clipping.
  const SAMPLES = 8;
  let insideLengthM = 0;
  let totalLengthM = 0;
  let firstInside = null;
  let lastInside = null;

  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const segLen = dist(a.xy, b.xy);
    totalLengthM += segLen;

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
    }
  }

  const workAreaM2 = insideLengthM * (widthM || 0);

  return {
    fieldAreaM2: Math.round(fieldAreaM2),
    // Capped at the field: overlapping passes are real (a combine turning, or
    // covering the same strip twice) but they don't make the field bigger, and
    // billing more than 100% of a field would be indefensible.
    workAreaM2: Math.round(Math.min(workAreaM2, fieldAreaM2)),
    rawWorkAreaM2: Math.round(workAreaM2),
    overlapped: workAreaM2 > fieldAreaM2,
    percentWorked: fieldAreaM2
      ? Math.min(100, Math.round((workAreaM2 / fieldAreaM2) * 100))
      : 0,
    insideDistanceM: Math.round(insideLengthM),
    totalDistanceM: Math.round(totalLengthM),
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
