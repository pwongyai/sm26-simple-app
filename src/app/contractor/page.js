"use client";

import { useState } from "react";
import { useOrders } from "@/lib/useOrders";
import { markSeen, completeOrder } from "@/lib/store";
import { CONTRACTOR_ORG } from "@/lib/config";
import StatusBadge from "@/components/StatusBadge";

export default function ContractorOrdersTab() {
  const [orders, refresh] = useOrders();
  const [openId, setOpenId] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [error, setError] = useState("");

  async function handleOpen(order) {
    if (order.unseen_by_contractor) {
      await markSeen(order.id, "contractor");
      refresh();
    }
    setOpenId(openId === order.id ? null : order.id);
  }

  async function handleComplete(order) {
    setCompleting(order.id);
    setError("");
    try {
      const res = await fetch(
        `/api/agroapi/cropzones/${order.cropzone_id}/activities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityTypeId: order.activity_type_id,
            startDate: order.requested_date,
            note: `Completed by ${CONTRACTOR_ORG.name} via SM26 Simple App`,
            organizationId: order.farmer_org_id,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.errors?.join?.(", ") || "AgroAPI rejected this activity.");
        return;
      }
      await completeOrder(order.id, data.id);
      refresh();
    } catch {
      setError("Could not reach AgroAPI.");
    } finally {
      setCompleting(null);
    }
  }

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Work Order Requests</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {orders.length === 0 && (
        <p className="text-sm text-black/50">No requests yet.</p>
      )}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id} className="relative rounded border border-black/10 p-3 text-sm">
            {o.unseen_by_contractor && (
              <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
            <button
              onClick={() => handleOpen(o)}
              className="flex w-full flex-col items-start text-left pr-4"
            >
              <div className="mb-1 flex w-full items-center justify-between">
                <StatusBadge status={o.status} />
                <span className="text-xs text-black/40">{o.requested_date}</span>
              </div>
              <p className="font-medium">{o.field_name}</p>
              <p className="text-black/60">{o.activity_type_name}</p>
            </button>

            {openId === o.id && (
              <div className="mt-3 border-t border-black/10 pt-3">
                {o.status === "pending" ? (
                  <button
                    onClick={() => handleComplete(o)}
                    disabled={completing === o.id}
                    className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    {completing === o.id ? "Syncing to AgroAPI…" : "Mark Work Complete"}
                  </button>
                ) : (
                  <p className="text-xs text-green-700">
                    Completed {new Date(o.completed_at).toLocaleString()}
                    {o.agroapi_activity_id && " · synced to AgroAPI"}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
