// Currencies and area units a farming community can be set to.
//
// Both belong to the COMMUNITY, not to the contractor — review item R4:
// "contractor-side currency and area units follow the served farm
// organization, so no separate contractor-side settings are needed". One
// community bills in one currency and measures in one unit; a contractor and a
// farmer looking at the same field must never disagree about what it measures.
//
// An area unit is two things that must move together: the label people read,
// and how many square metres it is. Machines measure m²; people think in sào or
// rai. Setting one without the other is how a field ends up reading 10.1 in a
// column labelled sào — so the picker writes both from a single choice, the
// same pattern as the work-type picker.
//
// The labels here are the neutral/ASCII spellings. Under the language design
// (PROGRESS.md) a Vietnamese reader should see "đồng" and "sào" and a Thai
// reader "บาท" and "ไร่" — that is a translation of the LABEL, applied at
// display time. What is stored is the currency code and the m² value, which is
// the thing itself.

export const CURRENCIES = [
  { code: "THB", label: "THB", note: "Thai baht" },
  { code: "VND", label: "VND", note: "Vietnamese dong" },
];

export const AREA_UNITS = [
  { unit: "m²", m2: 1, note: "square metres" },
  { unit: "ha", m2: 10000, note: "hectare" },
  { unit: "rai", m2: 1600, note: "Thailand" },
  { unit: "sào", m2: 360, note: "northern Vietnam" },
];

export function areaUnit(unit) {
  return AREA_UNITS.find((u) => u.unit === unit) || null;
}

export function isValidCurrency(code) {
  return CURRENCIES.some((c) => c.code === code);
}

export function isValidAreaUnit(unit) {
  return AREA_UNITS.some((u) => u.unit === unit);
}

// Converting stored values when a community changes its settings.
//
// THE BOUNDARY THAT MATTERS: only LIVE settings convert. Frozen history never
// does — every work_reports row carries its own `currency` and `unit_label`
// captured at the moment the work was billed, so a past report keeps reading
// exactly as the farmer was charged. Converting one would rewrite what someone
// actually paid, which is not a display preference, it is falsifying a record.
//
//   convert        services.price_per_unit, work_orders.crop_size_rai
//   never touch    work_reports.* — price_per_unit, service_charge,
//                  field_area_units, work_area_units
//
// The rate is a fixed conversion applied once, at the moment of switching, not
// a live exchange rate. It will drift from the market; that is accepted. Round
// trips do not land back exactly (VND carries no decimals in practice), so
// switching back and forth compounds rounding — noted rather than solved,
// because a community changes this approximately never.
export const THB_PER_VND = 1 / 800; // 1 THB = 800 VND

export function convertMoney(amount, fromCurrency, toCurrency) {
  const n = Number(amount);
  if (!Number.isFinite(n) || fromCurrency === toCurrency) return n;
  if (fromCurrency === "THB" && toCurrency === "VND") return n * 800;
  if (fromCurrency === "VND" && toCurrency === "THB") return n / 800;
  return n;
}

// A PRICE is per unit of area, so it moves opposite to an area measurement.
// 700 THB per rai (1,600 m²) is 157.5 THB per sào (360 m²) — the same money
// for the same ground. Getting this backwards silently multiplies every bill.
export function convertPricePerUnit(price, fromM2, toM2) {
  const n = Number(price);
  if (!Number.isFinite(n) || !fromM2 || !toM2 || fromM2 === toM2) return n;
  return n * (toM2 / fromM2);
}

// An AREA measurement moves with the unit: 10.1 rai is 44.9 sào.
export function convertArea(area, fromM2, toM2) {
  const n = Number(area);
  if (!Number.isFinite(n) || !fromM2 || !toM2 || fromM2 === toM2) return n;
  return n * (fromM2 / toM2);
}

// Money is rounded to what the currency actually uses: VND has no subunit in
// practice, THB has satang but prices here are whole baht.
export function roundMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return n;
  return currency === "VND" ? Math.round(n) : Math.round(n * 100) / 100;
}
