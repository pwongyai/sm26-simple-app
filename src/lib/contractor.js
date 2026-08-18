// Which contractor business is this user?
//
// A contractor account carries its own AgroAPI contractor organization. The
// site's own value is only a fallback for accounts created before contractors
// had individual logins — new accounts always set their own.
export function contractorOrgId(user) {
  return user?.contractor_agro_org_id || user?.organization?.contractor_agro_org_id || null;
}
