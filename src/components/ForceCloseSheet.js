"use client";

import { useMemo, useState } from "react";
import { useUnits } from "@/lib/useUnits";
import { areaIn, areaOut, priceOut, fmtMoney, roundMoney } from "@/lib/units";

// Closing a job the machine did not measure.
//
// Force Close used to set a status and stop. That made the contractor's totals
// a lie by omission: a season's billing that silently drops every job done
// without GPS is a technical number, not a total (2026-09-23). It now produces
// a real work report — the same document, through the same route, with the
// machine's part of it stated by the contractor instead of measured.
//
// What he confirms: how much was worked, when, and what it costs. The charge
// is computed from the service rate and the area so the common case is one
// tap, and it is editable because what was agreed is not always what the rate
// says.
//
// A job with a field produces the full package — report, ADAPT Work Record,
// AgroAPI activity. A notebook job that was never tied to a field produces the
// report alone; that is the whole difference, and it is decided by the data,
// not by anything on this screen.
export default function ForceCloseSheet({ order, services, onCancel, onDone }) {
  const { areaUnit, areaUnitM2, currency } = useUnits();

  // The service behind this job, for the rate. Matched on the work type the
  // order already carries, so the usual case needs no choosing.
  const matchingService = useMemo(
    () =>
      (services || []).find(
        (s) =>
          s.activity_type_id === order.activity_type_id ||
          s.name === order.activity_type_name
      ) || null,
    [services, order.activity_type_id, order.activity_type_name]
  );

  const [serviceId, setServiceId] = useState(matchingService?.id || "");
  const service = (services || []).find((s) => s.id === serviceId) || null;

  const [date, setDate] = useState(
    order.scheduled_date || order.booking_date || new Date().toISOString().slice(0, 10)
  );
  const [area, setArea] = useState(
    order.crop_size_m2 != null ? String(areaOut(order.crop_size_m2, areaUnitM2)) : ""
  );

  // Rate in the reader's currency per their unit, from THB/m².
  const rate = service?.price_per_m2_thb != null
    ? priceOut(service.price_per_m2_thb, areaUnitM2, currency)
    : null;

  const suggested =
    rate != null && area !== "" && Number.isFinite(Number(area))
      ? roundMoney(Number(area) * rate, currency)
      : null;

  // Held separately so a typed figure survives a change of area, and an
  // untouched one keeps following the rate.
  const [chargeEdited, setChargeEdited] = useState(false);
  const [charge, setCharge] = useState("");
  const effectiveCharge = chargeEdited ? charge : suggested ?? "";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");

    const areaM2 = area === "" ? null : areaIn(area, areaUnitM2);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workOrderId: order.id,
        cropzoneId: order.cropzone_id || null,
        fieldId: order.field_id || null,
        fieldName: order.field_name || null,
        // No machine, no track, no fuel, no emissions. Left absent rather than
        // zeroed: a missing figure is honest, a zero averages into a season's
        // totals as though it had been measured.
        machineId: null,
        startedAt: `${date}T00:00:00Z`,
        serviceId: service?.id || null,
        fieldAreaM2: areaM2,
        fieldAreaUnits: area === "" ? null : Number(area),
        workAreaM2: areaM2,
        workAreaUnits: area === "" ? null : Number(area),
        pricePerUnit: rate,
        serviceCharge:
          effectiveCharge === "" ? null : Number(effectiveCharge),
      }),
    });

    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not close this job.");
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="fieldset-note">
        No machine recorded this job, so the figures below are yours. It is
        billed and the customer gets the report either way.
      </div>

      <div>
        <div className="field-label">Service</div>
        <select
          className="field"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">Choose…</option>
          {(services || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="field-label">Date worked</div>
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <div className="field-label">Area worked ({areaUnit})</div>
        <input
          className="field"
          type="number"
          inputMode="decimal"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
      </div>

      <div>
        <div className="field-label">Charge</div>
        <input
          className="field"
          type="number"
          inputMode="decimal"
          value={effectiveCharge}
          onChange={(e) => {
            setChargeEdited(true);
            setCharge(e.target.value);
          }}
        />
        {rate != null && (
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">
            {fmtMoney(rate, currency)} per {areaUnit}
            {suggested != null && ` · ${fmtMoney(suggested, currency)} for ${area} ${areaUnit}`}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex gap-2">
        <button className="btn btn-outline flex-1" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary flex-1"
          disabled={busy || !service}
          onClick={submit}
        >
          {busy ? "Closing…" : "Force Close"}
        </button>
      </div>
    </div>
  );
}
