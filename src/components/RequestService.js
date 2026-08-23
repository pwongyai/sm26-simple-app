"use client";

import { useEffect, useRef, useState } from "react";
import { createOrder } from "@/lib/store";
import { boundaryCentre } from "@/lib/engine";
import FieldThumb from "@/components/FieldThumb";

// Request Contractor — five steps, in order:
//   Field → Contractor → Service → Preferred Date → Review.
//
// Contractor comes BEFORE service on purpose, and this ordering is load-
// bearing rather than cosmetic: each contractor keeps their own price list, so
// "Harvesting ฿700" has no meaning until you know whose list it came from.
// Picking the contractor first is what makes the service step answerable.
//
// The step is shown even when an organization has only one contractor
// (2026-08-23, explicit product decision): it makes visible that the system
// supports several, rather than hiding a capability until it is used. The
// single contractor arrives pre-selected, so it stays one tap.
//
// The date step shows weather purely as information — no "best day", no
// recommendation, ever.

const STEP_TITLES = {
  field: "Choose Field",
  contractor: "Choose Contractor",
  service: "Choose Service",
  date: "Preferred Date",
  review: "Review Request",
};

function fmtDayMonth(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function RequestService({
  fields,
  services,
  unit,
  // Launched from a field's own page, the field is already decided — so the
  // flow opens at Choose Contractor and Back returns to that field rather than
  // asking which field the farmer meant (version 3's `prefillFieldId`).
  presetFieldId = null,
  onClose,
  onSent,
}) {
  // Real forecast for the chosen field — fetched once a field is picked, since
  // weather is a property of the land, not of the app.
  const [forecast, setForecast] = useState([]);
  const [step, setStep] = useState(presetFieldId ? "contractor" : "field");
  const [fieldId, setFieldId] = useState(presetFieldId);
  const [contractors, setContractors] = useState([]);
  const [contractor, setContractor] = useState(null);
  // Services belong to the chosen contractor, so they are fetched per choice
  // rather than taken from the `services` prop (which is the organization's
  // default contractor's list — right for the common case, wrong the moment
  // the farmer picks someone else).
  const [contractorServices, setContractorServices] = useState(null);
  const [service, setService] = useState(null);
  const [date, setDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const customDateRef = useRef(null);

  const field = fields.find((f) => (f.cropzoneId || f.fieldId) === fieldId);
  const shownServices = contractorServices ?? services;

  // Who this organization works with. Pre-select the default so a single
  // contractor is one tap, not a decision.
  useEffect(() => {
    fetch("/api/my/contractors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setContractors(arr);
        setContractor((cur) => cur ?? arr.find((c) => c.isDefault) ?? arr[0] ?? null);
      })
      .catch(() => setContractors([]));
  }, []);

  async function chooseContractor(c) {
    setContractor(c);
    // A different contractor means a different price list — and a service
    // picked from the previous one would no longer exist.
    setService(null);
    setContractorServices(null);
    setStep("service");
    try {
      const res = await fetch(
        `/api/services?contractorOrgId=${encodeURIComponent(c.id)}`
      );
      setContractorServices(res.ok ? await res.json() : []);
    } catch {
      setContractorServices([]);
    }
  }

  useEffect(() => {
    if (!field?.fieldId) return;
    fetch(`/api/agroapi/fields/${field.fieldId}/forecast`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setForecast(Array.isArray(d) ? d : []))
      .catch(() => setForecast([]));
  }, [field]);
  const suggested = (forecast || []).map((d) => d.date);
  const isCustom = !!date && !suggested.includes(date);

  async function send() {
    setBusy(true);
    // The field's centre, so Today's Work can route by distance from the
    // contractor's home base. Without it the order is created "unmapped" and
    // shown separately rather than mis-ordered.
    const centre = boundaryCentre(field.boundary);
    await createOrder({
      fieldId: field.fieldId,
      cropzoneId: field.cropzoneId,
      fieldName: field.name,
      contractorOrgId: contractor?.id || null,
      activityTypeName: service.name,
      scheduledDate: date,
      cropSizeRai: field.areaUnits,
      lat: centre ? centre[1] : null,
      lng: centre ? centre[0] : null,
    });
    setBusy(false);
    onSent();
    onClose();
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button
          className="ov-back"
          onClick={() => {
            const order = ["field", "contractor", "service", "date", "review"];
            const i = order.indexOf(step);
            // Don't walk back into a step that was decided for us.
            const first = presetFieldId ? 1 : 0;
            if (i <= first) onClose();
            else setStep(order[i - 1]);
          }}
          aria-label="Back"
        >
          ←
        </button>
        <span className="ov-title">{STEP_TITLES[step]}</span>
      </div>

      <div className="ov-body">
        {step === "field" &&
          fields.map((f) => (
            <button
              key={f.fieldId}
              className="choice-card"
              onClick={() => {
                setFieldId(f.cropzoneId || f.fieldId);
                setStep("contractor");
              }}
            >
              <FieldThumb boundary={f.boundary} size={34} />
              <div className="txt">
                <b>{f.name}</b>
                <span>
                  {f.areaUnits ?? "—"} {unit}
                  {f.crop ? ` · ${f.crop}` : " · no crop yet"}
                </span>
              </div>
            </button>
          ))}

        {step === "field" && fields.length === 0 && (
          <p className="empty-msg">No fields registered to you yet.</p>
        )}

        {step === "contractor" && (
          <>
            <div className="fieldset-note">
              Who should do this work? These are the contractors your community
              works with.
            </div>
            {contractors.length === 0 && (
              <p className="empty-msg">
                No contractor is set up for your community yet.
              </p>
            )}
            {contractors.map((c) => (
              <button
                key={c.id}
                className={`choice-card ${contractor?.id === c.id ? "selected" : ""}`}
                onClick={() => chooseContractor(c)}
              >
                <div className="icon">🚜</div>
                <div className="txt">
                  <b>{c.name}</b>
                  <span>
                    {[c.ownerName, c.phone].filter(Boolean).join(" · ") ||
                      (c.isDefault ? "Your community's contractor" : "Contractor")}
                  </span>
                </div>
                {contractor?.id === c.id && <span className="ml-auto font-bold">✓</span>}
              </button>
            ))}
          </>
        )}

        {/* No prices here. The farmer is choosing what work they want; what it
            costs depends on the area the machine actually covers, which nobody
            knows yet — and a service the contractor hasn't priced would show as
            "price not set", which tells a farmer nothing useful. */}
        {step === "service" && contractorServices === null && contractor && (
          <p className="text-sm text-[var(--text-sec)]">Loading services…</p>
        )}
        {step === "service" &&
          !(contractorServices === null && contractor) &&
          (shownServices.length ? (
            shownServices.map((s) => (
              <button
                key={s.id}
                className={`choice-card ${service?.id === s.id ? "selected" : ""}`}
                onClick={() => {
                  setService(s);
                  setStep("date");
                }}
              >
                <div className="txt">
                  <b>{s.name}</b>
                </div>
              </button>
            ))
          ) : (
            <p className="empty-msg">
              The contractor hasn&apos;t listed any services yet.
            </p>
          ))}

        {step === "date" && (
          <>
            <div className="fieldset-note">
              When would you like the contractor to come? The weather is shown
              for information only.
            </div>
            {forecast.length === 0 && (
              <p className="text-xs text-[var(--text-tert)]">
                No forecast for this field — pick any date below.
              </p>
            )}
            {(forecast || []).map((d) => {
              const dateStr = d.date;
              const selected = !isCustom && date === dateStr;
              return (
                <button
                  key={dateStr}
                  className={`choice-card ${selected ? "selected" : ""}`}
                  onClick={() => setDate(dateStr)}
                >
                  <div className="txt">
                    <b>{fmtDayMonth(dateStr)}</b>
                    <span>
                      {d.phrase} · {Math.round(d.tempMin)}–{Math.round(d.tempMax)}°
                      {d.tempUnit} · Rain {d.rainProb}%
                    </span>
                  </div>
                  {selected && <span className="ml-auto font-bold">✓</span>}
                </button>
              );
            })}

            {/* The native picker only appears when asked for — no permanently
                visible date box. Any future date is allowed, not just the
                forecast window; a date beyond it simply shows no weather. */}
            <button
              className={`choice-card ${isCustom ? "selected" : ""}`}
              onClick={() => {
                const el = customDateRef.current;
                if (el?.showPicker) {
                  try {
                    el.showPicker();
                    return;
                  } catch {}
                }
                el?.click();
              }}
            >
              <div className="txt">
                <b>
                  {isCustom
                    ? `✓ ${new Date(`${date}T00:00:00`).toLocaleDateString()}`
                    : "📅 Choose another date"}
                </b>
                {!isCustom && <span>Not one of the days above? Pick any date.</span>}
              </div>
            </button>
            <input
              ref={customDateRef}
              type="date"
              className="pointer-events-none absolute h-px w-px opacity-0"
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </>
        )}

        {step === "review" && (
          <div className="detail-card">
            <div className="detail-row">
              <div className="lbl">Field</div>
              <div className="val">{field?.name}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Area</div>
              <div className="val">
                {field?.areaUnits ?? "—"} {unit}
              </div>
            </div>
            <div className="detail-row">
              <div className="lbl">Contractor</div>
              <div className="val">{contractor?.name ?? "—"}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Service</div>
              <div className="val">{service?.name}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Preferred Date</div>
              <div className="val">
                {date && new Date(`${date}T00:00:00`).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ov-footer">
        {step === "date" && (
          <button
            className="btn btn-primary"
            disabled={!date}
            style={!date ? { opacity: 0.5 } : undefined}
            onClick={() => setStep("review")}
          >
            Next
          </button>
        )}
        {step === "review" && (
          <button
            className="btn btn-go"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? "Sending…" : "Send Request"}
          </button>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5">
            <p className="mb-1 font-bold">Send this request?</p>
            <p className="mb-4 text-xs text-[var(--text-sec)]">
              {service?.name} on {field?.name}. The contractor will confirm the
              date with you.
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-outline flex-1"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button className="btn btn-go flex-1" disabled={busy} onClick={send}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
