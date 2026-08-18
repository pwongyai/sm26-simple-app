import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Real 7-day forecast for a field. Weather is attached to the field, not the
// cropzone, so this is keyed by field id.
//
// Version 3 §7.11: weather is shown as information only. No "best day", no
// "recommended", no advice — the farmer decides.
export async function GET(request, { params }) {
  const { fieldId } = await params;
  const { response } = await requireAccess({ fieldId });
  if (response) return response;

  // The day count is an enum, not a free number — 1, 5, 10 or 15 only, and 7
  // returns a 400. Tested against production: 10 and 15 answer 200 with an
  // empty array, so 5 is the longest range that actually carries data.
  const { ok, status, body } = await agroFetch(`/fields/${fieldId}/forecast/5`);
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }

  return Response.json(
    (body || []).map((d) => ({
      date: new Date(d.timestamp * 1000).toISOString().slice(0, 10),
      phrase: d.short_phrase,
      canonical: d.canonical_name,
      tempMin: d.temp_min,
      tempMax: d.temp_max,
      tempUnit: d.temp_unit,
      rainProb: d.rain_prob,
      rainValue: d.rain_value,
      rainUnit: d.rain_unit,
      humidity: d.relative_humidity,
      windSpeed: d.wind_speed,
      windUnit: d.wind_speed_unit,
    }))
  );
}
