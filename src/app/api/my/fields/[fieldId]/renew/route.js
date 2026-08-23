import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, resolveFarmerId } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// Start a new season on a field.
//
// AgroAPI's own `POST /cropzones/:id/renew` does the right thing in one
// transaction: archives the current cropzone, creates a fresh one carrying the
// same name, crop, field and boundary, sets its start date to today, and chains
// the two together via prev/next so the field keeps a full history.
//
// The rule this app adds on top — and it is *our* rule, AgroAPI is untouched —
// is that a field has exactly **one active cropzone at a time**. So after
// renewing we repoint the ownership row at the new cropzone and, if AgroAPI
// left the old one unarchived for any reason, archive it ourselves. Without
// that repoint the farmer would keep seeing last season's cropzone — its
// imagery, its activities, its planting date — while working the new one.
export async function POST(request, { params }) {
  const { fieldId } = await params;
  const { user, response } = await requireAccess({ fieldId });
  if (response) return response;

  const farmerId = await resolveFarmerId(user);
  const { data: owned } = await supabaseAdmin
    .from("farmer_fields")
    .select("agro_field_id, agro_cropzone_id")
    .eq("agro_field_id", fieldId)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (!owned?.agro_cropzone_id) {
    return Response.json(
      { error: "This field has no crop to renew yet" },
      { status: 400 }
    );
  }

  const previousId = owned.agro_cropzone_id;

  const renewed = await agroFetch(`/cropzones/${previousId}/renew`, {
    method: "POST",
  });

  if (!renewed.ok) {
    // AgroAPI refuses to renew a cropzone that has already been renewed once.
    return Response.json(
      {
        error:
          "AgroAPI could not renew this crop — it may already have been renewed.",
        detail: renewed.body,
      },
      { status: 502 }
    );
  }

  const newCropzoneId = renewed.body?.id;

  // Belt and braces: renew! archives the old one, but this app's rule is that
  // only one cropzone per field is ever active, so make certain.
  const check = await agroFetch(`/cropzones/${previousId}`);
  if (check.ok && !check.body?.archived_at) {
    await agroFetch(`/cropzones/${previousId}/archive`, { method: "POST" });
  }

  const { error } = await supabaseAdmin
    .from("farmer_fields")
    .update({ agro_cropzone_id: newCropzoneId })
    .eq("agro_field_id", owned.agro_field_id);

  if (error) {
    console.error(error);
    return Response.json(
      {
        error:
          "The new season was created in AgroAPI but could not be linked to your account",
        newCropzoneId,
      },
      { status: 500 }
    );
  }

  return Response.json({
    previousCropzoneId: previousId,
    cropzoneId: newCropzoneId,
    // Empty until the farmer records this season's planting date and crop.
    plantingDate: renewed.body?.planting_date || null,
  });
}
