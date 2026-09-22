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
