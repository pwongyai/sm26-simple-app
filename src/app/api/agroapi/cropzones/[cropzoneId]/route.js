export async function GET(request, { params }) {
  const { cropzoneId } = await params;

  const res = await fetch(`${process.env.AGROAPI_BASE_URL}/cropzones/${cropzoneId}`, {
    headers: { Authorization: `Bearer ${process.env.AGROAPI_TOKEN}` },
  });

  if (!res.ok) {
    return Response.json(
      { error: `AgroAPI returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return Response.json(data);
}
