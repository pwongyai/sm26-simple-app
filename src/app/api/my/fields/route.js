import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, resolveFarmerId } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

// The farmer's own fields. Which fields you see is a property of who you
// are — resolved to your `farmers` identity, then read from `farmer_fields`
// (the master farmer↔field mapping, shared with manual farmers who have no
// app login at all), then hydrated with live AgroAPI data.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  let query = supabaseAdmin
    .from("farmer_fields")
    .select("*")
    .eq("organization_id", user.organization_id)
    .order("created_at");

  // A contractor sees every registered field in their site; a farmer only their own.
  if (user.role !== "contractor") {
    const farmerId = await resolveFarmerId(user);
    query = query.eq("farmer_id", farmerId);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error(error);
    return Response.json({ error: "Could not load your fields" }, { status: 500 });
  }

  const fields = await Promise.all(
    rows.map(async (row) => {
      const base = {
        fieldId: row.agro_field_id,
        cropzoneId: row.agro_cropzone_id,
        name: row.name,
      };

      // No cropzone yet = a registered field with nothing planted. That's a
      // normal state, not an error — fall back to the field record.
      const { ok, status, body } = row.agro_cropzone_id
        ? await agroFetch(`/cropzones/${row.agro_cropzone_id}`)
        : await agroFetch(`/fields/${row.agro_field_id}`);

      if (!ok) {
        // A confirmed 404 means the field/cropzone was deleted directly in
        // AgroAPI — this mapping row is now pointing at nothing, so drop it
        // rather than leave a stale row in the table that misreads as a real
        // mapping to anyone looking at the data directly. A transient failure
        // (rate limit, AgroAPI hiccup) is not the same signal — only a
        // confirmed 404 justifies deleting real data.
        if (status === 404) {
          await supabaseAdmin.from("farmer_fields").delete().eq("id", row.id);
        }
        return { ...base, areaM2: null, crop: null, unavailable: true };
      }

      // Is something growing in this field right now?
      //
      // Version 3 §7.6: Field, Crop and Job are three separate things — this
      // asks only about the crop cycle. A cropzone counts as active when
      // something was actually planted, the harvest hasn't been recorded, the
      // record isn't archived, and the season hasn't already ended.
      //
      // Note that AgroAPI's crop "unspecified" means *planted, species not
      // recorded* — it is not the same as an empty field, so it must not on its
      // own send a field to the No Active Crop tab.
      const plantingDate = body.planting_date || null;
      const endDate = body.end_date || null;
      const harvested = !!body.harvesting_date || !!body.actual_harvesting_date;
      const archived = !!body.archived_at;
      const seasonOver = !!endDate && new Date(endDate) < new Date();

      const hasActiveCrop =
        !!plantingDate && !harvested && !archived && !seasonOver;

      return {
        ...base,
        name: body.field?.name || body.name || row.name,
        areaM2: body.area ?? null,
        crop: body.crop?.name_i18n?.en || body.crop?.name || null,
        cropVariety: body.crop?.variety_i18n?.en || body.crop?.variety || null,
        // The real shape, so a field's card shows its own outline rather than
        // a generic placeholder.
        boundary: body.location?.boundary?.coordinates || null,
        plantingDate,
        endDate,
        harvestingDate: body.harvesting_date || null,
        archived,
        daysAfterPlanting: body.dap ?? null,
        hasActiveCrop,
      };
    })
  );

  return Response.json({
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      currency: user.organization.currency,
      areaUnit: user.organization.area_unit,
      areaUnitM2: Number(user.organization.area_unit_m2),
    },
    fields,
  });
}
