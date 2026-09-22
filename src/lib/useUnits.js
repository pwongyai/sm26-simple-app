"use client";

import { useEffect, useState } from "react";

// The community's currency and area unit, for any client component that
// displays a price or an area.
//
// This exists because the same field used to read 44.9 sào on My Fields and
// "10.1 rai" on the work order beneath it: the list asked the organisation,
// while six other files divided by a hardcoded 1600 and printed the literal
// word "rai". Every one of those was correct for Ruang Kaeo and wrong for
// Huong Ngai.
//
// `/api/settings` is readable by both roles — it returns the caller's own
// organisation, so a farmer gets their community's setting and a contractor
// gets the one they are working in.
//
// Cached at module level so six components on one screen make one request, and
// seeded with Thailand's values only as the pre-load placeholder — they are
// replaced the moment the real answer arrives. Nothing persists them.
let cache = null;
let inFlight = null;

const FALLBACK = { currency: "THB", areaUnit: "rai", areaUnitM2: 1600 };

async function fetchUnits() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cache = d
          ? {
              currency: d.currency || FALLBACK.currency,
              areaUnit: d.areaUnit || FALLBACK.areaUnit,
              areaUnitM2: Number(d.areaUnitM2) || FALLBACK.areaUnitM2,
            }
          : FALLBACK;
        return cache;
      })
      .catch(() => FALLBACK)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Call after changing the setting, so open screens pick up the new unit
// instead of showing the old one until a reload.
export function clearUnitsCache() {
  cache = null;
}

export function useUnits() {
  const [units, setUnits] = useState(cache || FALLBACK);

  useEffect(() => {
    let alive = true;
    fetchUnits().then((u) => {
      if (alive) setUnits(u);
    });
    return () => {
      alive = false;
    };
  }, []);

  return units;
}

// Square metres expressed in the community's unit. Returns a string, because
// every caller was doing `.toFixed(1)` on it anyway.
export function toUnits(areaM2, areaUnitM2, digits = 1) {
  const m2 = Number(areaM2);
  const per = Number(areaUnitM2) || FALLBACK.areaUnitM2;
  if (!Number.isFinite(m2)) return null;
  return (m2 / per).toFixed(digits);
}
