import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUser } from "@/lib/session";
import { contractorOrgId } from "@/lib/contractor";

// The ownership gate. Every route that proxies to AgroAPI must call
// requireAccess() before making the call — AgroAPI itself cannot tell our users
// apart (one shared organization, one shared token), so this is the only thing
// standing between farmer A and farmer B's satellite imagery, weather and
// activity history.
//
// Rules:
//   farmer     — may reach a field/cropzone only if they own the mapping row.
//   contractor — may reach anything registered to their own site, since they
//                legitimately work other people's land. Fields the app has
//                never registered are unreachable for everyone.
//
// Anything not matched is refused before a single byte goes to AgroAPI.

// The `farmers` row behind a logged-in farmer's app_user account — the real
// identity that farmer_fields is keyed by, shared with manual farmers who
// have no app login at all. A smart farmer's app_users row is just their
// login; created on first use, same as their AgroAPI farm elsewhere.
export async function resolveFarmerId(user) {
  const { data: existing } = await supabaseAdmin
    .from("farmers")
    .select("id")
    .eq("app_user_id", user.id)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("farmers")
    .insert({
      organization_id: user.organization_id,
      name: user.name,
      phone: user.phone,
      type: "smart",
      app_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

// A field with no owner in farmer_fields yet is owned by the farmer named
// "Unassigned" — an ordinary row in the same `farmers` table as every other
// customer, seeded once per site, not a special sentinel. Most of this org's
// real AgroAPI fields predate this app and land here until a real survey
// reassigns them to their actual farmer.
export async function unassignedFarmerId(user) {
  const { data } = await supabaseAdmin
    .from("farmers")
    .select("id")
    .eq("contractor_agro_org_id", contractorOrgId(user))
    .eq("name", "Unassigned")
    .maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await supabaseAdmin
    .from("farmers")
    .insert({
      organization_id: user.organization_id,
      contractor_agro_org_id: contractorOrgId(user),
      name: "Unassigned",
      phone: "0000000000",
      type: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function isAccessible(user, { cropzoneId, fieldId }) {
  if (!cropzoneId && !fieldId) return false;

  let query = supabaseAdmin.from("farmer_fields").select("id");

  if (user.role === "contractor") {
    query = query.eq("organization_id", user.organization_id);
  } else {
    const farmerId = await resolveFarmerId(user);
    query = query.eq("farmer_id", farmerId);
  }

  query = cropzoneId
    ? query.eq("agro_cropzone_id", cropzoneId)
    : query.eq("agro_field_id", fieldId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("ownership check failed", error);
    return false;
  }
  return !!data;
}

// Returns { user } on success, or { response } holding the error to return.
// Callers: const { user, response } = await requireAccess({ cropzoneId });
//          if (response) return response;
export async function requireAccess({ cropzoneId, fieldId } = {}) {
  const user = await getSessionUser();

  if (!user) {
    return {
      response: Response.json({ error: "Not signed in" }, { status: 401 }),
    };
  }

  if (!user.organization_id) {
    return {
      response: Response.json(
        { error: "Join an organization first" },
        { status: 403 }
      ),
    };
  }

  // Routes that only need a signed-in user (no specific resource) pass nothing.
  if (!cropzoneId && !fieldId) return { user };

  if (!(await isAccessible(user, { cropzoneId, fieldId }))) {
    // Deliberately identical to a not-found: never confirm that someone else's
    // field exists just because the caller guessed a valid id.
    return {
      response: Response.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return { user };
}
