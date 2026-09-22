"use client";

import { areaIn, areaOut } from "@/lib/units";
import { useUnits } from "@/lib/useUnits";
import { useState } from "react";
import { updateOrder, deleteOrder } from "@/lib/store";
import { daysLate } from "@/components/OrderCard";
import { fmtDate } from "@/lib/date";
import ForceCloseSheet from "@/components/ForceCloseSheet";

// One shared detail screen, opened from every view — version 2 §8.1: no
// per-tab detail screens, because automated and manual entries must never look
// like two different systems.
export default function OrderDetail({ order, services, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingForceClose, setConfirmingForceClose] = useState(false);

  const [date, setDate] = useState(order.scheduled_date || "");
  const [workType, setWorkType] = useState(order.activity_type_name || "");
  const { areaUnit, areaUnitM2 } = useUnits();
  // Typed and shown in the reader's unit; stored as m².
  const [cropSize, setCropSize] = useState(
    order.crop_size_m2 != null ? String(areaOut(order.crop_size_m2, areaUnitM2)) : ""
  );
  const [note, setNote] = useState(order.note || "");

  const late = daysLate(order);
  const isPending = order.status === "pending";

  async function save() {
    setBusy(true);
    await updateOrder(order.id, {
      scheduledDate: date || null,
      workType: workType ? { id: null, name: workType } : null,
      cropSizeM2: cropSize === "" ? null : areaIn(cropSize, areaUnitM2),
      note: note.trim() || null,
    });
    setBusy(false);
    onChanged();
    onClose();
  }

  async function setStatus(status) {
    setBusy(true);
    await updateOrder(order.id, { status, scheduledDate: date || null });
    setBusy(false);
    onChanged();
    onClose();
  }

  async function remove() {
    setBusy(true);
    await deleteOrder(order.id);
    setBusy(false);
    onChanged();
    onClose();
  }


  // Completing writes a real, permanent Activity into AgroAPI. Only possible
  // once the job is tied to a cropzone — a jotted-down job with no field has
  // nowhere to record against yet; the report flow is what closes that.

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span className="ov-title">
          {isPending ? "Incoming Request" : editing ? "Edit Work Order" : "Work Order"}
        </span>
      </div>

      <div className="ov-body">
        <div className="choice-card selected" style={{ cursor: "default" }}>
          <div className="icon">👤</div>
          <div className="txt">
            <b>{order.farmer?.name || "—"}</b>
            <span>
              {order.farmer?.phone || "No phone on file"}
              {order.source === "smart_farmer" && " · requested in the app"}
            </span>
          </div>
        </div>

        {order.completion_type === "force_closed" && (
          <div className="fieldset-note" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            <b>Force closed.</b>{" "}
            {order.history?.length
              ? `Closed by ${order.history[order.history.length - 1].user} · ${new Date(
                  order.history[order.history.length - 1].at
                ).toLocaleString()}`
              : "No matching machine work was found for this job."}
          </div>
        )}

        {late > 0 && order.status === "booked" && (
          <div
            className="fieldset-note"
            style={{ background: "var(--danger-light)", color: "var(--danger)" }}
          >
            {/* Was: "Unmatched — N days late. No matching machine work
                found. If this job is actually finished, you can close it
                manually." Two of those sentences were the app explaining its
                own bookkeeping. What the contractor needs is the fact and the
                button. */}
            <b>
              {late} {late === 1 ? "day" : "days"} late.
            </b>{" "}
            If the job is done, close it below.
          </div>
        )}

        {editing ? (
          <>
            <div>
              <div className="field-label">Work type</div>
              <select
                className="field"
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
              >
                <option value="">Not set</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">Scheduled work date</div>
              <input
                className="field"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <div className="field-label">Crop size ({areaUnit})</div>
              <input
                className="field"
                type="number"
                step="0.1"
                value={cropSize}
                onChange={(e) => setCropSize(e.target.value)}
                placeholder="unknown"
              />
            </div>
            <div>
              <div className="field-label">Note</div>
              <input
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the driver should know"
              />
            </div>
          </>
        ) : (
          <div className="detail-card">
            <div className="detail-row">
              <div className="lbl">Work type</div>
              <div className="val">{order.activity_type_name || "Not set"}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Scheduled</div>
              <div className="val">{order.scheduled_date ? fmtDate(order.scheduled_date) : "No date"}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Crop size</div>
              <div className="val">
                {order.crop_size_m2 != null
                  ? `${areaOut(order.crop_size_m2, areaUnitM2)} ${areaUnit}`
                  : "Unknown"}
              </div>
            </div>
            {order.field_name && (
              <div className="detail-row">
                <div className="lbl">Field</div>
                <div className="val">{order.field_name}</div>
              </div>
            )}
            {order.note && (
              <div className="detail-row">
                <div className="lbl">Note</div>
                <div className="val">{order.note}</div>
              </div>
            )}
            <div className="detail-row">
              <div className="lbl">Written down</div>
              <div className="val">
                {fmtDate(order.booking_date)}
              </div>
            </div>
            {order.status === "completed" && order.agro_activity_id && (
              <div className="detail-row">
                <div className="lbl">AgroAPI</div>
                <div className="val">Recorded</div>
              </div>
            )}
          </div>
        )}

        {isPending && (
          <div>
            <div className="field-label">Scheduled date — adjust before accepting</div>
            <input
              className="field"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}

        {/* "Mark work complete" used to sit here. It posted an Activity
            straight to AgroAPI and closed the row — no report, no bill, no
            ADAPT document, nothing the farmer ever saw. It was never part of
            the design and it bypassed the exchange entirely, so it is gone
            (2026-09-23). Closing a job now goes through a report, from the
            machine's track or from the contractor's own figures. */}
        {confirmingForceClose && !editing && (
          <ForceCloseSheet
            order={order}
            services={services}
            onCancel={() => setConfirmingForceClose(false)}
            onDone={() => {
              onChanged();
              onClose();
            }}
          />
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      <div className="ov-footer">
        {isPending ? (
          <>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => setStatus("declined")}
            >
              Decline
            </button>
            <button
              className="btn btn-go"
              disabled={busy}
              onClick={() => setStatus("booked")}
            >
              Accept
            </button>
          </>
        ) : editing ? (
          <>
            <button className="btn btn-outline" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              Save
            </button>
          </>
        ) : confirmingDelete ? (
          <button
            className="btn"
            style={{ background: "var(--danger)", color: "#fff" }}
            disabled={busy}
            onClick={remove}
          >
            Really delete?
          </button>
        ) : confirmingForceClose ? null : (
          <>
            <button
              className="btn btn-outline"
              style={{ color: "var(--danger)" }}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
            {order.status === "booked" && (
              <button
                className="btn btn-outline"
                style={{ color: "var(--accent)" }}
                onClick={() => setConfirmingForceClose(true)}
              >
                Close without machine
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
