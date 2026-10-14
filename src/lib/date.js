import { currentLanguage } from "@/lib/i18n";

// How a date is written on screen, in one place.
//
// Eight screens called `toLocaleDateString()` with no options and got the
// browser's own format — "7/7/2026" — while the rest asked for a short month
// and got "Jul 7, 2026". The same planting date therefore read two ways on two
// screens of the same app (2026-09-22).
//
// It also matters for the translation pass: a date is a string a reader has to
// parse, and 7/7 is ambiguous in a way "Jul 7" is not. When languages land,
// this is the one function that has to learn about them.

// The locale each language is written in. `toLocaleDateString([])` was asking
// the BROWSER for its locale, not the app — so a Thai contractor whose phone
// is set to English read "Nov 10, 2025" on an otherwise Thai screen. The note
// above said this is the one function that has to learn about languages when
// they land; it never did (2026-10-15).
//
// Thai is pinned to the Gregorian calendar. `th-TH` defaults to the Buddhist
// era, which would print 2568 for 2025 — correct Thai, but every other date in
// this system (AgroAPI, the work orders, the reports) is Gregorian, and one
// screen disagreeing by 543 years is worse than an unfamiliar era. Change
// `-u-ca-gregory` to switch.
const LOCALES = { en: "en", th: "th-TH-u-ca-gregory", vn: "vi" };

function locale() {
  return LOCALES[currentLanguage()] || "en";
}

// A plain "YYYY-MM-DD" is parsed by Date as UTC midnight, which lands on the
// previous day anywhere west of Greenwich. Appending a time makes it local,
// which is what every caller means by a bare date.
function toDate(value) {
  if (!value) return null;
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value) {
  const d = toDate(value);
  return d
    ? d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

// Within the current season the year is noise — a work list reads "Jun 13".
export function fmtDayMonth(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(locale(), { day: "numeric", month: "short" }) : "—";
}

export function fmtDateTime(value) {
  const d = toDate(value);
  return d
    ? d.toLocaleString(locale(), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

// A calendar's own heading: "September 2026".
export function fmtMonthYear(value) {
  const d = value instanceof Date ? value : toDate(value);
  return d ? d.toLocaleDateString(locale(), { month: "long", year: "numeric" }) : "—";
}

export function fmtTime(value) {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : "—";
}

// "Thu 16 Oct" — a forecast column's own heading.
export function fmtWeekdayDay(value) {
  const d = toDate(value);
  return d
    ? d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" })
    : "—";
}

// The calendar's column headings, Sunday first. Derived from the locale rather
// than the hardcoded ["S","M","T","W","T","F","S"] that sat in OrderCalendar —
// those are English initials, and two of them are "T" even in English. Any
// 2021 week works as the source; only the weekday matters.
export function weekdayInitials() {
  const fmt = new Intl.DateTimeFormat(locale(), { weekday: "narrow" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2021, 7, 1 + i))));
}
