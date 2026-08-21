"use client";

import { useEffect, useState } from "react";
import { deleteOrder } from "@/lib/store";
import StatusBadge from "@/components/StatusBadge";
import Map from "@/components/Map";

function fmtMoney(amount, currency) {
  if (amount == null) return "—";
  return `${currency === "THB" ? "฿" : ""}${amount.toLocaleString()}`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

const OVERVIEW_TAB = "overview";
const MACHINE_TAB = "machine";

// Farmer's own read-only view of a request — the mirror of OrderDetail.js,
// but a farmer never accepts/declines/edits/completes their own request, so
// this is a separate, smaller component rather than OrderDetail with more
// conditionals. The one thing a farmer *can* do is cancel a mistake, and only
// while it's still waiting on the contractor (server enforces the same rule).
//
// Once a job is completed and a report exists, the "work order" framing is
// gone — the farmer is handed the same paper the contractor works from: the
// frozen `work_reports` row, map and trajectory first, then the same
// Overview/Machine breakdown, exactly as the contractor's Report tab shows
// it. The only thing dropped is payment tracking (paid/unpaid is the
// contractor's bookkeeping, not the farmer's) — the farmer just sees the
// charge.
export default function FarmerOrderDetail({ order, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  // A completed order needs one round trip before we know whether a report
  // exists — without this, the plain "Work Order" view renders first and
  // then gets replaced the instant the fetch resolves, which reads as the
  // screen loading twice. Gate on this instead of on `report` itself so a
  // completed order without a report (see below) still resolves cleanly to
  // the plain view, just without the flash.
  const [reportChecked, setReportChecked] = useState(order.status !== "completed");
  const [tab, setTab] = useState(OVERVIEW_TAB);

  const isPending = order.status === "pending";

  useEffect(() => {
    if (order.status !== "completed") return;
    fetch(`/api/orders/${order.id}/report`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setReportChecked(true));
  }, [order.id, order.status]);

  const overviewFields = report && [
    ["Farmer Name", report.farmer?.name || "Unassigned"],
    ["Work Type", report.work_type_name || report.service_name || "—"],
    ["Total Hours", report.hours != null ? `${report.hours} hr` : "—"],
    ["Start Time", fmtTime(report.started_at)],
    ["Stop Time", fmtTime(report.ended_at)],
    ["Crop Area", `${report.field_area_units ?? "—"} ${report.unit_label || ""}`],
    ["Work Area", `${report.work_area_units ?? "—"} ${report.unit_label || ""}`],
    ["% Work Area", `${report.percent_worked ?? "—"}%`],
  ];

  const machineFields = report && [
    ["Machine Name", report.machine_name || "—"],
    ["Implement Width", report.width_m ? `${report.width_m} m` : "—"],
    [
      "Total Distance",
      report.total_distance_m != null
        ? `${(report.total_distance_m / 1000).toFixed(2)} km`
        : "—",
    ],
    ["Fuel Consumption", report.fuel_l != null ? `${report.fuel_l} L` : "—"],
    ["Emissions", report.emissions_kg != null ? `${report.emissions_kg} kg CO₂` : "—"],
  ];

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

  if (!reportChecked) {
    return (
      <div className="overlay">
        <div className="ov-header">
          <button className="ov-back" onClick={onClose} aria-label="Back">
            ←
          </button>
          <span className="ov-title">Work Order</span>
        </div>
        <div className="ov-body">
          <p className="empty-msg">Loading…</p>
        </div>
      </div>
    );
  }

  // A completed job with a real report: the contractor's own paper, handed
  // over as-is — map and trajectory first, then the Overview/Machine
  // breakdown, exactly like the contractor's Report tab. No order framing
  // above it; the report is the whole document now.
  if (report) {
    return (
      <div className="overlay">
        <div className="ov-header">
          <button className="ov-back" onClick={onClose} aria-label="Back">
            ←
          </button>
          <span className="ov-title">Review Work Report</span>
        </div>

        <div className="ov-body">
          <Map boundary={report.boundary} track={report.track_points} height={220} />

          <div className="spec-card">
            <div className="pilltabs">
              <button
                className={tab === OVERVIEW_TAB ? "active" : ""}
                onClick={() => setTab(OVERVIEW_TAB)}
              >
                Overview
              </button>
              <button
                className={tab === MACHINE_TAB ? "active" : ""}
                onClick={() => setTab(MACHINE_TAB)}
              >
                Machine
              </button>
            </div>
            <div className="spec-grid">
              {(tab === OVERVIEW_TAB ? overviewFields : machineFields).map(([lbl, val]) => (
                <div className="spec-row" key={lbl}>
                  <div className="lbl">{lbl}</div>
                  <div className="val">{val}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--rule)] bg-white p-3">
            <span className="text-sm text-[var(--text-sec)]">Total charge</span>
            <span className="text-lg font-semibold">
              {fmtMoney(Number(report.service_charge), report.currency)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">
            {report.work_area_units ?? "—"} {report.unit_label} ×{" "}
            {fmtMoney(Number(report.price_per_unit ?? 0), report.currency)}
          </p>

          <p className="text-xs text-[var(--text-tert)]">
            {fmtDate(report.started_at)}
            {report.work_order_id && " · Linked to an existing work order"}
          </p>

          {report.agroapi_activity_id && (
            <p className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
              Recorded in AgroAPI as a permanent activity.
            </p>
          )}
        </div>

        <div className="ov-footer">
          <button onClick={onClose} className="btn btn-primary w-full">
            Close
          </button>
        </div>
      </div>
    );
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
