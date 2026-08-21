"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { polygonAreaM2 } from "@/lib/engine";
import { cropLabel } from "@/lib/crop";

const DrawMap = dynamic(() => import("@/components/DrawMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--map-b)] text-xs text-[var(--text-tert)]"
      style={{ height: 340 }}
    >
      Loading satellite…
    </div>
  ),
});

// Manage Field — the edit surface behind version 3's "⚙ Manage" link.
//
// Four things a farmer needs to change: the name, the boundary, what's
// planted, and — the one that matters most over a year — starting a new season.
const VIEWS = {
  menu: "Manage Field",
  name: "Field Name",
  boundary: "Edit Boundary",
  crop: "Change Crop",
  variety: "Select Variety",
  planting: "Planting Date",
};

export default function ManageField({
  cropzone,
  unit,
  unitM2,
  onClose,
  onChanged,
  onRenewed,
}) {
  const fieldId = cropzone.field?.id;

  const [view, setView] = useState("menu");
  const [name, setName] = useState(cropzone.field?.name || cropzone.name || "");
  const [points, setPoints] = useState(
    () => (cropzone.location?.boundary?.coordinates?.[0] || []).slice(0, -1)
  );
  const [crops, setCrops] = useState(null);
  const [cropSearch, setCropSearch] = useState("");
  const [species, setSpecies] = useState(null);
  const [plantingDate, setPlantingDate] = useState(
    () => cropzone.planting_date?.slice(0, 10) || ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRenew, setConfirmRenew] = useState(false);

  useEffect(() => {
    if (view !== "crop" || crops) return;
    fetch("/api/agroapi/crops")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCrops)
      .catch(() => setCrops([]));
  }, [view, crops]);

  const areaUnits = useMemo(
    () => (points.length >= 3 ? (polygonAreaM2(points) / unitM2).toFixed(2) : null),
    [points, unitM2]
  );

  const matches = useMemo(() => {
    if (!crops) return [];
    const q = cropSearch.trim().toLowerCase();
    if (!q) return crops.slice(0, 12);
    return crops.filter((c) => c.species.toLowerCase().includes(q)).slice(0, 30);
  }, [crops, cropSearch]);

  async function patch(body, label) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/my/fields/${fieldId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok || data.failed?.length) {
      setError(data.error || `Could not save the ${label}.`);
      return false;
    }
    onChanged();
    setView("menu");
    return true;
  }

  async function renew() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/my/fields/${fieldId}/renew`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setConfirmRenew(false);
    if (!res.ok) {
      setError(data.error || "Could not start a new season.");
      return;
    }
    // Renewing creates a *different* cropzone, and the old one is now archived
    // and no longer owned — so the screen has to move to the new one rather
    // than reloading a record the farmer no longer has access to.
    onRenewed(data.cropzoneId);
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button
          className="ov-back"
          onClick={() => (view === "menu" ? onClose() : setView("menu"))}
          aria-label="Back"
        >
          ←
        </button>
        <span className="ov-title">{VIEWS[view]}</span>
      </div>

      <div className="ov-body">
        {view === "menu" && (
          <>
            <button className="choice-card" onClick={() => setView("name")}>
              <div className="icon">✏️</div>
              <div className="txt">
                <b>Field name</b>
                <span>{name}</span>
              </div>
            </button>

            <button className="choice-card" onClick={() => setView("boundary")}>
              <div className="icon">🗺️</div>
              <div className="txt">
                <b>Field boundary</b>
                <span>
                  {areaUnits ?? "—"} {unit} · {points.length} points
                </span>
              </div>
            </button>

            <button className="choice-card" onClick={() => setView("crop")}>
              <div className="icon">🌱</div>
              <div className="txt">
                <b>Crop &amp; variety</b>
                <span>{cropLabel(cropzone.crop)}</span>
              </div>
            </button>

            <button className="choice-card" onClick={() => setView("planting")}>
              <div className="icon">📅</div>
              <div className="txt">
                <b>Planting date</b>
                <span>
                  {cropzone.planting_date
                    ? new Date(cropzone.planting_date).toLocaleDateString()
                    : "Not set"}
                </span>
              </div>
            </button>

            <div className="mt-2">
              <div className="field-label">New season</div>
              <div className="fieldset-note mb-2">
                Starting a new season archives this crop and opens a fresh one on
                the same field. The old season stays in the field&apos;s history —
                its records aren&apos;t lost, they just stop being the current crop.
              </div>
              <button
                className="btn btn-outline w-full"
                onClick={() => setConfirmRenew(true)}
                disabled={!cropzone.planting_date}
              >
                Renew crop — start a new season
              </button>
              {!cropzone.planting_date && (
                <p className="mt-1 text-[11px] text-[var(--text-tert)]">
                  Nothing planted yet, so there&apos;s no season to renew.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </>
        )}

        {view === "name" && (
          <div>
            <div className="field-label">Field name</div>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {view === "boundary" && (
          <>
            <div className="fieldset-note text-center">
              Drag a point to move it, or tap the map to add one.
            </div>
            <DrawMap
              points={points}
              center={
                points.length
                  ? [points[0][1], points[0][0]]
                  : undefined
              }
              onAdd={(p) => setPoints((prev) => [...prev, p])}
              onMove={(i, p) =>
                setPoints((prev) => prev.map((old, idx) => (idx === i ? p : old)))
              }
            />
            <div className="flex items-center gap-2">
              <button
                className="pill"
                onClick={() => setPoints((p) => p.slice(0, -1))}
                disabled={!points.length}
              >
                ↺ Undo
              </button>
              {areaUnits && (
                <span className="ml-auto text-sm font-bold">
                  {areaUnits} {unit}
                </span>
              )}
            </div>
            {/* Version 2 §15.5: correcting a field's shape must never change the
                numbers on a report that was already approved and billed. */}
            <p className="text-[11px] text-[var(--text-tert)]">
              Changing the boundary updates this field from now on. Work reports
              already approved keep the shape and area they were billed from.
            </p>
          </>
        )}

        {view === "crop" && (
          <>
            <input
              className="field"
              value={cropSearch}
              onChange={(e) => setCropSearch(e.target.value)}
              placeholder="Search crops — rice, maize, cassava…"
            />
            {!crops && <p className="empty-msg">Loading crops…</p>}
            {matches.map((c) => (
              <button
                key={c.species}
                className="choice-card"
                onClick={() => {
                  setSpecies(c);
                  setView("variety");
                }}
              >
                <div className="txt">
                  <b>{c.species}</b>
                  <span>{c.varieties.length} varieties</span>
                </div>
              </button>
            ))}
          </>
        )}

        {view === "planting" && (
          <div>
            <div className="field-label">Planting date</div>
            <input
              className="field"
              type="date"
              value={plantingDate}
              onChange={(e) => setPlantingDate(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-[11px] text-[var(--text-tert)]">
              Optional — AgroAPI can only predict a maturity date once this is
              set.
            </p>
          </div>
        )}

        {view === "variety" && species && (
          <>
            <div className="fieldset-note">{species.species}</div>
            {species.varieties.map((v) => (
              <button
                key={v.id}
                className="choice-card"
                disabled={busy}
                onClick={() => patch({ cropId: v.id }, "crop")}
              >
                <div className="txt">
                  <b>{v.variety}</b>
                  {v.variety === "generic" && (
                    <span>No specific variety — no maturity prediction</span>
                  )}
                </div>
              </button>
            ))}
          </>
        )}

        {error && view !== "menu" && (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        )}
      </div>

      <div className="ov-footer">
        {view === "menu" && (
          <button className="btn btn-outline" onClick={onClose}>
            Done
          </button>
        )}
        {view === "name" && (
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => patch({ name }, "name")}
          >
            {busy ? "Saving…" : "Save name"}
          </button>
        )}
        {view === "boundary" && (
          <button
            className="btn btn-primary"
            disabled={busy || points.length < 3}
            onClick={() => patch({ boundary: [[...points, points[0]]] }, "boundary")}
          >
            {busy ? "Saving…" : "Save boundary"}
          </button>
        )}
        {view === "planting" && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => patch({ plantingDate: plantingDate || null }, "planting date")}
          >
            {busy ? "Saving…" : "Save planting date"}
          </button>
        )}
      </div>

      {confirmRenew && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5">
            <p className="mb-1 font-bold">Start a new season?</p>
            <p className="mb-4 text-xs text-[var(--text-sec)]">
              {cropLabel(cropzone.crop)} will be archived and a new crop opened on
              this field. You&apos;ll set the new planting date and variety
              afterwards.
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-outline flex-1"
                onClick={() => setConfirmRenew(false)}
              >
                Cancel
              </button>
              <button className="btn btn-go flex-1" disabled={busy} onClick={renew}>
                {busy ? "Working…" : "Renew"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
