import { requireAccess } from "@/lib/ownership";
import { agroFetch } from "@/lib/agroapi";
import { cached, cacheHeaders, TTL } from "@/lib/cache";

// AgroAPI's crop catalog, grouped into species → varieties.
//
// The catalog is a flat list of species+variety pairs, paginated 50 at a time
// and long: rice alone has 56 varieties and doesn't appear until page 7. So a
// naive first-page fetch finds no rice at all — every page has to be walked.
// It's effectively static, so this is cached for a day.
const PAGE_SIZE = 50;
const MAX_PAGES = 30;

export async function GET() {
  const { response } = await requireAccess();
  if (response) return response;

  const crops = await cached("catalog:crops", TTL.catalog, async () => {
    const all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { ok, body } = await agroFetch(`/crops?page=${page}`);
      if (!ok || !Array.isArray(body) || body.length === 0) break;
      all.push(...body);
      if (body.length < PAGE_SIZE) break;
    }

    const bySpecies = new Map();
    for (const c of all) {
      const species = c.name_i18n?.en || c.name || "";
      if (!species || species.toLowerCase() === "unspecified") continue;

      const entry = bySpecies.get(species.toLowerCase()) || {
        species: species.charAt(0).toUpperCase() + species.slice(1),
        varieties: [],
      };
      entry.varieties.push({
        id: c.id,
        // "generic" is AgroAPI's stand-in for "this species, no cultivar
        // named". Kept, but labelled honestly — and worth knowing that
        // AgroAPI's crop engine won't predict maturity from it.
        variety: c.variety_i18n?.en || c.variety || "generic",
      });
      bySpecies.set(species.toLowerCase(), entry);
    }

    return [...bySpecies.values()]
      .map((s) => ({
        ...s,
        varieties: s.varieties.sort((a, b) => a.variety.localeCompare(b.variety)),
      }))
      .sort((a, b) => a.species.localeCompare(b.species));
  });

  return Response.json(crops, { headers: cacheHeaders(TTL.catalog) });
}
