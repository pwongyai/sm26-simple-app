import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";
import { contractorOrgId } from "@/lib/contractor";

// The contractor's machines — real NoukiSensor records from AgroAPI, including
// each machine's last known GPS position. Nothing about machines is stored
// locally; AgroAPI already owns them.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  if (!orgId) {
    return Response.json(
      { error: "No contractor organization configured for this site" },
      { status: 500 }
    );
  }

  const { ok, status, body } = await cached(
    `machines:${orgId}`,
    TTL.machines,
    () => agroFetch(`/organizations/${orgId}/machines`)
  );
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }

  return Response.json(
    body.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      make: m.make,
      model: m.model,
      serialNumber: m.serial_number,
      // GeoJSON Point [lng, lat, altitude] — where the machine was last seen,
      // genuinely sourced from its last real measurement (AgroAPI's own
      // `measurements.order(:read_at).last`). `updated_at` used to be shown
      // here too as a "last seen X ago" label, but that's the sensor
      // *record's* own save timestamp, unrelated to actual telemetry — for
      // one real machine it read "1 year ago" while its true last GPS
      // activity (found via the Latest filter's search) was 4 days prior.
      // Dropped rather than fixed cheaply: getting a trustworthy timestamp
      // means the same backward search "Latest" does, per machine, which
      // is too much to run just for a list view.
      lastLocation: m.location?.coordinates || null,
      fuel: m.metadata || null,
    }))
  );
}
