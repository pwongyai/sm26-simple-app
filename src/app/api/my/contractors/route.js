import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { availableContractors, contractorNames } from "@/lib/contractor";

// The contractors a farmer may send work to — their farming organization's
// own, from `farm_contractor_relationships`. Defaults first.
//
// A farmer never picks from "all contractors"; only from the ones their
// organization actually works with. Today most organizations have exactly one,
// so the request flow makes the choice silently rather than asking a question
// with one answer — but the list is returned either way, so the caller can
// decide whether the step is worth showing.
//
// Three sources, because no single one has everything (R13, 2026-08-23):
//   name          AgroAPI — it owns the business name
//   owner + phone `app_users`, the one login bound to that business
//   status        `contractor_organizations`, this app's own retirement flag
// The owner/phone join is only safe because app_users.contractor_agro_org_id is
// uniquely indexed: one business, exactly one login. A farmer's own session
// cannot reach another user's row, which is why this is a server-side join and
// not a session fallback the way the contractor's own profile does it.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  const links = availableContractors(user);
  if (!links.length) return Response.json([]);
  const ids = links.map((l) => l.id);

  const [{ data: orgRows, error }, { data: loginRows }, names] = await Promise.all([
    supabaseAdmin
      .from("contractor_organizations")
      .select("agro_contractor_org_id, status")
      .in("agro_contractor_org_id", ids),
    supabaseAdmin
      .from("app_users")
      .select("name, phone, contractor_agro_org_id")
      .in("contractor_agro_org_id", ids),
    contractorNames(ids),
  ]);

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load contractors" }, { status: 500 });
  }

  const statusById = new Map(
    (orgRows || []).map((d) => [d.agro_contractor_org_id, d.status])
  );
  const loginById = new Map(
    (loginRows || []).map((u) => [u.contractor_agro_org_id, u])
  );

  return Response.json(
    links
      // A business retired outright (contractor_organizations.status) is gone
      // even where the relationship row still says active.
      .filter((l) => (statusById.get(l.id) ?? "active") === "active")
      .map((l) => {
        const login = loginById.get(l.id);
        return {
          id: l.id,
          // Falls back to a visible oddity rather than a blank card the farmer
          // can't tell apart — now only reachable if AgroAPI is unreachable
          // and the name isn't cached.
          name: names.get(l.id) || "Unnamed contractor",
          ownerName: login?.name || null,
          phone: login?.phone || null,
          isDefault: l.isDefault,
        };
      })
  );
}
