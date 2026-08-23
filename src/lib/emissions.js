// CO2 emission factors per litre of fuel burned — Japan's Ministry of the
// Environment reference table (単位当たり二酸化炭素排出量), the appropriate
// source given this app is a NARO-funded Japanese government proof-of-
// concept, not a generic industry rule of thumb:
//   軽油 (diesel)   2.619 kg-CO2/L
//   ガソリン (gasoline) 2.322 kg-CO2/L
// Resolved by the machine's own fuel type (machine_settings.fuel_type, see
// resolveFuel in machineRates.js) — replaces the old single org-wide
// organizations.emission_kg_per_l constant (2.68, an unsourced generic
// figure), which is no longer read by report calculation. That column and
// its dead settings route stay in place only for historical frozen
// reports written before this fix.
export const EMISSION_KG_PER_L = {
  diesel: 2.619,
  gasoline: 2.322,
};

export function emissionKgPerLForFuelType(fuelType) {
  return EMISSION_KG_PER_L[fuelType] ?? EMISSION_KG_PER_L.diesel;
}
