import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";

// Everything the Weather tab shows, in one call: right now, the next few days,
// and the season ahead. All three are real AgroAPI data.
//
// Version 3 §7.11: weather is information, never advice. No "best day to
// spray", no recommendation — the farmer reads it and decides.

// AgroAPI's tercile codes, from `app/models/tercile_forecast.rb`: a forecast is
// classed by which third of the last five years' range is most likely — above
// normal (AN), near normal (NN) or below normal (BN), at high or moderate
// confidence.
const OUTLOOK = {
  HIGH_PROB_AN: { label: "Likely above normal", direction: "up" },
  MODERATE_PROB_AN: { label: "Somewhat above normal", direction: "up" },
  HIGH_PROB_NN: { label: "Near normal", direction: "flat" },
  MODERATE_PROB_NN: { label: "Near normal", direction: "flat" },
  HIGH_PROB_BN: { label: "Likely below normal", direction: "down" },
  MODERATE_PROB_BN: { label: "Somewhat below normal", direction: "down" },
};

function monthLabel(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d) =>
    d.toLocaleDateString([], { month: "short", year: "numeric" });
  return s.getMonth() === e.getMonth() ? fmt(s) : `${fmt(s)} – ${fmt(e)}`;
}

export async function GET(request, { params }) {
  const { fieldId } = await params;
  const { response } = await requireAccess({ fieldId });
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const cropzoneId = searchParams.get("cropzoneId");
  const force = searchParams.get("refresh") === "1";

  // Each part is cached for as long as it stays true: conditions now for half
  // an hour, the forecast for a few hours, the seasonal outlook for a day.
  const [current, daily, terciles] = await Promise.all([
    cached(
      `wx:current:${fieldId}`,
      TTL.weatherCurrent,
      () => agroFetch(`/fields/${fieldId}/forecast/current`),
      { force }
    ),
    // 1, 5, 10 or 15 only — and 10/15 come back empty, so 5 is the real ceiling.
    cached(
      `wx:daily:${fieldId}`,
      TTL.forecast,
      () => agroFetch(`/fields/${fieldId}/forecast/5`),
      { force }
    ),
    // The seasonal outlook hangs off the cropzone, not the field.
    cropzoneId
      ? cached(`wx:seasonal:${cropzoneId}`, TTL.seasonal, () =>
          agroFetch(`/cropzones/${cropzoneId}/terciles`)
        )
      : Promise.resolve({ ok: false }),
  ]);

  const now = current.ok ? current.body : null;

  // Terciles arrive as one row per property per period; pair temperature with
  // rainfall so each period reads as a single line.
  const periods = new Map();
  if (terciles.ok && Array.isArray(terciles.body)) {
    for (const row of terciles.body) {
      const key = `${row.start_date}|${row.end_date}`;
      const entry = periods.get(key) || {
        label: monthLabel(row.start_date, row.end_date),
        startDate: row.start_date,
      };
      const outlook = OUTLOOK[row.forecast] || { label: "No clear signal", direction: "flat" };

      if (row.property === "average_air_temperature") {
        entry.temperature = {
          ...outlook,
          medianC: row["5_years_percentile_50"]
            ? Number(row["5_years_percentile_50"].toFixed(1))
            : null,
        };
      } else if (row.property === "precipitation") {
        entry.rain = {
          ...outlook,
          medianMm: row["5_years_percentile_50"]
            ? Math.round(row["5_years_percentile_50"])
            : null,
        };
      }
      periods.set(key, entry);
    }
  }

  return Response.json({
    current: now
      ? {
          text: now.weather_text,
          canonical: now.canonical_name,
          tempC: now.temperature,
          feelsLikeC: now.temperature_real_feel,
          humidity: now.relative_humidity,
          windSpeed: now.wind_speed,
          windUnit: now.wind_speed_unit,
          rainPast24h: now.precipitation_summary?.Past24Hours ?? null,
        }
      : null,
    daily: (daily.ok ? daily.body : []).map((d) => ({
      date: new Date(d.timestamp * 1000).toISOString().slice(0, 10),
      phrase: d.short_phrase,
      canonical: d.canonical_name,
      tempMin: d.temp_min,
      tempMax: d.temp_max,
      tempUnit: d.temp_unit,
      rainProb: d.rain_prob,
      rainValue: d.rain_value,
      humidity: d.relative_humidity,
    })),
    seasonal: [...periods.values()].sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    ),
  }, { headers: cacheHeaders(TTL.weatherCurrent) });
}
