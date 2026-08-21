"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MachinePhoto from "@/components/MachinePhoto";
import FrozenHeaderScroll from "@/components/FrozenHeaderScroll";

export default function MachinesTab() {
  const [machines, setMachines] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMachines)
      .catch(() => setError("Could not load machines."));
  }, []);

  const header = (
    <>
      <h1 className="mb-1 text-lg font-semibold">Machines</h1>
      <p className="mb-4 text-xs text-[var(--text-tert)]">Live from AgroAPI · NoukiOpenAPI telemetry</p>
    </>
  );

  return (
    <FrozenHeaderScroll header={header}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!machines && !error && <p className="text-sm text-[var(--text-sec)]">Loading…</p>}

      <ul className="flex flex-col gap-3">
        {machines?.map((m) => (
          <li key={m.id}>
            <Link
              href={`/contractor/machines/${m.id}`}
              className="flex items-center gap-3 card p-3 hover:bg-black/5"
            >
              <MachinePhoto id={m.id} kind={m.kind} className="machine-thumb" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.name}</p>
                <p className="text-sm text-[var(--text-sec)]">
                  {[m.kind, [m.make, m.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                </p>
                {m.lastLocation && (
                  <p className="mt-1 text-xs text-[var(--text-tert)]">
                    last seen at {m.lastLocation[1].toFixed(4)}, {m.lastLocation[0].toFixed(4)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </FrozenHeaderScroll>
  );
}
