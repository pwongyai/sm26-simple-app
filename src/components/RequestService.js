"use client";

import { useEffect, useRef, useState } from "react";
import { createOrder } from "@/lib/store";
import FieldThumb from "@/components/FieldThumb";

// Request Contractor — version 3's four steps, in order:
//   Field → Service → Preferred Date → Review.
//
// The contractor step is skipped while a community has exactly one contractor,
// exactly as v3 does: it auto-assigns rather than asking a question with one
// answer. The date step shows weather purely as information — no "best day",
// no recommendation, ever.

const STEP_TITLES = {
  field: "Choose Field",
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
  // flow opens at Choose Service and Back returns to that field rather than
  // asking which field the farmer meant (version 3's `prefillFieldId`).
  presetFieldId = null,
  onClose,
  onSent,
}) {
  // Real forecast for the chosen field — fetched once a field is picked, since
  // weather is a property of the land, not of the app.
  const [forecast, setForecast] = useState([]);
  const [step, setStep] = useState(presetFieldId ? "service" : "field");
  const [fieldId, setFieldId] = useState(presetFieldId);
  const [service, setService] = useState(null);
  const [date, setDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const customDateRef = useRef(null);

  const field = fields.find((f) => (f.cropzoneId || f.fieldId) === fieldId);

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
    await createOrder({
      fieldId: field.fieldId,
      cropzoneId: field.cropzoneId,
      fieldName: field.name,
      activityTypeName: service.name,
      scheduledDate: date,
      cropSizeRai: field.areaUnits,
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
            const order = ["field", "service", "date", "review"];
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
                setStep("service");
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

        {/* No prices here. The farmer is choosing what work they want; what it
            costs depends on the area the machine actually covers, which nobody
            knows yet — and a service the contractor hasn't priced would show as
            "price not set", which tells a farmer nothing useful. */}
        {step === "service" &&
          (services.length ? (
            services.map((s) => (
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
