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
  if (chosen?.contractor_organization_id) return chosen.contractor_organization_id;

  // Legacy fallback, deliberately last: the pre-2026-08-23 column. Kept as a
  // safety net for the transition so behaviour is identical to before even if
  // a relationship row is missing. Remove once
  // organizations.contractor_agro_org_id is dropped.
  return user?.organization?.contractor_agro_org_id || null;
}
