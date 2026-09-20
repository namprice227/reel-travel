import { countryName, type CandidatePlace } from "@reel/contracts";

export const SOURCE_CATEGORY_NAMES = { food: "Food & drink", attraction: "Attractions", other: "Other" } as const;

/** Conflicting countries stay unresolved; never silently pick one source over another. */
export function sourceLabels(place: CandidatePlace, inspirationId?: string) {
  const labels = place.evidence.filter(e => !inspirationId || e.inspirationId === inspirationId)
    .flatMap(e => e.classification ? [e.classification] : []);
  const countries = [...new Set(labels.flatMap(label => label.country ? [label.country.code] : []))];
  const code = countries.length === 1 ? countries[0]! : null;
  return {
    present: labels.length > 0,
    countryCode: code,
    country: code ? countryName(code) : "Unsorted",
    conflictingCountry: countries.length > 1,
    categories: [...new Set(labels.flatMap(label => label.category ? [SOURCE_CATEGORY_NAMES[label.category.value]] : []))],
  };
}
