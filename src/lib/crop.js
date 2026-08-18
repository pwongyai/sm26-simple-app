// How a crop reads on screen.
//
// AgroAPI stores a crop as a species plus a variety, and both can be the
// placeholder "unspecified". A variety of "generic" means the species was
// chosen but no cultivar — worth knowing, because AgroAPI's crop engine only
// predicts maturity once a real variety is set.
export function cropLabel(crop) {
  const species = crop?.name_i18n?.en || crop?.name || "";
  const variety = crop?.variety_i18n?.en || crop?.variety || "";

  const placeholder = (v) =>
    !v || ["unspecified", "generic"].includes(v.toLowerCase());

  if (placeholder(species)) return "Crop not recorded";
  const nice = species.charAt(0).toUpperCase() + species.slice(1);
  return placeholder(variety) ? nice : `${nice} — ${variety}`;
}
