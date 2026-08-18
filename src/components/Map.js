"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the map can only load in the
// browser. Every map in the app goes through this wrapper.
const SatelliteMap = dynamic(() => import("@/components/SatelliteMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--map-b)] text-xs text-[var(--text-tert)]"
      style={{ height: 240 }}
    >
      Loading satellite…
    </div>
  ),
});

export default SatelliteMap;
