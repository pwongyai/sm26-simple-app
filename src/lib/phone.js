// One idea of what a phone number is, shared by sign-in and the profile.
//
// These disagreed: login kept a leading "+" and the profile stripped it, so a
// farmer who saved "+84 987 654 321" was stored as "84987654321", typed the
// number back exactly as he had written it, and was told his password was
// wrong. The number is the login, so the two paths cannot each have their own
// opinion (2026-09-22).
//
// Deliberately NOT validated beyond this: no length, no country rule, no
// leading-zero handling. A Vietnamese mobile, a Thai one and an international
// +84 are all written differently and all real, and a rule invented here can
// only lock out a number that exists. The one thing enforced is that it is a
// number, because a name saved into this field locks the account at the next
// sign-in.
//
// What IS normalised is the punctuation people write numbers with — spaces,
// dashes, dots, brackets — so that the same number typed two ways is the same
// account. A "+" is kept, because it is how a country code is written, not
// punctuation.
export function normalizePhone(input) {
  const raw = String(input ?? "").trim();
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? plus + digits : "";
}

// Null when it is fine, otherwise the sentence to show the person.
export function phoneProblem(normalized) {
  if (!normalized) return "Enter your phone number";
  if (!/^\+?\d+$/.test(normalized)) return "A phone number can only contain digits";
  return null;
}
