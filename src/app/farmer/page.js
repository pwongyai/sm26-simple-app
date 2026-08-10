"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FARMER_CROPZONE_IDS } from "@/lib/config";

// m2 -> rai (1 rai = 1600 m2), matching the unit farmers actually think in.
function toRai(areaM2) {
  return (areaM2 / 1600).toFixed(1);
}

export default function FarmTab() {
  const [cropzones, setCropzones] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all(
          FARMER_CROPZONE_IDS.map((id) =>
            fetch(`/api/agroapi/cropzones/${id}`).then((r) => r.json())
          )
        );
        setCropzones(results);
      } catch {
        setError("Could not load fields from AgroAPI.");
      }
    })();
  }, []);

  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Your Fields</h1>
      <p className="mb-4 text-xs text-black/40">Live from AgroAPI.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!cropzones && !error && (
        <p className="text-sm text-black/50">Loading…</p>
      )}

      <ul className="flex flex-col gap-3">
        {cropzones?.map((cz) => (
          <li key={cz.id}>
            <Link
              href={`/farmer/field/${cz.id}`}
              className="block rounded border border-black/10 p-4 hover:bg-black/5"
            >
              <p className="font-medium">{cz.field?.name || cz.name}</p>
              <p className="text-sm text-black/50">
                {toRai(cz.area)} rai · {cz.crop?.name_i18n?.en || cz.crop?.name}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
