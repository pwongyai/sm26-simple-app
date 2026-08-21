"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Marker,
  ImageOverlay,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Google satellite imagery. Kept as one constant so the whole app can be
// switched to another provider in a single edit — worth knowing that Google's
// terms expect the Maps Platform for production use, so a real deployment
// either buys that or swaps this line for Esri World Imagery, which is free to
// use with attribution.
const SATELLITE_URL = "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
const SUBDOMAINS = ["0", "1", "2", "3"];

// Leaflet ships its marker icon as image files resolved relative to the CSS,
// which a bundler doesn't serve. A small inline pin avoids the broken-image
// default entirely.
const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);background:var(--green-dark);border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 20],
});

// Today's Work routing — the home base and each numbered stop along the
// nearest-neighbor route.
const homeIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:50%;background:var(--ink);
    border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;
    align-items:center;justify-content:center;font-size:14px">⌂</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
function stopIcon(label) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:var(--accent);
      color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Frame the geometry once, then leave the map alone. The dependency is a
// string built from the coordinates, not the array itself — an array literal is
// a new object on every render, which made this re-fit continuously and undo
// the user's own panning and zooming.
//
// TRAJECTORY_FETCH_GUIDE.md §4: calling fitBounds() immediately after mount
// can silently fail (zooms to maxZoom on nothing) if the container's DOM
// size hasn't settled yet — timing-dependent, easy to ship by accident.
// Fixed by polling with requestAnimationFrame until the map actually has a
// size, and by re-fitting on window resize (container size can change after
// first fit too, e.g. an overlay's layout shifting under it).
function frame(shapes, map, onSettled) {
  const points = shapes.flat();
  if (points.length === 0) return;
  const size = map.getSize();
  if (size.x === 0 || size.y === 0) {
    requestAnimationFrame(() => frame(shapes, map, onSettled));
    return;
  }
  if (points.length === 1) {
    map.setView(points[0], 17);
  } else {
    map.fitBounds(L.latLngBounds(points), { padding: [18, 18] });
  }
  if (onSettled) {
    const c = map.getCenter();
    onSettled({ center: [c.lat, c.lng], zoom: map.getZoom() });
  }
}

// `initialView` — a {center,zoom} captured from a PREVIOUS map (e.g. the
// Trajectory pane) — makes this map open on that exact view instead of
// re-fitting to the same shapes and (usually, but not always identically)
// landing back near it. Select Area's "don't make the user's trajectory
// jump around between screens" ask needs the former, not the latter.
function FitBounds({ shapes, initialView, onViewChange }) {
  const map = useMap();
  const key = shapes
    .flat()
    .map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join("|");
  // `key` changes on every draw tap (each new point joins `shapes`), which
  // re-runs this effect — without this guard, `initialView` got re-applied
  // on every single tap, snapping the map back to the same fixed view each
  // time and undoing whatever the user had just panned/zoomed to reach the
  // next corner. It must only ever land the map once; after that, the view
  // is the user's to drive.
  const appliedInitialView = useRef(false);

  useEffect(() => {
    if (initialView) {
      if (appliedInitialView.current) return;
      appliedInitialView.current = true;
      map.setView(initialView.center, initialView.zoom);
      return;
    }
    frame(shapes, map, onViewChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  useEffect(() => {
    function onResize() {
      map.invalidateSize();
      if (initialView) {
        map.setView(initialView.center, initialView.zoom);
      } else {
        frame(shapes, map, onViewChange);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}

// `onViewChange` needs to track the view the user actually ends up looking
// at, not just where the initial auto-fit landed — otherwise a manual
// zoom/pan on the Trajectory map is silently lost the moment "Create Report"
// hands `mapView` off to Select Area, which then opens back at the stale
// pre-zoom view instead of where the contractor actually was.
function ViewTracker({ onViewChange }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
    zoomend() {
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
  });
  return null;
}

function ClickToPin({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Fires only when the tap wasn't on a field polygon — Leaflet doesn't bubble
// a vector layer's own click up to the map, so this and each Polygon's
// onClick are naturally mutually exclusive with no manual stopPropagation.
function ClickEmpty({ onClick }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

const vertexIcon = L.divIcon({
  className: "",
  html: `<div style="width:12px;height:12px;border-radius:50%;background:var(--purple);
    border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5)"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

/**
 * @param boundary GeoJSON Polygon coordinates ([[[lng,lat],…]]) — drawn as the field
 * @param track    [{coord:[lng,lat]}] — the machine's path
 * @param trackEndIcon  emoji shown at the track's last point (version 3's
 *                 machine pin at its current position)
 * @param pin      {lat,lng} — a dropped marker
 * @param onPick   makes the map tappable to place/move the pin
 * @param overlay  {image, bounds} — an NDVI raster laid over the imagery
 * @param markers  [{lat,lng,label,home}] — Today's Work: one home pin plus a
 *                 numbered stop per routed job
 * @param fields   [{id,boundary,reported}] — Select Area: every real field
 *                 nearby, each independently tappable
 * @param onFieldTap  (fieldId) — a field polygon was tapped
 * @param drawPoints  [{lat,lng}] — the boundary being drawn, in progress
 * @param onMapClick  (latlng) — any tap that wasn't on a field polygon; used
 *                 both for Select Area's "missed" case and Draw Boundary's
 *                 add-a-vertex
 * @param initialView  {center:[lat,lng], zoom} — open on exactly this view
 *                 (e.g. one captured from a previous screen's map via
 *                 onViewChange) instead of fitting to this map's own shapes
 * @param onViewChange  ({center,zoom}) — called once this map settles on a
 *                 view, so a later screen can reopen on the same one
 */
export default function SatelliteMap({
  boundary,
  track = [],
  trackEndIcon = null,
  pin = null,
  onPick = null,
  overlay = null,
  markers = [],
  fields = [],
  onFieldTap = null,
  drawPoints = [],
  onMapClick = null,
  height = 240,
  center = [13.94, 102.07], // Sa Kaeo — where Ruang Kaeo's fields are
  initialView = null,
  onViewChange = null,
}) {
  // Leaflet wants [lat,lng]; GeoJSON gives [lng,lat].
  const ring = (boundary?.[0] || []).map(([lng, lat]) => [lat, lng]);
  const line = (track || []).map((p) => [p.coord[1], p.coord[0]]);
  const pinLatLng = pin ? [pin.lat, pin.lng] : null;
  const markerPoints = markers.map((m) => [m.lat, m.lng]);
  const fieldRings = fields.map((f) => (f.boundary?.[0] || []).map(([lng, lat]) => [lat, lng]));
  const drawLatLngs = drawPoints.map((p) => [p.lat, p.lng]);

  // Zoom follows the trajectory (or boundary/pin/markers/in-progress draw)
  // — never the nearby field polygons. Select Area's fields can span a much
  // wider area than where the machine actually worked; including them in the
  // fit zoomed out so far the trajectory itself was a speck. Fields still
  // render, they just don't drive the camera. Only fall back to fitting
  // fields when there's truly nothing else on the map to frame.
  const primaryShapes = [ring, line, pinLatLng ? [pinLatLng] : [], markerPoints, drawLatLngs].filter(
    (s) => s.length
  );
  const shapes = primaryShapes.length ? primaryShapes : fieldRings;

  return (
    <div
      style={{ height }}
      className="overflow-hidden rounded-xl border border-[var(--rule)]"
    >
      <MapContainer
        center={initialView?.center || pinLatLng || center}
        zoom={initialView?.zoom || 15}
        scrollWheelZoom={false}
        preferCanvas
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={SATELLITE_URL}
          subdomains={SUBDOMAINS}
          maxZoom={21}
          attribution="&copy; Google"
        />
        {overlay?.image && overlay?.bounds && (
          // `ndvi-raster` turns off the browser's image smoothing. The raster
          // is genuinely 10×16 pixels — one Sentinel-2 pixel is 10 m on the
          // ground — so blowing it up with interpolation invents detail that
          // isn't in the data and makes real values look like a green smudge.
          // Nearest-neighbour keeps each cell an honest block, matching the
          // Python overlay tool's output.
          <ImageOverlay
            url={overlay.image}
            bounds={overlay.bounds}
            opacity={1}
            className="ndvi-raster"
          />
        )}
        {ring.length > 0 && (
          <Polygon
            positions={ring}
            pathOptions={{ color: "#c084fc", weight: 2, fillOpacity: 0.15 }}
          />
        )}
        {line.length > 1 && (
          // weight 1.5 — thick enough to read against satellite imagery,
          // thin enough not to become visual noise with thousands of raw
          // GPS pings (TRAJECTORY_FETCH_GUIDE.md §4: 3 was tested too thick).
          <Polyline
            positions={line}
            pathOptions={{ color: "#fb923c", weight: 1.5, opacity: 0.95 }}
          />
        )}
        {trackEndIcon && line.length > 0 && (
          <Marker
            position={line[line.length - 1]}
            icon={L.divIcon({
              className: "",
              html: `<div style="width:28px;height:28px;border-radius:50%;background:#fbbf24;
                border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;
                align-items:center;justify-content:center;font-size:15px">${trackEndIcon}</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            })}
          />
        )}
        {fields.map((f, i) => (
          <Polygon
            key={f.id}
            positions={fieldRings[i]}
            pathOptions={{
              color: f.reported ? "#c084fc" : "#4ade80",
              weight: 2,
              fillOpacity: 0.25,
            }}
            eventHandlers={
              onFieldTap
                ? {
                    // Overlapping fields (a small real sliver next to a
                    // bigger one, or two adjacent farms sharing an edge)
                    // otherwise ALL fire on one tap — Leaflet doesn't stop
                    // a vector layer's click from reaching whatever's
                    // underneath it. Without this, a single tap could kick
                    // off several concurrent Match Work Order checks that
                    // race each other.
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      onFieldTap(f.id);
                    },
                  }
                : undefined
            }
          />
        ))}
        {drawLatLngs.length > 1 && (
          <Polygon
            positions={drawLatLngs}
            pathOptions={{ color: "#c084fc", weight: 2, fillOpacity: 0.2, dashArray: "4 4" }}
          />
        )}
        {drawPoints.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={vertexIcon} />
        ))}
        {pinLatLng && <Marker position={pinLatLng} icon={pinIcon} />}
        {markers.map((m, i) => (
          <Marker
            key={i}
            position={[m.lat, m.lng]}
            icon={m.home ? homeIcon : stopIcon(m.label)}
          />
        ))}
        {(shapes.length > 0 || initialView) && (
          <FitBounds shapes={shapes} initialView={initialView} onViewChange={onViewChange} />
        )}
        {onViewChange && <ViewTracker onViewChange={onViewChange} />}
        {onPick && <ClickToPin onPick={onPick} />}
        {onMapClick && <ClickEmpty onClick={onMapClick} />}
      </MapContainer>
    </div>
  );
}
