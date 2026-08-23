import { agroFetch } from "@/lib/agroapi";
import { cached, TTL } from "@/lib/cache";

// Which contractor business is this user acting as?
//
// Two different questions, depending on who is asking:
//
//   A CONTRACTOR carries their own business on their login
//   (`app_users.contractor_agro_org_id`, unique — one contractor
//   organization has exactly one login, enforced by
//   app_users_contractor_org_uidx). This is authoritative and cannot be
//   derived: once a farming organization has several contractors, there is
//   nothing to derive it from.
//
//   A FARMER has no business of their own. Their work goes to their farming
//   organization's contractor, which now comes from
//   `farm_contractor_relationships` — the row flagged `is_default`. Today
//   every farm has exactly one active contractor, so "default" and "the only
//   one" coincide; when a farm has several, this is the one used unless the
//   farmer explicitly picks another.
//
// Stays synchronous on purpose: the relationships are joined into the session
// (see getSessionUser), so no call site needs to await.
export function contractorOrgId(user) {
  // A contractor's own business always wins.
  if (user?.contractor_agro_org_id) return user.contractor_agro_org_id;

  const links = user?.organization?.contractor_links || [];
  const active = links.filter((l) => l.status === "active");
  const chosen = active.find((l) => l.is_default) || active[0];
  return chosen?.contractor_organization_id || null;
}

// Every contractor this user's farming organization may use, defaults first.
// A farmer picks from these; today most organizations have exactly one, in
// which case the choice is made for them (see RequestService).
export function availableContractors(user) {
  return (user?.organization?.contractor_links || [])
    .filter((l) => l.status === "active")
    .sort((a, b) => Number(b.is_default) - Number(a.is_default))
    .map((l) => ({ id: l.contractor_organization_id, isDefault: !!l.is_default }));
}

// Is this contractor actually one the user's organization may use? Guards any
// contractor id that arrives from the client — without this, a farmer could
// name any contractor in the world and have work orders routed to them.
export function canUseContractor(user, contractorOrgId) {
  if (!contractorOrgId) return false;
  return availableContractors(user).some((c) => c.id === contractorOrgId);
}

// A contractor business's display name. AgroAPI owns it — a contractor
// organization is an AgroAPI organization, and its name is set there — so this
// app reads it rather than keeping an editable copy (2026-08-23, R13). The
// local copy could be edited independently, which meant the name a farmer saw
// here could disagree with AgroAPI and every other consumer of the platform.
//
// Cached hard: a business name effectively never changes, and without a cache
// an AgroAPI hiccup would leave the farmer's contractor picker nameless — it
// used to be a local read that could not fail.
//
// One call covers every contractor the caller might need, which is why this
// takes the list endpoint rather than /organizations/:id per business.
export async function contractorNames(ids = []) {
  if (!ids.length) return new Map();
  const { ok, body } = await cached("contractor-names", TTL.catalog, () =>
    agroFetch("/contractors")
  );
  const all = ok && Array.isArray(body) ? body : [];
  return new Map(
    all.filter((c) => ids.includes(c.id)).map((c) => [c.id, c.name || null])
  );
}
