// The work-type vocabulary: what a contractor picks when defining a service,
// and the two standards that choice resolves to.
//
// A service is free — "ตีเลน 2" at 0 ฿ because it fixes up the first pass is
// how the business actually works, and the app should not try to standardise
// it. The work type is the fixed layer underneath, invisible to the farmer,
// existing only so two machines can agree what a job was.
//
// ONE pick, never two. The contractor chooses an entry below; both the AgroAPI
// activity type and the ADAPT operation code are read off the same row. Asking
// for both would mean knowing two standards in order to price a job.
//
// Direction matters and was measured: mapping AgroAPI -> ADAPT leaves six
// ambiguous groups, one with seven candidates (every land_preparation job would
// have to collapse into one code, so ตีเลน would export as plowing). Going
// ADAPT-first leaves four, and the imprecision lands on the AgroAPI activity
// type — recoverable, because the activity still carries the contractor's own
// free-text name. A wrong ADAPT code goes into the deliverable unseen.
//
// Source of truth for the codes is AgGateway's own
// adapt-data-type-definitions.json, ADAPT Standard v2.0.2 — NOT AgroAPI's copy,
// which still validates against APPLICATION_SOWING_AND_PLANTING, retired in
// v2.0.2 and superseded by APPLICATION_SOWING_AND_PLANTING_SEEDS.
//
// Full reasoning, the version-upgrade procedure and the traps:
// Projects/SM26/WORK_TYPE_MAP.md
export const ADAPT_VERSION = "2.0.2";

// group: how the list is broken up on screen. 19 flat options on a phone is
// unusable; these headings are display only and mean nothing to either standard.
export const WORK_TYPES = [
  // --- Land preparation ---
  { code: "FIELD_PREPARATION_TILLAGE", label: "Plowing / tillage", agro: "land_preparation", group: "Land preparation" },
  { code: "PADDY_MANAGEMENT_PUDDLING", label: "Puddling", agro: "land_preparation", group: "Land preparation" },
  { code: "PADDY_MANAGEMENT_LAND_LEVELING", label: "Paddy leveling", agro: "land_preparation", group: "Land preparation" },
  { code: "PADDY_MANAGEMENT_DITCHING", label: "Ditching", agro: "land_preparation", group: "Land preparation" },
  { code: "PADDY_MANAGEMENT_LEVEE_COATING", label: "Levee coating", agro: "land_preparation", group: "Land preparation" },
  { code: "FIELD_PREPARATION_LAND_LEVELING", label: "Land leveling (upland)", agro: "land_preparation", group: "Land preparation" },
  { code: "FIELD_PREPARATION_GENERAL", label: "Field preparation (other)", agro: "land_preparation", group: "Land preparation" },

  // --- Planting ---
  { code: "APPLICATION_SOWING_AND_PLANTING_SEEDS", label: "Seeding", agro: "planting", group: "Planting" },
  { code: "APPLICATION_TRANSPLANTING", label: "Transplanting", agro: "planting", group: "Planting" },

  // --- Crop care ---
  { code: "APPLICATION_FERTILIZING", label: "Fertilizing", agro: "fertilization", group: "Crop care" },
  { code: "APPLICATION_GENERAL", label: "Soil amendment", agro: "fertilization", group: "Crop care" },
  { code: "APPLICATION_IRRIGATION", label: "Irrigation", agro: "water_supply", group: "Crop care" },
  { code: "PADDY_MANAGEMENT_DRAINAGE", label: "Drainage", agro: "water_supply", group: "Crop care" },

  // --- Harvest ---
  { code: "HARVEST_PRE_HARVEST", label: "Pre-harvest", agro: "harvesting", group: "Harvest" },
  { code: "HARVEST", label: "Harvest", agro: "harvesting", group: "Harvest" },
  { code: "HARVEST_POST_HARVEST", label: "Post-harvest", agro: "straw_management", group: "Harvest" },

  // --- Other. Sorted last: a contractor selling machine work rarely wants these.
  { code: "OBSERVATION_GENERAL", label: "Field observation", agro: "plot_monitoring", group: "Other" },
  { code: "VEHICLE_DATA_COLLECTION_GENERAL", label: "Machine data only", agro: "other", group: "Other" },
  { code: "UNKNOWN", label: "Other / unknown", agro: "other", group: "Other" },
];

const BY_CODE = new Map(WORK_TYPES.map((w) => [w.code, w]));

export function workType(code) {
  return BY_CODE.get(code) || null;
}

// The AgroAPI activity type a work type resolves to. Falls back to "other",
// which is a real AgroAPI type — the same thing an unclassified service got
// before this existed.
export function agroCanonicalFor(code) {
  return BY_CODE.get(code)?.agro || "other";
}

export function isValidWorkType(code) {
  return BY_CODE.has(code);
}

// For the picker: entries in display order, grouped, headings preserved.
export function groupedWorkTypes() {
  const order = ["Land preparation", "Planting", "Crop care", "Harvest", "Other"];
  return order
    .map((group) => ({ group, items: WORK_TYPES.filter((w) => w.group === group) }))
    .filter((g) => g.items.length);
}

// Which machine kinds do fieldwork a report can be made for, and what a report
// defaults to when the contractor has not chosen a service yet.
//
// Both were deleted with the old work-type list in "Ask what kind of work a
// service is" (1094d58) while /api/reports/preview still imported them, which
// broke the report preview outright — the screen nobody reached again until
// the Huong Ngai walk (2026-09-23).
export const MACHINE_KIND_DEFAULT_CANONICAL = {
  tractor: "land_preparation",
  harvester: "harvesting",
  planter: "planting",
};

// A utility vehicle, grain dryer, quality analyzer or greenhouse controller
// never does work a field report should be written for. Refused outright
// rather than silently defaulting to an unrelated service.
export const NO_FIELDWORK_KINDS = [
  "utility_vehicle",
  "grain_dryer",
  "grain_quality_analyzer",
  "green_house_controller",
];

export function doesFieldwork(kind) {
  return !NO_FIELDWORK_KINDS.includes(kind);
}

export function defaultCanonicalForKind(kind) {
  return MACHINE_KIND_DEFAULT_CANONICAL[kind] || null;
}
