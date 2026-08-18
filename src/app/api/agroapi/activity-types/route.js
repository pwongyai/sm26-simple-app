import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";

// A shared vocabulary, not anyone's data — but still signed-in only, so the
// token can't be used as a free proxy by an anonymous visitor.
export async function GET() {
  const { response } = await requireAccess();
  if (response) return response;

  const { ok, status, body } = await cached("catalog:activity_types", TTL.catalog, () =>
    agroFetch("/activity_types")
  );
  if (!ok) {
    return Response.json({ error: `AgroAPI returned ${status}` }, { status });
  }
  return Response.json(body, { headers: cacheHeaders(TTL.catalog) });
}
