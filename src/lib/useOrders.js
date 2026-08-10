"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrders } from "@/lib/store";

// Polls the real work_orders table so both roles — on the same device or
// two different ones — see each other's changes without a manual refresh.
// Returns [orders, refresh] — call refresh() right after your own mutation
// so your own screen updates instantly instead of waiting for the next poll.
export function useOrders() {
  const [orders, setOrders] = useState([]);

  const refresh = useCallback(async () => {
    const data = await getOrders();
    setOrders(data);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return [orders, refresh];
}
