"use client";

import { areaIn, areaOut } from "@/lib/units";
import { useUnits } from "@/lib/useUnits";
import { useEffect, useState } from "react";
import { createOrder } from "@/lib/store";
import Map from "@/components/Map";
import FieldThumb from "@/components/FieldThumb";
import { useT } from "@/lib/i18n";

// Add Work Order — version 3's flow, kept step for step.
//
// The shape matters: the customer comes FIRST and nothing else appears until
// one is chosen, because a contractor writing a job down is thinking "พี่แมว
// called" before they're thinking about dates. Search finds an existing
// customer or offers to create one from whatever was typed; the rest of the
// form only then unfolds. Location is three options and never blocks saving.
export default function AddOrderForm({ services, onClose, onCreated }) {
  const t = useT();
  const { areaUnit, areaUnitM2 } = useUnits();
  // 'search' → 'selected' | 'new'
  const [step, setStep] = useState("search");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [cropSize, setCropSize] = useState("");
  const [note, setNote] = useState("");
  const [workType, setWorkType] = useState("");
  const [scheduled, setScheduled] = useState(() =>
    new Date().toLocaleDateString("en-CA")
  );

  const [locationType, setLocationType] = useState(null);
  const [pin, setPin] = useState(null);

  // "Existing field" — this customer's own registered plots, picked by shape.
  const [customerFields, setCustomerFields] = useState(null); // null = not loaded
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [chosenField, setChosenField] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/farmers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCustomers)
      .catch(() => {});
  }, []);

  // Loaded when the contractor actually asks for it, not on every booking —
  // each field costs one AgroAPI call to hydrate, and most jobs are written
  // down without ever opening this. A brand-new customer has nothing to load.
  useEffect(() => {
    setChosenField(null);
    if (locationType !== "field" || !chosen?.id) return;
    setFieldsBusy(true);
    fetch(`/api/farmers/${chosen.id}/fields`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCustomerFields)
      .catch(() => setCustomerFields([]))
      .finally(() => setFieldsBusy(false));
  }, [locationType, chosen?.id]);

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
      setError(t("Search and select, or add, a customer first"));
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
      const field = locationType === "field" ? chosenField : null;
      await createOrder({
        farmerId,
        activityTypeName: service?.name || null,
        scheduledDate: scheduled || null,
        // A typed size always wins — the contractor may be booking part of a
        // plot. Left blank, the field's own measured area is a better answer
        // than nothing, and it is what the job card will show.
        cropSizeM2:
          cropSize === "" ? field?.areaM2 ?? null : areaIn(cropSize, areaUnitM2),
        note: note.trim() || null,
        lat: locationType === "pin" && pin ? pin.lat : null,
        lng: locationType === "pin" && pin ? pin.lng : null,
        // The whole point of picking an existing field: the order now says
        // WHICH plot. Until this existed, every order a contractor wrote had
        // a null field_id, so the work could only be tied to land afterwards,
        // by drawing a new boundary — which is how one plot ends up with two
        // field records and two reports for the same work (2026-10-10).
        fieldId: field?.fieldId || null,
        cropzoneId: field?.cropzoneId || null,
        fieldName: field?.name || null,
      });

      onCreated();
      onClose();
    } catch {
      setError(t("Could not save this job."));
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label={t("Back")}>
          ←
        </button>
        <span className="ov-title">{t("Add Work Order")}</span>
      </div>

      <div className="ov-body">
        {/* ---- Customer: search first, everything else waits ---- */}
        {step === "search" && (
          <>
            <div>
              <div className="field-label">{t("Search customer name or phone")}</div>
              {/* The input is never re-created while typing — only the results
                  below it re-render. v3 hit a real bug where rebuilding the
                  whole form on each keystroke dropped focus after one letter. */}
              <input
                className="field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Start typing…")}
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
                      <span>{c.phone || t("No phone")}</span>
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
              <div className="field-label mb-0">{t("Customer")}</div>
              <button
                className="text-xs font-bold"
                onClick={() => {
                  setStep("search");
                  setQuery("");
                  setChosen(null);
                }}
              >{t("Change")}</button>
            </div>
            <div className="choice-card selected" style={{ cursor: "default" }}>
              <div className="icon">👤</div>
              <div className="txt">
                <b>{chosen.name}</b>
                <span>{chosen.phone || t("No phone on file")}</span>
              </div>
            </div>
          </>
        )}

        {step === "new" && (
          <>
            <div className="flex items-center justify-between">
              <div className="field-label mb-0">{t("New customer details")}</div>
              <button
                className="text-xs font-bold"
                onClick={() => {
                  setStep("search");
                  setQuery("");
                }}
              >{t("Change")}</button>
            </div>
            <input
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("Full name")}
            />
            <input
              className="field"
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder={t("Phone number")}
            />
          </>
        )}

        {/* ---- The rest of the job, once there's a customer ---- */}
        {step !== "search" && (
          <>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <div className="field-label">Crop size ({areaUnit})</div>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  value={cropSize}
                  onChange={(e) => setCropSize(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <div className="field-label">{t("Work type")}</div>
                <select
                  className="field"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                >
                  <option value="">{t("Choose…")}</option>
                  {services?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Free text — the one thing a form cannot anticipate. What a paper
                notebook carries and no structured column does: "call before
                coming", "gate locked, use the north track", "moved because the
                field was too wet". Optional by design. */}
            <div>
              <div className="field-label">{t("Note (optional)")}</div>
              {/* No placeholder. "Anything the driver should know" named one
                  use and, by naming it, ruled out the others: a work order is
                  a request to come and work, not an instruction tied to one
                  plot, and what gets written here during planning is whatever
                  the contractor needs to remember. An empty box asks nothing
                  and accepts all of it (2026-10-10). */}
              <input
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">{t("Scheduled work date")}</div>
              <input
                className="field"
                type="date"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">{t("Field location — optional, never blocks saving")}</div>
              <div className="flex flex-col gap-2">
                <button
                  className={`choice-card ${locationType === "field" ? "selected" : ""}`}
                  onClick={() => setLocationType("field")}
                >
                  <div className="icon">🗺️</div>
                  <div className="txt">
                    <b>{t("Existing field")}</b>
                    <span>{t("Pick by shape, not name")}</span>
                  </div>
                </button>

                {/* The customer's own registered plots, drawn as outlines —
                    the same screen the farmer already has in Request Service,
                    for the contractor booking on their behalf. "Pick by shape,
                    not name" was the promise here from the start; until today
                    this branch rendered one hardcoded sentence saying no field
                    was mapped, which was simply untrue, and left every
                    contractor-written order with no field at all. */}
                {locationType === "field" && fieldsBusy && (
                  <div className="fieldset-note ml-2">{t("Loading…")}</div>
                )}

                {locationType === "field" && !fieldsBusy && (
                  <div className="ml-2 flex flex-col gap-2">
                    {(customerFields || []).map((f) => (
                      <button
                        key={f.fieldId}
                        className={`choice-card ${
                          chosenField?.fieldId === f.fieldId ? "selected" : ""
                        }`}
                        onClick={() =>
                          setChosenField(
                            chosenField?.fieldId === f.fieldId ? null : f
                          )
                        }
                      >
                        <FieldThumb boundary={f.boundary} size={34} />
                        <div className="txt">
                          <b>{f.name}</b>
                          <span>
                            {f.areaM2 != null
                              ? `${areaOut(f.areaM2, areaUnitM2)} ${areaUnit}`
                              : "—"}
                            {f.crop ? ` · ${f.crop}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}

                    {/* A real answer, not the old blanket claim: a field joins
                        this list when it is registered to this customer —
                        through their own app, or the first report a machine
                        produces on it. */}
                    {(!chosen || customerFields?.length === 0) && (
                      <div className="fieldset-note">
                        {t("No field is registered to this customer yet.")}
                      </div>
                    )}
                  </div>
                )}

                <button
                  className={`choice-card ${locationType === "pin" ? "selected" : ""}`}
                  onClick={() => setLocationType("pin")}
                >
                  <div className="icon">📍</div>
                  <div className="txt">
                    <b>{t("Map pin")}</b>
                    <span>{t("Tap the map to drop a pin")}</span>
                  </div>
                </button>

                {locationType === "pin" && (
                  <div>
                    <Map pin={pin} onPick={setPin} height={200} />
                    <p className="mt-1 text-[11px] text-[var(--text-tert)]">
                      {pin
                        ? `Pin at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} — tap again to move it.`
                        : t("Tap the map to drop a pin.")}
                    </p>
                  </div>
                )}

                <button
                  className={`choice-card ${locationType === "unknown" ? "selected" : ""}`}
                  onClick={() => setLocationType("unknown")}
                >
                  <div className="icon">❔</div>
                  <div className="txt">
                    <b>{t("Unknown")}</b>
                    <span>{t("Not known yet — fine to skip")}</span>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      <div className="ov-footer">
        <button className="btn btn-outline" onClick={onClose}>{t("Cancel")}</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? t("Saving…") : t("Save")}
        </button>
      </div>
    </div>
  );
}
