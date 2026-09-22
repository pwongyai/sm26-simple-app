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
    ? d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

// Within the current season the year is noise — a work list reads "Jun 13".
export function fmtDayMonth(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString([], { day: "numeric", month: "short" }) : "—";
}

export function fmtDateTime(value) {
  const d = toDate(value);
  return d
    ? d.toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
