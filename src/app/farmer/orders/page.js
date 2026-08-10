"use client";

import { useOrders } from "@/lib/useOrders";
import { markSeen } from "@/lib/store";
import StatusBadge from "@/components/StatusBadge";

export default function FarmerOrdersTab() {
  const [orders, refresh] = useOrders();

  async function handleOpen(o) {
    if (o.unseen_by_farmer) {
      await markSeen(o.id, "farmer");
      refresh();
    }
  }

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Work Orders</h1>
      {orders.length === 0 && (
        <p className="text-sm text-black/50">
          No requests yet — go to Farm and request a machine order.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li
            key={o.id}
            onClick={() => handleOpen(o)}
            className="relative rounded border border-black/10 p-3 text-sm"
          >
            {o.unseen_by_farmer && (
              <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
            <div className="mb-1 flex items-center justify-between pr-4">
              <StatusBadge status={o.status} />
              <span className="text-xs text-black/40">{o.requested_date}</span>
            </div>
            <p className="font-medium">{o.field_name}</p>
            <p className="text-black/60">{o.activity_type_name}</p>
            {o.status === "completed" && o.completed_at && (
              <p className="mt-1 text-xs text-green-700">
                Completed {new Date(o.completed_at).toLocaleString()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
