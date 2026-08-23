import { requireAccess } from "@/lib/ownership";

// Read-only site context for the contractor's own UI: which org they're in,
// and the currency/area unit every price and area on screen is expressed in.
//
// This used to also GET/PATCH an org-wide emissions factor
// (organizations.emission_kg_per_l, 2.68). That is gone: emissions now
// resolve per machine from its real fuel type (src/lib/emissions.js, Japan
// MOE factors — diesel 2.619, gasoline 2.322), so a single org-wide number
// was both unsourced and wrong for a gasoline machine. The PATCH had no
// caller left after the Settings page's Emissions section was removed, so
// it went with it rather than sitting here as a way to write a value
// nothing reads. The column was then DROPPED — an earlier note here claimed
// it "stays for historical frozen reports", which was wrong: frozen reports
// carry their own work_reports.emission_kg_per_l, which is what preserves
// history. See DATABASE_ERD.md.
export async function GET() {
  const { user, response } = await requireAccess();
  if (response) return response;

  return Response.json({
    organization: user.organization.name,
    currency: user.organization.currency,
    areaUnit: user.organization.area_unit,
  });
}
