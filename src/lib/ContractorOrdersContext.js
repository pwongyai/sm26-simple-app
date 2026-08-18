"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useOrders } from "@/lib/useOrders";
import { markSeen } from "@/lib/store";

// Orders + the one shared detail overlay (version 2 §8.1), lifted above the
// Booking tab so the header's bell — which lives in the layout, outside any
// single tab — can open a pending order from anywhere in the contractor app,
// not just while already on Booking.
const Ctx = createContext(null);

export function ContractorOrdersProvider({ children }) {
  const [orders, refresh] = useOrders();
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showIncoming, setShowIncoming] = useState(false);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => (r.ok ? r.json() : []))
      .then(setServices)
      .catch(() => {});
  }, []);

  async function openOrder(order) {
    if (order.unseen_by_contractor) {
      await markSeen(order.id);
      refresh();
    }
    setSelected(order);
  }

  const pending = orders.filter((o) => o.status === "pending");

  return (
    <Ctx.Provider
      value={{
        orders,
        refresh,
        services,
        selected,
        setSelected,
        openOrder,
        pending,
        showIncoming,
        openIncoming: () => setShowIncoming(true),
        closeIncoming: () => setShowIncoming(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useContractorOrders() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useContractorOrders must be used inside ContractorOrdersProvider");
  }
  return ctx;
}
