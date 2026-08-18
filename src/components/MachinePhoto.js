"use client";

import { useState } from "react";

// Generic per-kind stock photos, same model version 3 itself uses (its own
// fleet reuses a handful of stock images by type, not real per-serial
// photography). Real per-machine photos now live in
// public/machines/by-id/{machine.id}.{jpg,png} and take priority when present.
const KIND_PHOTO = {
  harvester: "/machines/harvester.jpg",
  tractor: "/machines/tractor.jpg",
};

export default function MachinePhoto({ id, kind, className, emptyContent = null }) {
  const candidates = [
    `/machines/by-id/${id}.jpg`,
    `/machines/by-id/${id}.png`,
    KIND_PHOTO[kind],
  ].filter(Boolean);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];

  return (
    <div className={src ? `${className} has-photo` : className}>
      {src ? (
        <img src={src} alt={kind} onError={() => setIdx((i) => i + 1)} />
      ) : (
        emptyContent
      )}
    </div>
  );
}
