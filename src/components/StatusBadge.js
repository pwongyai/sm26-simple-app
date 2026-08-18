const STYLES = {
  pending: "bg-amber-100 text-amber-800",
  booked: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  declined: "bg-black/10 text-[var(--text-sec)]",
};

// What the farmer should understand, not what the database calls it.
const LABELS = {
  pending: "waiting for contractor",
  booked: "accepted",
  completed: "completed",
  declined: "declined",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[status] || ""}`}
    >
      {LABELS[status] || status}
    </span>
  );
}
