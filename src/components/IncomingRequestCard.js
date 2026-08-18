"use client";

import { useState } from "react";
import { updateOrder } from "@/lib/store";

// The richer per-request card version 3 uses inside Incoming Requests — Accept/
// Decline (with an inline date adjust) happen right here, no detour through
// the full Work Order Details overlay required for the common case. "View
// Details" is still offered for anyone who wants the field/notes context.
export default function IncomingRequestCard({ order, onChanged, onViewDetails }) {
  const [date, setDate] = useState(order.scheduled_date || "");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    await updateOrder(order.id, { status: "booked", scheduledDate: date || null });
    setBusy(false);
    onChanged();
  }

  async function decline() {
    setBusy(true);
    await updateOrder(order.id, { status: "declined" });
    setBusy(false);
    onChanged();
  }

  return (
    <div className="card p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-medium">{order.farmer?.name || "—"}</p>
        <span className="shrink-0 rounded bg-green-light px-1.5 py-0.5 text-[11px] text-green-dark">
          Smart Farmer
        </span>
      </div>
      <p className="text-[var(--text-sec)]">
        {order.activity_type_name || "No work type"}
        {order.crop_size_rai != null && ` · ${Number(order.crop_size_rai).toFixed(1)} rai`}
      </p>
      <p className="text-xs text-[var(--text-tert)]">
        Requested:{" "}
        {order.booking_date
          ? new Date(`${order.booking_date}T00:00:00`).toLocaleDateString()
          : "—"}
      </p>

      <div className="mt-2">
        <div className="field-label">Adjust scheduled date — before accepting</div>
        <input
          type="date"
          className="field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {order.farmer?.phone && (
        <a href={`tel:${order.farmer.phone}`} className="btn btn-outline mt-2 w-full">
          📞 Call {order.farmer.name?.split(" ")[0] || "Farmer"} · {order.farmer.phone}
        </a>
      )}

      <button
        type="button"
        className="mt-2 w-full text-center text-xs text-[var(--text-tert)] underline"
        onClick={() => onViewDetails(order)}
      >
        View Details
      </button>

      <div className="mt-2 flex gap-2">
        <button className="btn btn-outline flex-1" disabled={busy} onClick={decline}>
          Decline
        </button>
        <button className="btn btn-go flex-1" disabled={busy} onClick={accept}>
          Accept Job
        </button>
      </div>
    </div>
  );
}
