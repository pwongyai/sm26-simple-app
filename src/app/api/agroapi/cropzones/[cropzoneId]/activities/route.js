import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";

export async function GET(request, { params }) {
  const { cropzoneId } = await params;

  const { response } = await requireAccess({ cropzoneId });
  if (response) return response;

  const { ok, status, body } = await agroFetch(`/cropzones/${cropzoneId}/activities`);
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }
  return Response.json(body);
}

// Logs a real, permanent completed activity against this cropzone in AgroAPI —
// the "record of activity" the whole execution layer exists to produce.
export async function POST(request, { params }) {
  const { cropzoneId } = await params;

  const { user, response } = await requireAccess({ cropzoneId });
  if (response) return response;

  // Only the contractor records work as done; a farmer requesting it is a
  // work order, not an activity.
  if (user.role !== "contractor") {
    return Response.json(
      { error: "Only a contractor can complete work" },
      { status: 403 }
    );
  }

  const { activityTypeId, startDate, note } = await request.json();

  const orgId = user.organization.agro_org_id;
  const path =
    `/cropzones/${cropzoneId}/activities` +
    `?organization_id=${encodeURIComponent(orgId)}`;

  const { ok, status, body } = await agroFetch(path, {
    method: "POST",
    body: JSON.stringify({
      activity_type_id: activityTypeId,
      start_date: `${startDate}T00:00:00Z`,
      note,
    }),
  });

  if (!ok) return Response.json({ error: body }, { status });
  return Response.json(body);
}
