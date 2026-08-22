// Work type assignment — version 1 (deterministic, by machine kind alone).
// Version 2 (real per-implement/context logic) waits for the ADAPT phase —
// see LOGIC_SPEC.md §2 for the full design note.
//
// `kind` is AgroAPI's own NoukiSensor enum — confirmed live against
// Tools/agroapi-master: tractor, harvester, planter, utility_vehicle,
// grain_dryer, grain_quality_analyzer, green_house_controller. There is no
// "sprayer" kind — deliberately not modeled here; a sprayer is some other
// kind (typically tractor) with a sprayer implement attached, out of scope
// for this version.

// Machine kind -> the service this org's own price list should default to,
// by its AgroAPI activity_canonical. A kind not in this map does no
// fieldwork at all (see NO_FIELDWORK_KINDS) and gets no default.
export const MACHINE_KIND_DEFAULT_CANONICAL = {
  tractor: "land_preparation",
  harvester: "harvesting",
  planter: "planting",
};

// These machine kinds never do fieldwork a report should be generated
// for — a utility/service vehicle, a grain dryer, a lab analyzer, a
// greenhouse controller. Select Area/report creation refuses them outright
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
