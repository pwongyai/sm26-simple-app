export async function GET(request, { params }) {
  const { cropzoneId } = await params;

  const res = await fetch(
    `${process.env.AGROAPI_BASE_URL}/cropzones/${cropzoneId}/activities`,
    { headers: { Authorization: `Bearer ${process.env.AGROAPI_TOKEN}` } }
  );

  if (!res.ok) {
    return Response.json(
      { error: `AgroAPI returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return Response.json(data);
}

// Logs a real, permanent completed activity against this cropzone in AgroAPI.
export async function POST(request, { params }) {
  const { cropzoneId } = await params;
  const { activityTypeId, startDate, note, organizationId } = await request.json();

  const url = new URL(
    `${process.env.AGROAPI_BASE_URL}/cropzones/${cropzoneId}/activities`
  );
  if (organizationId) url.searchParams.set("organization_id", organizationId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AGROAPI_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      activity_type_id: activityTypeId,
      start_date: `${startDate}T00:00:00Z`,
      note,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return Response.json({ error: data }, { status: res.status });
  }
  return Response.json(data);
}
