// Shared trajectory maths, used client-side when the user narrows a loaded
// track down to a single day (no extra API call needed for that).

export function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function statsFor(points) {
  let distanceKm = 0;
  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(points[i - 1].coord, points[i].coord);
  }

  const times = points.map((p) => p.time).filter(Boolean);
  const reportsWorking = points.some((p) => p.isWorking !== null);

  const widthCounts = new Map();
  for (const p of points) {
    if (!p.workWidth) continue;
    const key = Math.round(p.workWidth * 10) / 10;
    widthCounts.set(key, (widthCounts.get(key) || 0) + 1);
  }
  const modal = [...widthCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    count: points.length,
    distanceKm: Number(distanceKm.toFixed(2)),
    firstSeen: times[0] || null,
    lastSeen: times[times.length - 1] || null,
    workWidthM: modal ? modal[0] : null,
    workingPoints: reportsWorking ? points.filter((p) => p.isWorking).length : null,
  };
}

// Days present in a track, newest first, with how many points each holds.
// This is the contractor's real question — "what did this machine do that
// day" — and it's the same time-narrowing step the report flow starts with.
export function daysIn(points) {
  const byDay = new Map();
  for (const p of points) {
    if (!p.time) continue;
    const day = p.time.slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}
