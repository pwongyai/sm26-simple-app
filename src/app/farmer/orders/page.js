"use client";

import { useState } from "react";
import { useOrders } from "@/lib/useOrders";
import { markSeen } from "@/lib/store";
import StatusBadge from "@/components/StatusBadge";
import FarmerOrderDetail from "@/components/FarmerOrderDetail";

export default function FarmerOrdersTab() {
  const [orders, refresh] = useOrders();
  const [selected, setSelected] = useState(null);

  async function handleOpen(o) {
    if (o.unseen_by_farmer) {
      await markSeen(o.id);
      refresh();
    }
    setSelected(o);
  }

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Work Orders</h1>
      {orders.length === 0 && (
        <p className="text-sm text-[var(--text-sec)]">
          No requests yet — go to Farm and request a machine order.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li
            key={o.id}
            onClick={() => handleOpen(o)}
            className="relative card cursor-pointer p-3 text-sm"
          >
            {o.unseen_by_farmer && (
              <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
            <div className="mb-1 flex items-center justify-between pr-4">
              <div className="flex items-center gap-1.5">
                <StatusBadge status={o.status} />
                {o.has_report && (
                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-[var(--purple-light)] text-[var(--purple)]">
                    Work Report
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--text-tert)]">{o.scheduled_date}</span>
            </div>
            <p className="font-medium">{o.field_name}</p>
            <p className="text-[var(--text-sec)]">{o.activity_type_name}</p>
            {o.status === "declined" && (
              <p className="mt-1 text-xs text-[var(--text-sec)]">
                The contractor couldn&apos;t take this one.
              </p>
            )}
            {o.status === "completed" && o.completed_at && (
              <p className="mt-1 text-xs text-green-700">
                Completed {new Date(o.completed_at).toLocaleString()}
              </p>
            )}
          </li>
        ))}
      </ul>

      {selected && (
        <FarmerOrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}
