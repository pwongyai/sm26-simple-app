import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { contractorOrgId } from "@/lib/contractor";
import { USER_SELECT } from "@/lib/session";

// Which farming communities this contractor serves, and which one they are
// currently working in (R2, 2026-08-23).
//
// The relationship table is read in the CONTRACTOR direction here — "which
// farms does this contractor serve?" — the mirror of the farmer's picker,
// which asks "which contractors serve this farm?". Same two rows, read the
// other way round; no new table was needed for either.
//
// The current community is `app_users.organization_id`, and it is a HARD
// scope, not a display preference: it decides which fields, customers, orders
// and reports this contractor can reach at all. Switching therefore HIDES the
// previous community's work rather than adding to the new one — chosen
// deliberately, because a hard boundary cannot produce cross-stamped rows. A
// contractor who could see RK while set to HN could stamp an HN order onto an
// RK field.
//
// Nothing is lost by switching: every row keeps its own organization_id, so
// the previous community's work reappears the moment the default goes back.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const orgId = contractorOrgId(user);
  if (!orgId) return Response.json({ current: user.organization_id, options: [] });

  const { data: links, error } = await supabaseAdmin
    .from("farm_contractor_relationships")
    .select("farm_organization_id, status")
    .eq("contractor_organization_id", orgId)
    .eq("status", "active");

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load communities" }, { status: 500 });
  }

  const ids = (links || []).map((l) => l.farm_organization_id);
  const { data: orgs } = ids.length
    ? await supabaseAdmin
        .from("farm_organizations")
        .select("id, name, currency, area_unit")
        .in("id", ids)
        .eq("active", true)
    : { data: [] };

  // How much work would be hidden by switching away from each community —
  // shown at the moment of choosing rather than discovered afterwards.
  const { data: open } = await supabaseAdmin
    .from("work_orders")
    .select("organization_id, status")
    .eq("contractor_org_id", orgId)
    .in("status", ["pending", "booked"]);

  const openByOrg = new Map();
  for (const o of open || []) {
    openByOrg.set(o.organization_id, (openByOrg.get(o.organization_id) || 0) + 1);
  }

  return Response.json({
    current: user.organization_id,
    options: (orgs || []).map((o) => ({
      id: o.id,
      name: o.name,
      currency: o.currency,
      areaUnit: o.area_unit,
      openJobs: openByOrg.get(o.id) || 0,
      isCurrent: o.id === user.organization_id,
    })),
  });
}

// Switch which community this contractor is working in.
export async function PATCH(request) {
  const { user, response } = await requireAccess();
  if (response) return response;
  if (user.role !== "contractor") {
    return Response.json({ error: "Contractors only" }, { status: 403 });
  }

  const { organizationId } = await request.json();
  const orgId = contractorOrgId(user);

  // Never trust the client with a scope boundary: the contractor must actually
  // serve the community they are asking to switch into. Without this check a
  // contractor could name any community and read its fields and customers.
  const { data: allowed } = await supabaseAdmin
    .from("farm_contractor_relationships")
    .select("farm_organization_id")
    .eq("contractor_organization_id", orgId)
    .eq("farm_organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!allowed) {
    return Response.json(
      { error: "You don't serve that community" },
      { status: 403 }
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("app_users")
    .update({ organization_id: organizationId })
    .eq("id", user.id)
    .select(USER_SELECT)
    .single();

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not switch community" }, { status: 500 });
  }

  return Response.json({ user: updated });
}
