import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/ownership";
import { availableContractors } from "@/lib/contractor";

// The contractors a farmer may send work to — their farming organization's
// own, from `farm_contractor_relationships`. Defaults first.
//
// A farmer never picks from "all contractors"; only from the ones their
// organization actually works with. Today most organizations have exactly one,
// so the request flow makes the choice silently rather than asking a question
// with one answer — but the list is returned either way, so the caller can
// decide whether the step is worth showing.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  const links = availableContractors(user);
  if (!links.length) return Response.json([]);

  const { data, error } = await supabaseAdmin
    .from("contractor_organizations")
    .select("agro_contractor_org_id, name, owner_name, phone, status")
    .in(
      "agro_contractor_org_id",
      links.map((l) => l.id)
    );

  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load contractors" }, { status: 500 });
  }

  const byId = new Map((data || []).map((d) => [d.agro_contractor_org_id, d]));

  return Response.json(
    links
      // A business retired outright (contractor_organizations.status) is gone
      // even where the relationship row still says active.
      .filter((l) => (byId.get(l.id)?.status ?? "active") === "active")
      .map((l) => {
        const row = byId.get(l.id);
        return {
          id: l.id,
          // Falls back to the id only if a business has no name yet — better a
          // visible oddity than a blank card the farmer can't tell apart.
          name: row?.name || "Unnamed contractor",
          ownerName: row?.owner_name || null,
          phone: row?.phone || null,
          isDefault: l.isDefault,
        };
      })
  );
}
