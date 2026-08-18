import { fromArrayBuffer } from "geotiff";
import { PNG } from "pngjs";
import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";

// NDVI for one field, decoded from AgroAPI's own raster and returned as a PNG
// the map can lay over the satellite image.
//
// This follows the house spec in
// `Projects/AgroAPI_Fetching/ACTION_TASK_fetch_ndvi_s2.md`, whose reference
// implementation is `handoff_s2_tool/fetch_ndvi_overlay_s2.py`:
//
//   1. GET /cropzones/{id}/s2multi?items=200 — Sentinel-2 only, no PLANET
//      check, by design: it's faster and sufficient here.
//   2. Records come back already sorted newest-first. Scan in that order and
//      take the first with `cloudy: false` and a `uri`. Never just take the
//      newest without checking — the most recent capture is frequently 100%
//      cloud-masked. Every record masked is a real state, not an error.
//   3. Two ways to read it: the number alone comes from
//      `extra_info.__SHRINKED_POLYGON_NDVI_MEAN` with no download at all; the
//      picture needs the GeoTIFF, where **NDVI is band 13 of 16** (NDMI 14,
//      EVI 15), EPSG:3857.
//
// Open question, carried over from that spec and still unverified: a cropzone
// with *no* capture history may need an explicit `POST /cropzones/{id}/vis`
// request-then-poll before imagery exists. Everything tested so far already had
// captures, so this path is untried — it surfaces here as "no clear capture".

// The same colour ramp the Python pipeline uses, so an overlay here and an
// overlay from that tool are directly comparable.
const STOPS = [
  [0.0, [165, 0, 38]],
  [0.24, [215, 48, 39]],
  [0.32, [244, 109, 67]],
  [0.4, [253, 174, 97]],
  [0.48, [254, 224, 139]],
  [0.56, [217, 239, 139]],
  [0.64, [166, 217, 106]],
  [0.72, [102, 189, 99]],
  [0.8, [26, 152, 80]],
  [1.0, [0, 90, 50]],
];
const ALPHA = Math.round(255 * 0.88);

function ramp(value) {
  const v = Math.min(1, Math.max(0, value));
  for (let i = 1; i < STOPS.length; i++) {
    const [x0, c0] = STOPS[i - 1];
    const [x1, c1] = STOPS[i];
    if (v <= x1) {
      const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Web Mercator metres → WGS84 degrees, for handing Leaflet real bounds.
function mercatorToLatLng(x, y) {
  const R = 6378137;
  return [
    (Math.atan(Math.sinh(y / R)) * 180) / Math.PI,
    (x / R) * (180 / Math.PI),
  ];
}

export async function GET(request, { params }) {
  const { cropzoneId } = await params;
  const { response } = await requireAccess({ cropzoneId });
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const wanted = searchParams.get("date");
  const force = searchParams.get("refresh") === "1";

  // Decoding a raster is the most expensive thing this app does, and a
  // satellite capture never changes once published — so do it once per
  // field-and-date and reuse the result.
  const result = await cached(
    `ndvi:${cropzoneId}:${wanted || "latest"}`,
    TTL.ndvi,
    async () => {
      // Sentinel-2 only. `items=200` because the default page would silently
      // cut off older captures on a field with long history.
      const list = await agroFetch(
        `/cropzones/${cropzoneId}/s2multi?items=200`
      );
      const records = list.ok && Array.isArray(list.body) ? list.body : [];

      // Already newest-first from the API — scan in that order and stop at the
      // first usable one.
      const usable = records.filter((r) => r.cloudy === false && r.uri);

      if (usable.length === 0) {
        // Two different situations, and they read very differently to a
        // farmer. A field created minutes ago has no imagery yet because
        // Sentinel hasn't passed over since; an older field with only masked
        // captures has been unlucky with cloud.
        return {
          available: [],
          error: records.length
            ? "No clear satellite capture yet — every pass so far was cloud-covered."
            : "No satellite imagery for this field yet. Sentinel-2 passes every " +
              "few days; check back after the next one.",
          // The spec flags an untested path here: a brand-new cropzone may need
          // `POST /cropzones/:id/vis` and polling before imagery is generated.
          // Recorded rather than guessed at.
          neverCaptured: records.length === 0,
        };
      }

      const chosen =
        (wanted && usable.find((r) => r.date.slice(0, 10) === wanted)) ||
        usable[0];

      const available = usable.map((r) => r.date.slice(0, 10));

      // AgroAPI already computed the mean over the shrunk polygon, which avoids
      // edge pixels — better than anything derived from the rendered image, and
      // free.
      const reportedMean = chosen.extra_info?.__SHRINKED_POLYGON_NDVI_MEAN;

      // The uri is a pre-signed GCS link — fetched directly, not through AgroAPI.
      const raster = await fetch(chosen.uri);
      if (!raster.ok) {
        // Don't cache a download failure — the signed link may just have aged out.
        return {
          available,
          error: "Could not download the satellite raster.",
          __noCache: true,
        };
      }

      const tiff = await fromArrayBuffer(await raster.arrayBuffer());
      const image = await tiff.getImage();
      const width = image.getWidth();
      const height = image.getHeight();
      const [minX, minY, maxX, maxY] = image.getBoundingBox();

      // Band 13 of 16 is NDVI (14 is NDMI, 15 is EVI).
      const [values] = await image.readRasters({ samples: [12] });

      const png = new PNG({ width, height });
      let count = 0;
      let sum = 0;

      for (let i = 0; i < width * height; i++) {
        const raw = values[i];
        const idx = i * 4;

        // 0 is nodata in these rasters — transparent, not dark red.
        if (!Number.isFinite(raw) || raw === 0) {
          png.data[idx + 3] = 0;
          continue;
        }

        // Sentinel band 13 arrives scaled by 10,000 in some products and as a
        // plain ratio in others; normalise both to 0–1.
        const ndvi = Math.abs(raw) > 1.5 ? raw / 10000 : raw;
        const [r, g, b] = ramp(ndvi);

        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = ALPHA;

        count++;
        sum += ndvi;
      }

      const buffer = PNG.sync.write(png);

      // The raster's CRS is Web Mercator (EPSG:3857) per `extra_info.crs`.
      const [south, west] = mercatorToLatLng(minX, minY);
      const [north, east] = mercatorToLatLng(maxX, maxY);

      return {
        source: "S2multi",
        // When the satellite actually flew over.
        date: chosen.date,
        // When we pulled it from AgroAPI. Stamped inside the loader, so it's
        // the moment of the real fetch and survives in the cache — with a
        // 24-hour TTL these two dates can be weeks apart, and conflating them
        // would misrepresent how fresh the picture is.
        fetchedAt: new Date().toISOString(),
        available,
        meanNdvi:
          typeof reportedMean === "number"
            ? Number(reportedMean.toFixed(3))
            : null,
        // The plain average of every valid pixel. Differs from the figure above
        // because AgroAPI's is computed over a shrunk polygon that drops edge
        // pixels — the Python overlay tool prints this one, so both are shown
        // rather than leaving the two tools looking like they disagree.
        pixelMeanNdvi: count ? Number((sum / count).toFixed(3)) : null,
        coveragePixels: count,
        bounds: [
          [south, west],
          [north, east],
        ],
        image: `data:image/png;base64,${buffer.toString("base64")}`,
      };
    },
    { force }
  );

  return Response.json(result, { headers: cacheHeaders(TTL.ndvi) });
}
