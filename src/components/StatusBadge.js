const STYLES = {
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status] || ""}`}
    >
      {status}
    </span>
  );
}
