import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ADAPT document generation — AgGateway's interchange format for field work.
//
// The app models the JOB (work_orders + work_reports). This module writes the
// DOCUMENTS about that job: a Work Order when the job is created, a Work Record
// when it is reported. They are stored in `adapt_documents`, once, exactly as
// generated, because once an external FMIS is on the other end those documents
// are the deliverable and regenerating one later with newer code would produce
// something different from what actually crossed the wire.
//
// Design rules, all of which are easy to break by accident:
//
//   * Nothing here may break the app. A contractor filing a report must never
//     see an error because ADAPT generation failed. Every entry point is
//     wrapped and logs instead of throwing — see `record()`.
//   * Never embed the GPS track. `spatialRecordsFile` is defined by ADAPT as
//     "a reference to the file/URL containing specific Spatial Records", and
//     the track is two thirds of a report's storage. Referencing keeps the
//     payload ~1 kB instead of ~2.5 kB.
//   * Never edit a stored payload. It is evidence, including the parts we do
//     not understand yet.
//
// Full design, the 19-entry work-type map and the version-upgrade procedure:
// Projects/SM26/WORK_TYPE_MAP.md
export const ADAPT_VERSION = "2.0.2";

// Who issued the ids in our documents. ADAPT's `IdSourceType` allows a GLN (a
// registered GS1 number) or a URI; we have no GLN, so a stable URI it is.
// Deliberately NOT the Vercel hostname, which is an implementation detail that
// could change — every document we ever send refers back to this string.
const ID_SOURCE = process.env.ADAPT_ID_SOURCE || "https://listenfield.com/sm26";

// An ADAPT id carries where it came from, so a receiving system can tell a
// foreign id from one of its own and echo ours back on the reply.
function id(referenceId) {
  return referenceId
    ? { referenceId, idType: "UUID", source: ID_SOURCE, sourceType: "URI" }
    : null;
}

// A service with no `adapt_code` exports as ADAPT's own UNKNOWN rather than a
// guess. Three services are legitimately in this state: Land Preparation (7
// candidates, needs a human decision) and the two crop-protection services
// (removed from the picker by project decision on 2026-09-16).
function operationTypeCode(service) {
  return service?.adapt_code || "UNKNOWN";
}

function timeScope(start, end, dateContextCode) {
  if (!start) return null;
  return {
    dateContextCode,
    start: new Date(start).toISOString(),
    ...(end ? { end: new Date(end).toISOString() } : {}),
  };
}

// CUSTOM_SERVICE_PROVIDER, not OPERATOR, for the contracting business.
// "Custom service" is the standard agricultural term for contract field work;
// OPERATOR is the person on the machine. AgroAPI's own exporter uses OPERATOR
// for the company, which conflates the two — we are writing our own, so it is
// worth getting right.
function partyRoles({ farmerId, contractorOrgId }) {
  const roles = [];
  if (farmerId) roles.push({ roleCode: "CUSTOMER", partyId: farmerId });
  if (contractorOrgId)
    roles.push({ roleCode: "CUSTOM_SERVICE_PROVIDER", partyId: contractorOrgId });
  return roles;
}

// The Work Order: what was asked for. Required by ADAPT are Id, Name, FieldId
// and at least one Operation.
export function buildWorkOrder(order, { service } = {}) {
  const name = [order.field_name, order.activity_type_name].filter(Boolean).join(" — ");

  return {
    id: id(order.id),
    name: name || `Work order ${order.id}`,
    ...(order.note ? { note: [{ description: order.note }] } : {}),
    fieldId: id(order.field_id),
    cropZoneId: id(order.cropzone_id),
    timeScopes: [timeScope(order.scheduled_date, null, "PROPOSED")].filter(Boolean),
    operations: [
      {
        id: id(order.id),
        name: order.activity_type_name || service?.name || "Work",
        operationTypeCode: operationTypeCode(service),
        partyRoles: partyRoles({
          farmerId: order.farmer_id,
          contractorOrgId: order.contractor_org_id,
        }),
        timeScopes: [timeScope(order.scheduled_date, null, "PROPOSED")].filter(Boolean),
      },
    ],
  };
}

// The Work Record: what actually happened. `documentCorrelations` points back
// at the Work Order with relationship CAUSAL — ADAPT's own wording is "data in
// the originating document caused this document to be created", which is
// exactly an order being fulfilled.
export function buildWorkRecord(report, { order, service, fieldId, trackUrl } = {}) {
  const name = [report.field_name, report.service_name || report.work_type_name]
    .filter(Boolean)
    .join(" — ");

  return {
    id: id(report.id),
    name: name || `Work record ${report.id}`,
    fieldId: id(fieldId || order?.field_id),
    cropZoneId: id(report.agro_cropzone_id),
    ...(order
      ? {
          documentCorrelations: [
            { documentRelationshipTypeCode: "CAUSAL", originatingDocumentId: order.id },
          ],
        }
      : {}),
    timeScopes: [
      timeScope(order?.scheduled_date, null, "PROPOSED"),
      timeScope(report.started_at, report.ended_at, "ACTUAL"),
    ].filter(Boolean),
    operations: [
      {
        id: id(report.id),
        name: report.service_name || report.work_type_name || "Work",
        operationTypeCode: operationTypeCode(service),
        partyRoles: partyRoles({
          farmerId: report.farmer_id,
          contractorOrgId: report.contractor_agro_org_id,
        }),
        ...(report.agro_machine_id
          ? { deviceConfiguration: { deviceId: report.agro_machine_id } }
          : {}),
        // A reference, never the points themselves. ADAPT wants GeoParquet for
        // a serialised bundle; this URL is the internal form and the bundle
        // conversion is separate work (see WORK_TYPE_MAP.md).
        ...(trackUrl ? { spatialRecordsFile: trackUrl } : {}),
        ...(report.boundary ? { boundary: report.boundary } : {}),
        timeScopes: [timeScope(report.started_at, report.ended_at, "ACTUAL")].filter(Boolean),
        // Deliberately absent: service_charge, currency, payment_status. ADAPT
        // has no concept of them, so they stay in our own tables and never
        // travel. A partner returning a report simply leaves them empty and we
        // keep ours.
        summaryValues: {
          workedAreaM2: num(report.work_area_m2),
          fieldAreaM2: num(report.field_area_m2),
          percentWorked: num(report.percent_worked),
          hours: num(report.hours),
          fuelL: num(report.fuel_l),
          // Not an ADAPT concept, carried because it is a project deliverable.
          emissionsKg: num(report.emissions_kg),
        },
      },
    ],
  };
}

function num(v) {
  return v === null || v === undefined ? null : Number(v);
}

// Store a generated document. Internal documents get one row with no
// counterparty: a letter that never leaves the building has one copy, and two
// rows only when something genuinely crosses to an outside company.
//
// Never throws. An ADAPT document we failed to store is a gap in the archive,
// not a reason to fail the contractor's report.
export async function record({
  payload,
  docType,
  direction = "out",
  workOrderId = null,
  workReportId = null,
  counterparty = null,
  externalDocId = null,
  matchStatus = "matched",
}) {
  try {
    const { error } = await supabaseAdmin.from("adapt_documents").insert({
      direction,
      doc_type: docType,
      adapt_version: ADAPT_VERSION,
      payload,
      work_order_id: workOrderId,
      work_report_id: workReportId,
      counterparty,
      external_doc_id: externalDocId,
      match_status: matchStatus,
    });
    if (error) throw error;
  } catch (error) {
    console.error(`could not store ADAPT ${docType} document`, error);
  }
}

// Convenience: build and store a Work Order for a freshly created order.
export async function recordWorkOrder(order, { service } = {}) {
  if (!order?.id) return;
  await record({
    payload: buildWorkOrder(order, { service }),
    docType: "work_order",
    workOrderId: order.id,
  });
}

// Convenience: build and store a Work Record for a freshly created report.
//
// `fieldId` is resolved rather than trusted. ADAPT makes Field Id REQUIRED on a
// Work Record, and neither source is reliable on its own: work_reports stores
// field_name but no field id, and a backfilled order has field_id NULL (see
// reports/route.js — the order is created from a report, which never knew the
// field id). Without the fallback every backfilled job would emit a
// non-conformant document, and nothing would complain until a partner rejected
// it. AgroAPI knows which field a cropzone belongs to, so ask it.
export async function recordWorkRecord(report, { order, service, fieldId, trackUrl } = {}) {
  if (!report?.id) return;

  let resolvedFieldId = fieldId || order?.field_id || null;
  if (!resolvedFieldId && report.agro_cropzone_id) {
    resolvedFieldId = await fieldIdForCropzone(report.agro_cropzone_id);
  }

  await record({
    payload: buildWorkRecord(report, { order, service, fieldId: resolvedFieldId, trackUrl }),
    docType: "work_record",
    workOrderId: report.work_order_id || order?.id || null,
    workReportId: report.id,
  });
}

// Which field a cropzone belongs to, from AgroAPI. Cached — the same lookup the
// cropzone route already does, so this usually costs nothing. Returns null on
// any failure: a document with a null fieldId is worse than a conformant one,
// but far better than a report that fails to save.
async function fieldIdForCropzone(cropzoneId) {
  try {
    const { agroFetch } = await import("@/lib/agroapi");
    const { cached, TTL } = await import("@/lib/cache");
    const { ok, body } = await cached(`cropzone:${cropzoneId}`, TTL.catalog, () =>
      agroFetch(`/cropzones/${cropzoneId}`)
    );
    return ok ? body?.field?.id || null : null;
  } catch {
    return null;
  }
}

// Look up the service behind an order or report, for its `adapt_code`. Returns
// null rather than throwing — a missing service yields an UNKNOWN operation
// type, which is valid ADAPT.
export async function serviceFor(serviceId) {
  if (!serviceId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("services")
      .select("id, name, adapt_code, activity_canonical")
      .eq("id", serviceId)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

// A work order names an AgroAPI activity type; a work report names one of the
// contractor's own services. Only the service carries `adapt_code`, so an order
// has to travel activity type -> canonical name -> that contractor's service.
//
// This is a best effort, and deliberately so. Which service a job will be
// billed as is not settled until the contractor picks one at report time, and
// several services can share an activity type ("ตีเลน 1" and "ตีเลน 2" are both
// land preparation). The Work Record carries the authoritative code; the Work
// Order carries our best reading of the request, or UNKNOWN.
export async function serviceForActivityType(contractorOrgId, activityTypeId) {
  if (!contractorOrgId || !activityTypeId) return null;
  try {
    const { agroFetch } = await import("@/lib/agroapi");
    const { cached, TTL } = await import("@/lib/cache");

    // Same cache key the activity-types route uses, so this rides on a warm
    // entry rather than adding an AgroAPI call to order creation.
    const types = await cached("catalog:activity_types", TTL.catalog, () =>
      agroFetch("/activity_types")
    );
    if (!types.ok) return null;

    const canonical = (types.body || []).find((t) => t.id === activityTypeId)?.canonical_name;
    if (!canonical) return null;

    const { data } = await supabaseAdmin
      .from("services")
      .select("id, name, adapt_code, activity_canonical")
      .eq("contractor_agro_org_id", contractorOrgId)
      .eq("activity_canonical", canonical)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}
