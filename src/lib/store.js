// Role selection stays local (per-device, not shared data).
// Work orders live in Supabase's `work_orders` table (work-orders-schema.sql)
// so the farmer and contractor actually see each other's data across
// separate devices — this is real shared state now, not a local mock.

import { supabase } from "@/lib/supabaseClient";
import { FARMER_ORG, CONTRACTOR_ORG } from "@/lib/config";

const ROLE_KEY = "sm_role_v1";

export function getRole() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ROLE_KEY);
}

export function setRole(role) {
  window.localStorage.setItem(ROLE_KEY, role);
}

export function clearRole() {
  window.localStorage.removeItem(ROLE_KEY);
}

export async function getOrders() {
  const { data, error } = await supabase
    .from("work_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  return data;
}

export async function createOrder({
  fieldId,
  cropzoneId,
  fieldName,
  activityTypeId,
  activityTypeName,
  requestedDate,
}) {
  const { error } = await supabase.from("work_orders").insert({
    farmer_org_id: FARMER_ORG.id,
    contractor_org_id: CONTRACTOR_ORG.id,
    field_id: fieldId,
    cropzone_id: cropzoneId,
    field_name: fieldName,
    activity_type_id: activityTypeId,
    activity_type_name: activityTypeName,
    requested_date: requestedDate,
  });
  if (error) console.error(error);
}

export async function markSeen(orderId, role) {
  const column = role === "farmer" ? "unseen_by_farmer" : "unseen_by_contractor";
  const { error } = await supabase
    .from("work_orders")
    .update({ [column]: false })
    .eq("id", orderId);
  if (error) console.error(error);
}

export async function completeOrder(orderId, agroApiActivityId) {
  const { error } = await supabase
    .from("work_orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      agroapi_activity_id: agroApiActivityId || null,
      unseen_by_farmer: true,
    })
    .eq("id", orderId);
  if (error) console.error(error);
}
