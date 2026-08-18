"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { polygonAreaM2 } from "@/lib/engine";

// Leaflet needs the browser.
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

// Add Field — version 3's flow (§7.5, §11.14): draw the boundary on the map,
// name it, then say what's growing.
//
// The crop and variety steps are new here. Version 3 created a field with a
// name only and left crop for a separate Add Planting flow, but AgroAPI's crop
// engine won't predict a maturity date until a real *variety* is set — so
// asking at creation is what makes the field useful immediately. "I don't know"
// stays a first-class answer at every step, exactly as v3 has it.
const STEPS = {
  draw: "Draw Field Boundary",
  name: "Name Your Field",
  crop: "What are you growing?",
  variety: "Select Variety",
  date: "Planting Date",
};

export default function AddFieldFlow({ unit, unitM2, onClose, onCreated }) {
  const [step, setStep] = useState("draw");
  const [points, setPoints] = useState([]);
  const [name, setName] = useState("");
  const [crops, setCrops] = useState(null);
  const [cropSearch, setCropSearch] = useState("");
  const [species, setSpecies] = useState(null);
  const [variety, setVariety] = useState(null);
  const [plantingDate, setPlantingDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/agroapi/crops")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCrops)
      .catch(() => setCrops([]));
  }, []);

  const areaUnits = useMemo(() => {
    if (points.length < 3) return null;
    return (polygonAreaM2(points) / unitM2).toFixed(2);
  }, [points, unitM2]);

  const matches = useMemo(() => {
    if (!crops) return [];
    const q = cropSearch.trim().toLowerCase();
    if (!q) return crops.slice(0, 12);
    return crops.filter((c) => c.species.toLowerCase().includes(q)).slice(0, 30);
  }, [crops, cropSearch]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      // GeoJSON rings must close — repeat the first point as the last.
      const ring = [...points, points[0]];
      const res = await fetch("/api/my/fields/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          boundary: [ring],
          cropId: variety?.id || null,
          plantingDate: plantingDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the field.");
        setBusy(false);
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Could not create the field.");
      setBusy(false);
    }
  }

  function back() {
    const order = ["draw", "name", "crop", "variety", "date"];
    const i = order.indexOf(step);
    if (i <= 0) onClose();
    else setStep(order[i - 1]);
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={back} aria-label="Back">
          ←
        </button>
        <span className="ov-title">{STEPS[step]}</span>
      </div>

      <div className="ov-body">
        {step === "draw" && (
          <>
            <div className="fieldset-note text-center">
              {points.length === 0
                ? "Move the map to find your field, then tap around its edge."
                : "Keep tapping to add points. Drag a point to adjust it."}
            </div>

            <DrawMap
              points={points}
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
              <button className="pill" onClick={() => setPoints([])} disabled={!points.length}>
                Clear
              </button>
              {areaUnits && (
                <span className="ml-auto text-sm font-bold">
                  {areaUnits} {unit}
                </span>
              )}
            </div>
          </>
        )}

        {step === "name" && (
          <>
            <div className="detail-card">
              <div className="detail-row">
                <div className="lbl">Field size</div>
                <div className="val">
                  {areaUnits} {unit}
                </div>
              </div>
              <div className="detail-row">
                <div className="lbl">Boundary points</div>
                <div className="val">{points.length}</div>
              </div>
            </div>
            <div>
              <div className="field-label">Field name *</div>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. North Field"
                autoFocus
              />
            </div>
          </>
        )}

        {step === "crop" && (
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
                className={`choice-card ${species?.species === c.species ? "selected" : ""}`}
                onClick={() => {
                  setSpecies(c);
                  setVariety(null);
                  setStep("variety");
                }}
              >
                <div className="txt">
                  <b>{c.species}</b>
                  <span>
                    {c.varieties.length} variet{c.varieties.length === 1 ? "y" : "ies"}
                  </span>
                </div>
              </button>
            ))}
            <button
              className="fieldset-note w-full text-center"
              style={{ border: "1.5px dashed var(--rule)" }}
              onClick={() => {
                setSpecies(null);
                setVariety(null);
                setStep("date");
              }}
            >
              I don&apos;t know yet — add the crop later
            </button>
          </>
        )}

        {step === "variety" && species && (
          <>
            <div className="fieldset-note">{species.species}</div>
            {species.varieties.map((v) => (
              <button
                key={v.id}
                className={`choice-card ${variety?.id === v.id ? "selected" : ""}`}
                onClick={() => {
                  setVariety(v);
                  setStep("date");
                }}
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

        {step === "date" && (
          <>
            <div className="fieldset-note">When did you plant?</div>
            <input
              className="field text-center text-lg"
              type="date"
              value={plantingDate}
              onChange={(e) => setPlantingDate(e.target.value)}
            />
            <div className="detail-card">
              <div className="detail-row">
                <div className="lbl">Field</div>
                <div className="val">{name}</div>
              </div>
              <div className="detail-row">
                <div className="lbl">Size</div>
                <div className="val">
                  {areaUnits} {unit}
                </div>
              </div>
              <div className="detail-row">
                <div className="lbl">Crop</div>
                <div className="val">
                  {species
                    ? `${species.species}${variety && variety.variety !== "generic" ? ` — ${variety.variety}` : ""}`
                    : "Not recorded"}
                </div>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      <div className="ov-footer">
        {step === "draw" && (
          <button
            className="btn btn-primary"
            disabled={points.length < 3}
            style={points.length < 3 ? { opacity: 0.5 } : undefined}
            onClick={() => setStep("name")}
          >
            {points.length < 3 ? "Tap the map to start drawing" : "Confirm Boundary"}
          </button>
        )}
        {step === "name" && (
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            style={!name.trim() ? { opacity: 0.5 } : undefined}
            onClick={() => setStep("crop")}
          >
            Next
          </button>
        )}
        {step === "date" && (
          <>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => {
                setPlantingDate("");
                save();
              }}
            >
              I don&apos;t know yet
            </button>
            <button className="btn btn-go" disabled={busy} onClick={save}>
              {busy ? "Creating…" : "Save Field"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
