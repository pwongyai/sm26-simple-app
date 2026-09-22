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

// Canonical storage, rendered per reader.
//
// Areas are stored in m² and prices in THB per m². Nothing stored depends on
// who is looking at it; the unit and currency are applied on the way out and
// undone on the way in. This replaced a migrate-the-data-on-change approach
// that mutated stored values whenever a community switched units — which drifted
// on round trips and, worse, could not fix a value that was already wrong.
//
// THB is the base currency by project decision (2026-09-22). If 1 THB = 800 VND
// ever changes, every VND price on screen changes with it; past reports do not,
// because they freeze their own currency and amount when the work is billed.
export const VND_PER_THB = 800;

export function thbTo(amountThb, currency) {
  const n = Number(amountThb);
  if (!Number.isFinite(n)) return n;
  return currency === "VND" ? n * VND_PER_THB : n;
}

export function toThb(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return n;
  return currency === "VND" ? n / VND_PER_THB : n;
}

// THB/m² -> what the reader sees: their currency, per their area unit.
export function priceOut(thbPerM2, areaUnitM2, currency) {
  const n = Number(thbPerM2);
  if (!Number.isFinite(n)) return null;
  return thbTo(n * (Number(areaUnitM2) || 1), currency);
}

// What the reader typed -> THB/m². Full precision kept: rounding here is what
// makes a price fail to render back as the number the contractor entered.
export function priceIn(displayPrice, areaUnitM2, currency) {
  const n = Number(displayPrice);
  if (!Number.isFinite(n)) return 0;
  return toThb(n, currency) / (Number(areaUnitM2) || 1);
}

// m² -> the reader's unit, and back.
export function areaOut(areaM2, areaUnitM2, digits = 1) {
  const n = Number(areaM2);
  if (!Number.isFinite(n)) return null;
  return Number((n / (Number(areaUnitM2) || 1)).toFixed(digits));
}

export function areaIn(displayArea, areaUnitM2) {
  const n = Number(displayArea);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (Number(areaUnitM2) || 1));
}

// Money as a reader expects to see it: VND has no subunit in practice.
export function roundMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return n;
  return currency === "VND" ? Math.round(n) : Math.round(n * 100) / 100;
}
