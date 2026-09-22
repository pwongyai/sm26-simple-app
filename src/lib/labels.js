// What a job card is called.
//
// Ruang Kaeo has many farmers with a field or two each, so the customer's name
// told you which job you were looking at. Hương Ngải is the other shape: one
// farmer, eleven fields. Every card there read "Mr. Trung", and the only thing
// separating two jobs on screen was their area (2026-09-23).
//
// The field comes first because it is the thing that differs when the name
// does not. A job written down before its field is known has no field yet, and
// then the owner stands alone.
export function fieldAndOwner(fieldName, ownerName) {
  const owner = ownerName || "—";
  return fieldName ? `${fieldName}, ${owner}` : owner;
}
