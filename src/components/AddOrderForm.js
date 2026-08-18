"use client";

import { useEffect, useState } from "react";
import { createOrder } from "@/lib/store";
import Map from "@/components/Map";

// Add Work Order — version 3's flow, kept step for step.
//
// The shape matters: the customer comes FIRST and nothing else appears until
// one is chosen, because a contractor writing a job down is thinking "พี่แมว
// called" before they're thinking about dates. Search finds an existing
// customer or offers to create one from whatever was typed; the rest of the
// form only then unfolds. Location is three options and never blocks saving.
export default function AddOrderForm({ services, onClose, onCreated }) {
  // 'search' → 'selected' | 'new'
  const [step, setStep] = useState("search");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [cropSize, setCropSize] = useState("");
  const [workType, setWorkType] = useState("");
  const [scheduled, setScheduled] = useState(() =>
    new Date().toLocaleDateString("en-CA")
  );

  const [locationType, setLocationType] = useState(null);
  const [pin, setPin] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/farmers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCustomers)
      .catch(() => {});
  }, []);

  const q = query.trim().toLowerCase();
  const hits = q
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
        )
        .slice(0, 5)
    : [];

  async function save() {
    if (step === "search") {
      setError("Search and select, or add, a customer first");
      return;
    }
    setBusy(true);
    setError("");

    try {
      let farmerId = chosen?.id;
      if (!farmerId) {
        const res = await fetch("/api/farmers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, phone: newPhone }),
        });
        if (!res.ok) throw new Error();
        farmerId = (await res.json()).id;
      }

      // Work type here is one of the contractor's own services. The AgroAPI
      // activity type is resolved later, from the service, when the finished
      // work is recorded — so only the label is stored now.
      const service = services?.find((s) => s.id === workType);
      await createOrder({
        farmerId,
        activityTypeName: service?.name || null,
        scheduledDate: scheduled || null,
        cropSizeRai: cropSize === "" ? null : Number(cropSize),
        lat: locationType === "pin" && pin ? pin.lat : null,
        lng: locationType === "pin" && pin ? pin.lng : null,
      });

      onCreated();
      onClose();
    } catch {
      setError("Could not save this job.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span className="ov-title">Add Work Order</span>
      </div>

      <div className="ov-body">
        {/* ---- Customer: search first, everything else waits ---- */}
        {step === "search" && (
          <>
            <div>
              <div className="field-label">Search customer name or phone</div>
              {/* The input is never re-created while typing — only the results
                  below it re-render. v3 hit a real bug where rebuilding the
                  whole form on each keystroke dropped focus after one letter. */}
              <input
                className="field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing…"
                autoFocus
              />
            </div>

            {q && (
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-2">
                  {hits.map((c) => (
                    <button
                      key={c.id}
                      className="existing-hit"
                      onClick={() => {
                        setChosen(c);
                        setStep("selected");
                      }}
                    >
                      <b>{c.name}</b>
                      <span>{c.phone || "No phone"}</span>
                    </button>
                  ))}
                </div>
                <div className="text-center text-[11px] text-[var(--text-tert)]">
                  OR
                </div>
                <button
                  className="fieldset-note w-full text-center"
                  style={{ border: "1.5px dashed var(--rule)" }}
                  onClick={() => {
                    setNewName(query);
                    setNewPhone("");
                    setChosen(null);
                    setStep("new");
                  }}
                >
                  No match found? Add &quot;{query}&quot; as a new customer.
                </button>
              </div>
            )}
          </>
        )}

        {step === "selected" && (
          <>
            <div className="flex items-center justify-between">
              <div className="field-label mb-0">Customer</div>
              <button
                className="text-xs font-bold"
                onClick={() => {
                  setStep("search");
                  setQuery("");
                  setChosen(null);
                }}
              >
                Change
              </button>
            </div>
            <div className="choice-card selected" style={{ cursor: "default" }}>
              <div className="icon">👤</div>
              <div className="txt">
                <b>{chosen.name}</b>
                <span>{chosen.phone || "No phone on file"}</span>
              </div>
            </div>
          </>
        )}

        {step === "new" && (
          <>
            <div className="flex items-center justify-between">
              <div className="field-label mb-0">New customer details</div>
              <button
                className="text-xs font-bold"
                onClick={() => {
                  setStep("search");
                  setQuery("");
                }}
              >
                Change
              </button>
            </div>
            <input
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full name"
            />
            <input
              className="field"
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone number"
            />
          </>
        )}

        {/* ---- The rest of the job, once there's a customer ---- */}
        {step !== "search" && (
          <>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <div className="field-label">Crop size (rai)</div>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  value={cropSize}
                  onChange={(e) => setCropSize(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <div className="field-label">Work type</div>
                <select
                  className="field"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {services?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="field-label">Scheduled work date</div>
              <input
                className="field"
                type="date"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">
                Field location — optional, never blocks saving
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className={`choice-card ${locationType === "field" ? "selected" : ""}`}
                  onClick={() => setLocationType("field")}
                >
                  <div className="icon">🗺️</div>
                  <div className="txt">
                    <b>Existing field</b>
                    <span>Pick by shape, not name</span>
                  </div>
                </button>

                {locationType === "field" && (
                  <div className="fieldset-note ml-2">
                    Field shapes come from the report the machine produces — none
                    are mapped to this customer yet.
                  </div>
                )}

                <button
                  className={`choice-card ${locationType === "pin" ? "selected" : ""}`}
                  onClick={() => setLocationType("pin")}
                >
                  <div className="icon">📍</div>
                  <div className="txt">
                    <b>Map pin</b>
                    <span>Tap the map to drop a pin</span>
                  </div>
                </button>

                {locationType === "pin" && (
                  <div>
                    <Map pin={pin} onPick={setPin} height={200} />
                    <p className="mt-1 text-[11px] text-[var(--text-tert)]">
                      {pin
                        ? `Pin at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} — tap again to move it.`
                        : "Tap the map to drop a pin."}
                    </p>
                  </div>
                )}

                <button
                  className={`choice-card ${locationType === "unknown" ? "selected" : ""}`}
                  onClick={() => setLocationType("unknown")}
                >
                  <div className="icon">❔</div>
                  <div className="txt">
                    <b>Unknown</b>
                    <span>Not known yet — fine to skip</span>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      <div className="ov-footer">
        <button className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
