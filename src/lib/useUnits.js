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

// Every mounted component that shows an area or a price. Without this, changing
// the unit in Settings updated that screen and left every other one showing the
// old unit until a full page reload — the module cache outlives client-side
// navigation, so "44.9 sào" survived a switch to hectares.
const subscribers = new Set();

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

// Call after changing the setting. Drops the cache AND tells every mounted
// component to re-read, so an open Booking list stops saying sào the moment the
// community switches to hectares.
export function clearUnitsCache() {
  cache = null;
  inFlight = null;
  fetchUnits().then((u) => {
    for (const notify of subscribers) notify(u);
  });
}

export function useUnits() {
  const [units, setUnits] = useState(cache || FALLBACK);

  useEffect(() => {
    let alive = true;
    const notify = (u) => {
      if (alive) setUnits(u);
    };
    subscribers.add(notify);
    fetchUnits().then(notify);
    return () => {
      alive = false;
      subscribers.delete(notify);
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
