// Server-only proxy — keeps AGROAPI_TOKEN out of the browser bundle.
export async function GET() {
  const res = await fetch(`${process.env.AGROAPI_BASE_URL}/activity_types`, {
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
