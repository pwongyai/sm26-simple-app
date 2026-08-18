import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUser } from "@/lib/session";

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

async function isAccessible(user, { cropzoneId, fieldId }) {
  if (!cropzoneId && !fieldId) return false;

  let query = supabaseAdmin.from("user_fields").select("id");

  if (user.role === "contractor") {
    query = query.eq("organization_id", user.organization_id);
  } else {
    query = query.eq("app_user_id", user.id);
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
