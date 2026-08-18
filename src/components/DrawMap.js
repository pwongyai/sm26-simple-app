"use client";

import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Marker,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Drawing a field boundary, following version 3's design: one screen, map
// first. Panning just moves the map; tapping it adds a real lat/lng vertex
// joined to the last. Once three points exist it closes into a polygon. Each
// vertex is a draggable marker — dragging *is* the edit, there's no separate
// edit mode to explain.
//
// Satellite only: a farmer is recognising their own field from the imagery, and
// a street map shows nothing useful out here.
//
// The map is never moved programmatically after it mounts. An earlier version
// re-centred whenever the component re-rendered, which meant every tap threw
// the view back to its starting point and dragged the new vertex off to a
// corner. Wherever the farmer has panned to is where the map stays.

const SATELLITE_URL = "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
const SUBDOMAINS = ["0", "1", "2", "3"];

const vertexIcon = L.divIcon({
  className: "",
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#fff;
    border:2.5px solid var(--purple);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function ClickToAdd({ onAdd }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lng, e.latlng.lat]);
    },
  });
  return null;
}

/**
 * @param points  [[lng,lat], …] — the vertices so far
 * @param onAdd   append a vertex
 * @param onMove  move vertex i
 */
export default function DrawMap({
  points = [],
  onAdd,
  onMove,
  center = [13.94, 102.07],
  height = 340,
}) {
  const latlngs = points.map(([lng, lat]) => [lat, lng]);

  return (
    <div
      style={{ height }}
      className="overflow-hidden rounded-xl border border-[var(--rule)]"
    >
      <MapContainer
        center={center}
        zoom={17}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={SATELLITE_URL}
          subdomains={SUBDOMAINS}
          maxZoom={21}
          attribution="&copy; Google"
        />

        {/* Under three points it's still a line, not a field. */}
        {latlngs.length >= 3 ? (
          <Polygon
            positions={latlngs}
            pathOptions={{ color: "#c084fc", weight: 2, fillOpacity: 0.25 }}
          />
        ) : (
          latlngs.length >= 2 && (
            <Polyline positions={latlngs} pathOptions={{ color: "#c084fc", weight: 2 }} />
          )
        )}

        {latlngs.map((ll, i) => (
          <Marker
            key={i}
            position={ll}
            icon={vertexIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                onMove(i, [lng, lat]);
              },
            }}
          />
        ))}

        <ClickToAdd onAdd={onAdd} />
      </MapContainer>
    </div>
  );
}
