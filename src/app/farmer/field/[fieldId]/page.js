"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Map from "@/components/Map";
import { cropLabel } from "@/lib/crop";
import ManageField from "@/components/ManageField";
import RequestService from "@/components/RequestService";

// Field Detail — version 3 §11.17: Map / Weather / Activities as three tabs,
// because one long scroll was too crowded. Everything here is real: the
// boundary and imagery come from AgroAPI, the NDVI raster is decoded from
// AgroAPI's own Sentinel-2 capture, and the forecast is AgroAPI's.
// AccuWeather-style canonical names from AgroAPI, mapped to something readable.
const WEATHER_ICON = {
  sunny: "☀️",
  mostly_sunny: "🌤️",
  partly_sunny: "⛅",
  intermittent_clouds: "⛅",
  hazy_sunshine: "🌥️",
  mostly_cloudy: "☁️",
  cloudy: "☁️",
  dreary: "☁️",
  fog: "🌫️",
  showers: "🌦️",
  mostly_cloudy_with_showers: "🌦️",
  partly_sunny_with_showers: "🌦️",
  t_storms: "⛈️",
  mostly_cloudy_with_t_storms: "⛈️",
  partly_sunny_with_t_storms: "⛈️",
  rain: "🌧️",
};

const TABS = [
  { key: "map", label: "Map" },
  { key: "weather", label: "Weather" },
  { key: "activities", label: "Activities" },
];

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FieldDetailPage({ params }) {
  const { fieldId: cropzoneId } = use(params);
  const router = useRouter();

  const [tab, setTab] = useState("map");
  const [layer, setLayer] = useState("normal"); // normal | ndvi
  const [cropzone, setCropzone] = useState(null);
  const [activities, setActivities] = useState(null);
  const [ndvi, setNdvi] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [services, setServices] = useState([]);

  const load = useCallback(async (force = false) => {
    {
      try {
        // `no-store` on the browser side only bypasses the browser's own
        // fetch cache — the server still holds this for up to a minute
        // (`TTL.cropzone`). That's fine for ordinary navigation, but right
        // after this same tab just wrote a name/boundary/crop/planting-date
        // edit, the next `load()` must not replay that same stale minute
        // back at the person who just made the edit — hence `force`, which
        // asks the server route to skip its cache too (`?refresh=1`).
        const refresh = force ? "?refresh=1" : "";
        const [cz, acts] = await Promise.all([
          fetch(`/api/agroapi/cropzones/${cropzoneId}${refresh}`, {
            cache: "no-store",
          }).then((r) => r.json()),
          fetch(`/api/agroapi/cropzones/${cropzoneId}/activities`, {
            cache: "no-store",
          }).then((r) => r.json()),
        ]);
        setCropzone(cz);
        setActivities(acts);
      } catch {
        setError("Could not load this field from AgroAPI.");
      }
    }
  }, [cropzoneId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => (r.ok ? r.json() : []))
      .then((s) =>
        setServices(
          (s || []).map((x) => ({ id: x.id, name: x.name, price: Number(x.price_per_unit) }))
        )
      )
      .catch(() => {});
  }, []);

  // NDVI is fetched only when asked for — it decodes a raster server-side.
  // `force` re-pulls from AgroAPI instead of using the cached copy.
  const loadNdvi = useCallback(
    async (force = false) => {
      if (ndvi && !force) return;
      setNdvi({ loading: true });
      try {
        const res = await fetch(
          `/api/agroapi/cropzones/${cropzoneId}/ndvi${force ? "?refresh=1" : ""}`
        );
        setNdvi(await res.json());
      } catch {
        setNdvi({ error: "Could not load NDVI." });
      }
    },
    [cropzoneId, ndvi]
  );

  useEffect(() => {
    if (tab === "weather" && !forecast && cropzone?.field?.id) {
      fetch(
        `/api/agroapi/fields/${cropzone.field.id}/weather?cropzoneId=${cropzoneId}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setForecast(d || { daily: [], seasonal: [] }))
        .catch(() => setForecast({ daily: [], seasonal: [] }));
    }
  }, [tab, forecast, cropzone, cropzoneId]);

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!cropzone) return <p className="empty-msg">Loading…</p>;
  // A cropzone that's been archived or renewed is no longer yours to view; the
  // proxy returns a 404 body, which must not be rendered as a field.
  if (!cropzone.id) {
    return (
      <div className="mt-6">
        <p className="empty-msg">
          This crop is no longer active — it may have been archived or renewed.
        </p>
        <Link href="/farmer" className="btn btn-outline block text-center">
          Back to My Fields
        </Link>
      </div>
    );
  }

  const boundary = cropzone.location?.boundary?.coordinates;
  const areaRai = (cropzone.area / 1600).toFixed(1);
  const crop = cropLabel(cropzone.crop);
  // AgroAPI's own prediction, from its crop engine.
  const maturityDate = cropzone.predicted?.maturity_date || null;
  const cropRecorded = crop !== "Crop not recorded";
  const place = [cropzone.subdistrict, cropzone.district, cropzone.region]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <div className="my-3 flex items-center gap-2">
        <Link href="/farmer" className="ov-back inline-flex items-center justify-center">
          ‹
        </Link>
        <h1 className="text-base font-bold">{cropzone.field?.name || cropzone.name}</h1>
        <button
          className="ml-auto text-xs font-bold underline"
          onClick={() => setManaging(true)}
        >
          ⚙ Manage
        </button>
      </div>

      <div className="card mb-3 p-4">
        <p className="font-bold">{cropzone.field?.name || cropzone.name}</p>
        {/* No crop icon: it implied a rice field on cropzones where nobody has
            recorded a crop at all. */}
        <p className="text-sm text-[var(--text-sec)]">{crop}</p>
        <p className="text-sm text-[var(--text-sec)]">{areaRai} rai</p>

        <div className="mt-2 border-t border-[var(--rule)] pt-2 text-xs">
          <p className="text-[var(--text-sec)]">
            Planting Date:{" "}
            <b className="text-[var(--ink)]">
              {cropzone.planting_date ? fmtDate(cropzone.planting_date) : "not planted"}
            </b>
            {cropzone.dap != null && (
              <span className="text-[var(--text-tert)]"> · day {cropzone.dap}</span>
            )}
          </p>
          <p className="text-[var(--text-sec)]">
            Maturity Date:{" "}
            {maturityDate ? (
              <b className="text-[var(--ink)]">{fmtDate(maturityDate)}</b>
            ) : (
              // Two different reasons for a missing prediction, and they call
              // for different actions: nobody has said what's planted, versus
              // AgroAPI's crop engine simply hasn't produced a figure yet.
              <span className="text-[var(--text-tert)]">
                {!cropzone.planting_date
                  ? "—"
                  : !cropRecorded
                    ? "needs a crop — none recorded yet"
                    : "not predicted yet by AgroAPI"}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="pilltabs mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "map" && (
        <>
          {/* NDVI sits on the same map as a layer, not on a separate screen
              (version 3 §7.10). */}
          <div className="mb-2 flex gap-2">
            <button
              className={`pill ${layer === "normal" ? "pill-active" : ""}`}
              onClick={() => setLayer("normal")}
            >
              Normal
            </button>
            <button
              className={`pill ${layer === "ndvi" ? "pill-active" : ""}`}
              onClick={() => {
                setLayer("ndvi");
                loadNdvi();
              }}
            >
              NDVI
            </button>
          </div>

          <Map
            boundary={boundary}
            overlay={
              layer === "ndvi" && ndvi?.image
                ? { image: ndvi.image, bounds: ndvi.bounds }
                : null
            }
            height={300}
          />

          {layer === "ndvi" && (
            <div className="mt-2">
              {ndvi?.loading && (
                <p className="text-xs text-[var(--text-tert)]">
                  Decoding satellite capture…
                </p>
              )}
              {ndvi?.error && (
                <p className="fieldset-note">{ndvi.error}</p>
              )}
              {ndvi?.image && (
                <>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 flex-1 rounded"
                      style={{
                        background:
                          "linear-gradient(to right,#a50026,#d73027,#f46d43,#fdae61,#fee08b,#d9ef8b,#a6d96a,#66bd63,#1a9850,#005a32)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--text-tert)]">
                    <span>0.0 bare</span>
                    <span>1.0 dense</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-sec)]">
                    Mean NDVI <b>{ndvi.meanNdvi}</b> · {ndvi.source}
                    {ndvi.pixelMeanNdvi != null && (
                      <span className="text-[var(--text-tert)]">
                        {" "}
                        (all pixels {ndvi.pixelMeanNdvi})
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-[var(--text-tert)]">
                    {ndvi.coveragePixels} Sentinel-2 pixels, 10 m each
                  </p>
                  {/* Two different dates, and they can be weeks apart: when
                      the satellite flew over, and when we last pulled it. */}
                  <p className="text-[11px] text-[var(--text-tert)]">
                    Satellite captured <b>{fmtDate(ndvi.date)}</b>
                    {ndvi.fetchedAt && (
                      <> · pulled {fmtDateTime(ndvi.fetchedAt)}</>
                    )}
                  </p>
                  <p className="text-[11px] text-[var(--text-tert)]">
                    {ndvi.available?.length} clear captures on record ·{" "}
                    <button
                      onClick={() => loadNdvi(true)}
                      className="underline"
                    >
                      check for a newer one
                    </button>
                  </p>
                </>
              )}
            </div>
          )}

          {place && (
            <p className="mt-2 text-xs text-[var(--text-sec)]">📍 {place}</p>
          )}
        </>
      )}

      {tab === "weather" && (
        <div className="flex flex-col gap-3">
          {!forecast && <p className="empty-msg">Loading weather…</p>}

          {/* Right now */}
          {forecast?.current && (
            <div className="card p-4 text-center">
              <p className="text-4xl">{WEATHER_ICON[forecast.current.canonical] || "🌤️"}</p>
              <p className="mt-1 text-3xl font-bold">
                {Math.round(forecast.current.tempC)}°
                <span className="text-lg font-normal text-[var(--text-tert)]">
                  {" "}
                  feels {Math.round(forecast.current.feelsLikeC)}°
                </span>
              </p>
              <p className="text-sm text-[var(--text-sec)]">{forecast.current.text}</p>
              <div className="mt-3 flex justify-center gap-6 text-xs">
                <span>
                  💧 <b>{forecast.current.rainPast24h ?? 0}</b> mm
                  <span className="block text-[var(--text-tert)]">past 24h</span>
                </span>
                <span>
                  💦 <b>{forecast.current.humidity}%</b>
                  <span className="block text-[var(--text-tert)]">humidity</span>
                </span>
                <span>
                  🍃 <b>{Math.round(forecast.current.windSpeed)}</b>{" "}
                  {forecast.current.windUnit}
                  <span className="block text-[var(--text-tert)]">wind</span>
                </span>
              </div>
            </div>
          )}

          {/* The days ahead — however many AgroAPI actually returns. */}
          {forecast?.daily?.length > 0 && (
            <div className="card p-3">
              <p className="field-label">
                {forecast.daily.length}-day forecast
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {forecast.daily.map((d) => (
                  <div key={d.date} className="min-w-[92px] flex-1 text-center">
                    <p className="text-xs font-bold">
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString([], {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p className="my-1 text-2xl">
                      {WEATHER_ICON[d.canonical] || "🌤️"}
                    </p>
                    <p className="text-xs font-bold">
                      {Math.round(d.tempMin)}–{Math.round(d.tempMax)}°
                    </p>
                    <p className="text-[11px] text-[var(--text-sec)]">
                      Rain {d.rainProb}%
                    </p>
                    <p className="text-[10px] leading-tight text-[var(--text-tert)]">
                      {d.phrase}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Season ahead, from AgroAPI's tercile forecast: which third of the
              last five years' range this period is most likely to fall in. */}
          {forecast?.seasonal?.length > 0 && (
            <div className="card p-3">
              <p className="field-label">Seasonal outlook</p>
              {forecast.seasonal.map((s) => (
                <div
                  key={s.label}
                  className="flex items-start gap-3 border-b border-[var(--rule)] py-2 last:border-none"
                >
                  <p className="w-28 shrink-0 text-xs font-bold">{s.label}</p>
                  <div className="flex-1 text-xs">
                    {s.temperature && (
                      <p>
                        🌡️ {s.temperature.label}
                        {s.temperature.medianC != null && (
                          <span className="text-[var(--text-tert)]">
                            {" "}
                            (5-yr median {s.temperature.medianC}°C)
                          </span>
                        )}
                      </p>
                    )}
                    {s.rain && (
                      <p>
                        🌧️ {s.rain.label}
                        {s.rain.medianMm != null && (
                          <span className="text-[var(--text-tert)]">
                            {" "}
                            (5-yr median {s.rain.medianMm} mm)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-[var(--text-tert)]">
                Compared with the same months over the last five years. Shown for
                information only.
              </p>
            </div>
          )}

          {forecast && !forecast.current && forecast.daily?.length === 0 && (
            <p className="empty-msg">No weather available for this field.</p>
          )}
        </div>
      )}

      {requesting && (
        <RequestService
          fields={[
            {
              fieldId: cropzone.field?.id,
              cropzoneId: cropzone.id,
              name: cropzone.field?.name || cropzone.name,
              areaUnits: Number((cropzone.area / 1600).toFixed(1)),
              crop: cropzone.crop?.name,
            },
          ]}
          services={services}
          unit="rai"
          presetFieldId={cropzone.id}
          onClose={() => setRequesting(false)}
          onSent={load}
        />
      )}

      {managing && (
        <ManageField
          cropzone={cropzone}
          unit="rai"
          unitM2={1600}
          onClose={() => setManaging(false)}
          onRenewed={(newCropzoneId) => {
            setManaging(false);
            // The page is keyed by cropzone id, so a new season means a new URL.
            router.replace(`/farmer/field/${newCropzoneId}`);
          }}
          onChanged={() => {
            // Crop, boundary and area may all have changed — and the NDVI
            // overlay belongs to the old shape, so drop it too.
            setNdvi(null);
            setForecast(null);
            load(true);
          }}
        />
      )}

      {tab === "activities" && (
        <div className="flex flex-col gap-2">
          {!activities && <p className="empty-msg">Loading…</p>}
          {activities?.length === 0 && (
            <p className="empty-msg">No work recorded on this field yet.</p>
          )}
          {activities?.map((a) => (
            <div key={a.id} className="card p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold">{a.activity_type?.name}</p>
                <p className="text-xs text-[var(--text-tert)]">
                  {a.start_date?.slice(0, 10)}
                </p>
              </div>
              {a.note && (
                <p className="text-xs text-[var(--text-sec)]">{a.note}</p>
              )}
            </div>
          ))}

          {/* After the history, not before it: read what's been done to the
              field, then decide what to ask for next. */}
          <button
            className="btn btn-go mt-2 w-full"
            onClick={() => setRequesting(true)}
          >
            🚜 Request Service
          </button>
        </div>
      )}
    </>
  );
}
