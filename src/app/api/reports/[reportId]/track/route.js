import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";

// The GPS trace of one report, on its own, as GeoJSON.
//
// This exists because ADAPT's `spatialRecordsFile` is defined as "a reference
// to the file/URL containing specific Spatial Records for this Operation" — a
// pointer, not inline data. Every stored ADAPT Work Record points here instead
// of embedding the points, which keeps a document at ~1 kB rather than ~2.5 kB.
// The track is roughly two thirds of a report's storage, so embedding it would
// nearly double the database for no benefit.
//
// Format note: a fully conformant ADAPT bundle wants **GeoParquet** for vector
// data, with the file sitting in the same directory as the serialised model.
// This endpoint serves GeoJSON, which is the internal form — AgroAPI's own
// exporter references a GeoJSON path too. Converting to GeoParquet and emitting
// a directory bundle is the separate conformance step, and is likely the
// largest technical item in a real export deliverable (the Node tooling for
// GeoParquet is much weaker than Python's). See
// Projects/SM26/WORK_TYPE_MAP.md.
//
// Not public: a track is a farmer's field and a contractor's working pattern.
// The tokenised no-login viewer link planned in INTEGRATION_PLAN.md is a
// separate, deliberately scoped door — this one requires a session.
export async function GET(request, { params }) {
  const { reportId } = await params;
  const { user, response } = await requireAccess();
  if (response) return response;

  const { data, error } = await supabaseAdmin
    .from("work_reports")
    .select("id, track_points, started_at, ended_at, machine_name, field_name")
    .eq("id", reportId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load the track" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  // Stored as [{ coord: [lng, lat] }, ...] — verified against live data, and
  // already in GeoJSON's [lng, lat] order, so nothing is swapped here. Do not
  // "fix" this to [lat, lng]: for Thailand and Vietnam both values are
  // plausible-looking positives (102, 13.9), so a swap plots the track in
  // Somalia without anything obviously failing.
  const points = Array.isArray(data.track_points) ? data.track_points : [];
  const coordinates = points
    .map((p) => (Array.isArray(p?.coord) ? p.coord.slice(0, 2).map(Number) : null))
    .filter((c) => c && c.length === 2 && c.every(Number.isFinite));

  return Response.json({
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {
      reportId: data.id,
      fieldName: data.field_name,
      machineName: data.machine_name,
      startedAt: data.started_at,
      endedAt: data.ended_at,
      pointCount: coordinates.length,
    },
  });
}
