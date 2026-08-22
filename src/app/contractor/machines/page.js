"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import MachinePhoto from "@/components/MachinePhoto";
import FrozenHeaderScroll from "@/components/FrozenHeaderScroll";

// Which machines show up here, and in what order, is a local-only display
// preference (machine_settings) — AgroAPI has no concept of either. Edit
// mode follows the same view -> Edit -> Cancel/Save shape as Settings:
// nothing writes until Save, and Save commits every row's active state +
// order together in one batch (src/app/api/machines/settings/route.js).
export default function MachinesTab() {
  const [machines, setMachines] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/machines?activeOnly=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMachines)
      .catch(() => setError("Could not load machines."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startEdit() {
    setEditing(true);
    const res = await fetch("/api/machines");
    if (res.ok) setDraft(await res.json());
  }

  function moveDraft(index, dir) {
    setDraft((list) => {
      const next = [...list];
      const j = index + dir;
      if (j < 0 || j >= next.length) return list;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function toggleActive(index) {
    setDraft((list) =>
      list.map((m, i) => (i === index ? { ...m, active: !m.active } : m))
    );
  }

  async function save() {
    setBusy(true);
    await fetch("/api/machines/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: draft.map((m, i) => ({ machineId: m.id, active: m.active, sortOrder: i })),
      }),
    });
    setBusy(false);
    setEditing(false);
    load();
  }

  const header = (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Machines</h1>
        {!editing && (
          <button onClick={startEdit} className="text-xs text-[var(--text-sec)] underline">
            Edit
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-[var(--text-tert)]">Live from AgroAPI · NoukiOpenAPI telemetry</p>
    </>
  );

  if (editing) {
    return (
      <FrozenHeaderScroll header={header}>
        <p className="mb-3 text-xs text-[var(--text-tert)]">
          Choose which machines show up above, and in what order. Inactive
          machines stay in AgroAPI and keep their history — they just won&apos;t
          list here.
        </p>
        <div className="flex flex-col gap-2">
          {draft.length === 0 && <p className="text-sm text-[var(--text-sec)]">Loading…</p>}
          {draft.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center gap-2 card p-3 ${m.active ? "" : "opacity-50"}`}
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveDraft(i, -1)}
                  disabled={i === 0}
                  className="rounded border border-[var(--rule)] px-1.5 text-xs disabled:opacity-30"
                  aria-label={`Move ${m.name} up`}
                >
                  ▲
                </button>
                <button
                  onClick={() => moveDraft(i, 1)}
                  disabled={i === draft.length - 1}
                  className="rounded border border-[var(--rule)] px-1.5 text-xs disabled:opacity-30"
                  aria-label={`Move ${m.name} down`}
                >
                  ▼
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-[var(--text-sec)]">
                  {[m.kind, [m.make, m.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex gap-1.5">
                {[
                  { key: true, label: "Active" },
                  { key: false, label: "Inactive" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => (m.active !== opt.key ? toggleActive(i) : null)}
                    className={`rounded px-2 py-1 text-[11px] ${
                      m.active === opt.key ? "bg-[var(--ink)] text-white" : "bg-surface text-tert"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setEditing(false)}
            disabled={busy}
            className="btn btn-outline flex-1"
          >
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </FrozenHeaderScroll>
    );
  }

  return (
    <FrozenHeaderScroll header={header}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!machines && !error && <p className="text-sm text-[var(--text-sec)]">Loading…</p>}
      {machines && machines.length === 0 && (
        <p className="text-sm text-[var(--text-sec)]">
          No active machines — tap Edit above to bring one back.
        </p>
      )}

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
