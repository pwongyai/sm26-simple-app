import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { contractorOrgId } from "@/lib/contractor";
import { fetchMachineTrack, modalWorkWidth } from "@/lib/trajectory";

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function GET(request, { params }) {
  const { machineId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  // The machine must belong to this contractor's own organization — a machine
  // id from another contractor is refused before any telemetry is fetched.
  const orgId = contractorOrgId(user);
  const machines = await agroFetch(`/organizations/${orgId}/machines`);
  if (!machines.ok) {
    return Response.json({ error: "Could not verify machine" }, { status: 502 });
  }
  const machine = machines.body.find((m) => m.id === machineId);
  if (!machine) return Response.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");
  const force = searchParams.get("refresh") === "1";
  if (!sinceParam) {
    return Response.json({ error: "since is required" }, { status: 400 });
  }
  const sinceMs = new Date(sinceParam).getTime();
  let untilMs = untilParam ? new Date(untilParam).getTime() : Date.now();

  // Custom range is capped at 1 week — long enough for any real "did we miss
  // a day" check, short enough to stay well inside what the chunked fetch
  // comfortably handles without a very long request.
  const ONE_WEEK_MS = 7 * 24 * 3600 * 1000;
  if (untilMs - sinceMs > ONE_WEEK_MS) {
    untilMs = sinceMs + ONE_WEEK_MS;
  }

  const { points, truncated, failed } = await fetchMachineTrack(machineId, sinceMs, untilMs, force);
  if (failed) {
    return Response.json({ error: "AgroAPI returned an error" }, { status: 502 });
  }

  let distanceKm = 0;
  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(points[i - 1].coord, points[i].coord);
  }

  const times = points.map((p) => p.time).filter(Boolean);
  const workingPoints = points.filter((p) => p.isWorking).length;
  const reportsWorking = points.some((p) => p.isWorking !== null);

  return Response.json({
    machine: { id: machine.id, name: machine.name, kind: machine.kind },
    points,
    stats: {
      count: points.length,
      truncated,
      distanceKm: Number(distanceKm.toFixed(2)),
      firstSeen: times[0] || null,
      lastSeen: times[times.length - 1] || null,
      workWidthM: modalWorkWidth(points),
      workingPoints: reportsWorking ? workingPoints : null,
    },
  });
}
