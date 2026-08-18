// Work orders, via our own server routes. The browser no longer talks to
// Supabase directly — every read and write is scoped to the signed-in user's
// organization and role server-side (src/app/api/orders/).

export async function getOrders() {
  const res = await fetch("/api/orders");
  if (!res.ok) return [];
  return res.json();
}

export async function createOrder(payload) {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Could not create work order");
  return res.json();
}

export async function updateOrder(orderId, patch) {
  const res = await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Could not update work order");
  return res.json();
}

export async function deleteOrder(orderId) {
  const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Could not delete work order");
}

export async function markSeen(orderId) {
  await updateOrder(orderId, { markSeen: true });
}

export async function completeOrder(orderId, agroApiActivityId) {
  await fetch(`/api/orders/${orderId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agroApiActivityId }),
  });
}
