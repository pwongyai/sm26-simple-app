"use client";

import { useState } from "react";
import { updateOrder, deleteOrder, completeOrder } from "@/lib/store";
import { daysLate } from "@/components/OrderCard";

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
  const [rai, setRai] = useState(order.crop_size_rai ?? "");
  const [note, setNote] = useState(order.note || "");

  const late = daysLate(order);
  const isPending = order.status === "pending";

  async function save() {
    setBusy(true);
    await updateOrder(order.id, {
      scheduledDate: date || null,
      workType: workType ? { id: null, name: workType } : null,
      cropSizeRai: rai === "" ? null : Number(rai),
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

  async function forceClose() {
    setBusy(true);
    await updateOrder(order.id, { forceClose: true });
    setBusy(false);
    onChanged();
    onClose();
  }

  // Completing writes a real, permanent Activity into AgroAPI. Only possible
  // once the job is tied to a cropzone — a jotted-down job with no field has
  // nowhere to record against yet; the report flow is what closes that.
  async function complete() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/agroapi/cropzones/${order.cropzone_id}/activities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityTypeId: order.activity_type_id,
            startDate: order.scheduled_date || order.booking_date,
            note: `Completed via SM26 for ${order.farmer?.name || "customer"}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.errors?.join?.(", ") || "AgroAPI rejected this activity.");
        setBusy(false);
        return;
      }
      await completeOrder(order.id, data.id);
      onChanged();
      onClose();
    } catch {
      setError("Could not reach AgroAPI.");
      setBusy(false);
    }
  }

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
            <b>⚠️ Unmatched — {late} {late === 1 ? "day" : "days"} late.</b> No
            matching machine work found. If this job is actually finished, you
            can close it manually.
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
              <div className="field-label">Crop size (rai)</div>
              <input
                className="field"
                type="number"
                step="0.1"
                value={rai}
                onChange={(e) => setRai(e.target.value)}
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
              <div className="val">{order.scheduled_date || "No date"}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Crop size</div>
              <div className="val">
                {order.crop_size_rai != null
                  ? `${Number(order.crop_size_rai).toFixed(1)} rai`
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
                {new Date(`${order.booking_date}T00:00:00`).toLocaleDateString()}
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

        {order.status === "booked" && order.cropzone_id && !editing && (
          <button
            className="btn"
            style={{ background: "var(--green-dark)", color: "#fff" }}
            disabled={busy}
            onClick={complete}
          >
            {busy ? "Recording in AgroAPI…" : "Mark work complete"}
          </button>
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
        ) : confirmingForceClose ? (
          <button
            className="btn"
            style={{ background: "var(--accent)", color: "#fff" }}
            disabled={busy}
            onClick={forceClose}
          >
            Really force close?
          </button>
        ) : (
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
                Force Close
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
