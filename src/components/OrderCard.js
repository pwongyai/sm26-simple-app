"use client";

// One card layout everywhere an order appears — List, Calendar, Today's Work.
// Version 2 §8.9: customer name leads (field name is a system construct
// farmers and contractors don't track), crop size gets the prominent number,
// and a badge appears only when something is genuinely notable. No badge means
// nothing unusual, which is itself useful information.

export function daysLate(order) {
  // A request the contractor hasn't accepted yet can't be late — it isn't
  // their commitment until they take it.
  if (
    !order.scheduled_date ||
    order.status === "completed" ||
    order.status === "declined" ||
    order.status === "pending"
  ) {
    return 0;
  }
  const due = new Date(`${order.scheduled_date}T00:00:00`);
  const today = new Date(new Date().toDateString());
  return Math.max(0, Math.round((today - due) / 86400000));
}

// Palette matches version 3's status color coding exactly, via the shared
// CSS variables in globals.css: accent (amber) for force-closed/unmatched,
// danger (red) for late, green for the system/Smart Farmer source, surface
// (grey) for an ordinary completed job.
function Badge({ order }) {
  const late = daysLate(order);
  if (order.completion_type === "force_closed") {
    return (
      <span className="rounded bg-accent-light px-1.5 py-0.5 text-[11px] text-accent">
        Force Closed
      </span>
    );
  }
  if (order.status === "completed") {
    return (
      <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-sec">
        Completed
      </span>
    );
  }
  if (late > 0) {
    return (
      <span className="rounded bg-danger-light px-1.5 py-0.5 text-[11px] text-danger">
        {late} {late === 1 ? "day" : "days"} late
      </span>
    );
  }
  if (order.source === "smart_farmer") {
    return (
      <span className="rounded bg-green-light px-1.5 py-0.5 text-[11px] text-green-dark">
        Smart Farmer
      </span>
    );
  }
  return null;
}

export default function OrderCard({ order, onClick, index }) {
  const late = daysLate(order);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 rounded border p-3 text-left ${
        late > 0 ? "border-danger-light bg-danger-light/40" : "border-[var(--rule)]"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">
          {index != null && (
            <span className="mr-1.5 text-[var(--text-tert)]">{index}.</span>
          )}
          {order.farmer?.name || "—"}
        </p>
        <p className="truncate text-sm text-[var(--text-sec)]">
          {order.activity_type_name || "No work type"}
        </p>
        <p className="text-xs text-[var(--text-tert)]">
          {order.scheduled_date
            ? new Date(`${order.scheduled_date}T00:00:00`).toLocaleDateString([], {
                day: "numeric",
                month: "short",
              })
            : "No date"}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge order={order} />
        {order.crop_size_rai != null && (
          <p className="whitespace-nowrap text-lg font-medium leading-none">
            {Number(order.crop_size_rai).toFixed(1)}
            <span className="ml-1 text-xs font-normal text-[var(--text-sec)]">rai</span>
          </p>
        )}
      </div>
    </button>
  );
}
