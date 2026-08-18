"use client";

import { useState } from "react";
import { deleteOrder } from "@/lib/store";
import StatusBadge from "@/components/StatusBadge";

// Farmer's own read-only view of a request — the mirror of OrderDetail.js,
// but a farmer never accepts/declines/edits/completes their own request, so
// this is a separate, smaller component rather than OrderDetail with more
// conditionals. The one thing a farmer *can* do is cancel a mistake, and only
// while it's still waiting on the contractor (server enforces the same rule).
export default function FarmerOrderDetail({ order, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState("");

  const isPending = order.status === "pending";

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await deleteOrder(order.id);
      onChanged();
      onClose();
    } catch {
      setError("Could not cancel this request.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span className="ov-title">Work Order</span>
      </div>

      <div className="ov-body">
        <div className="detail-card">
          <div className="detail-row">
            <div className="lbl">Status</div>
            <div className="val">
              <StatusBadge status={order.status} />
            </div>
          </div>
          <div className="detail-row">
            <div className="lbl">Field</div>
            <div className="val">{order.field_name || "—"}</div>
          </div>
          <div className="detail-row">
            <div className="lbl">Work type</div>
            <div className="val">{order.activity_type_name || "Not set"}</div>
          </div>
          <div className="detail-row">
            <div className="lbl">Crop size</div>
            <div className="val">
              {order.crop_size_rai != null
                ? `${Number(order.crop_size_rai).toFixed(1)} rai`
                : "Unknown"}
            </div>
          </div>
          <div className="detail-row">
            <div className="lbl">Scheduled</div>
            <div className="val">{order.scheduled_date || "No date"}</div>
          </div>
          <div className="detail-row">
            <div className="lbl">Requested</div>
            <div className="val">
              {new Date(`${order.booking_date}T00:00:00`).toLocaleDateString()}
            </div>
          </div>
        </div>

        {order.status === "declined" && (
          <p className="text-sm text-[var(--text-sec)]">
            The contractor couldn&apos;t take this one.
          </p>
        )}
        {order.status === "completed" && order.completed_at && (
          <p className="text-sm text-green-700">
            Completed {new Date(order.completed_at).toLocaleString()}
          </p>
        )}
        {order.status === "booked" && (
          <p className="text-sm text-[var(--text-sec)]">
            Accepted by the contractor — this can no longer be cancelled.
          </p>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      {isPending && (
        <div className="ov-footer">
          {confirmingCancel ? (
            <button
              className="btn"
              style={{ background: "var(--danger)", color: "#fff" }}
              disabled={busy}
              onClick={cancel}
            >
              {busy ? "Cancelling…" : "Really cancel?"}
            </button>
          ) : (
            <button
              className="btn btn-outline"
              style={{ color: "var(--danger)" }}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel request
            </button>
          )}
        </div>
      )}
    </div>
  );
}
