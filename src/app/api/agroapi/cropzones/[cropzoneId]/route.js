import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";

export async function GET(request, { params }) {
  const { cropzoneId } = await params;
  const force = new URL(request.url).searchParams.get("refresh") === "1";

  // Gate first: never reach AgroAPI on behalf of someone who doesn't own this.
  const { response } = await requireAccess({ cropzoneId });
  if (response) return response;

  const { ok, status, body } = await cached(
    `cropzone:${cropzoneId}`,
    TTL.cropzone,
    () => agroFetch(`/cropzones/${cropzoneId}`),
    { force }
  );
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }
  return Response.json(body, { headers: cacheHeaders(TTL.cropzone) });
}
