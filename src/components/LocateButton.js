"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

// "Use my location" — the one reference point that is always right.
//
// Every map in this app that opens with nothing to frame falls back to a
// hardcoded centre in Sa Kaeo. That is Ruang Kaeo's neighbourhood by
// coincidence and 1,500 km from Huong Ngai's, so a Vietnamese user told to
// "move the map to find your field" started in Thailand (2026-10-10). A
// sensible default fixes the common case; standing in the field and tapping
// this fixes all of them.
//
// Deliberately a button and not an automatic lookup on mount: the browser
// shows a permission prompt the first time, and a prompt nobody asked for,
// the instant a form opens, is the thing people reflexively deny.
export default function LocateButton({ onLocate, className = "" }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function locate() {
    // Also absent over plain http on a phone — geolocation needs a secure
    // origin — so this is not only "old browser".
    if (!navigator.geolocation) {
      setError(t("This device cannot share its location."));
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setBusy(false);
        // Say which of the three it was: "denied" is fixed in the phone's
        // settings, the other two by moving or waiting, and one message for
        // all three sends people to the wrong place.
        setError(
          err.code === err.PERMISSION_DENIED
            ? t("Location is turned off for this app.")
            : err.code === err.TIMEOUT
              ? t("Could not get a fix — try again outdoors.")
              : t("Your location is not available right now.")
        );
      },
      // A field is not a street corner: 15 s and a fresh fix beat a cached
      // one from the last town the phone was in.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <>
      <button type="button" className={`pill ${className}`} onClick={locate} disabled={busy}>
        {busy ? t("Finding you…") : t("📍 Use my location")}
      </button>
      {error && <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p>}
    </>
  );
}
