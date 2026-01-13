/**
 * Canonical measurement/time concept keys used across:
 * - ClinicalOntology (concept_name / canonical_name)
 * - Context discovery (metrics)
 * - Template catalog and golden queries
 *
 * 4.S19A focuses on unifying the vocabulary for these concepts so that
 * downstream components (discovery, semantic search, templating) can
 * reason about measurement/time fields consistently.
 */
export type MeasurementConceptKey =
  | "percent_area_reduction"
  | "healing_rate"
  | "time_to_closure"
  | "measurement_date";

/**
 * Mapping from canonical concept keys to the natural phrases we expect to see
 * in questions, templates, and metrics.
 *
 * NOTE:
 * - This is intentionally small and focused on the golden measurement/time
 *   use cases driving 4.S19 (area reduction, healing rate, baseline/time,
 *   wound size over time).
 * - Additional phrases can be added as we observe real customer queries.
 */
export const MEASUREMENT_CONCEPT_SYNONYMS: Record<
  MeasurementConceptKey,
  string[]
> = {
  percent_area_reduction: [
    "percent area reduction",
    "percentage area reduction",
    "area reduction",
    "area change",
    "reduction in area",
    "wound size reduction",
    "reduction in wound size",
  ],
  healing_rate: [
    "healing rate",
    "rate of healing",
    "wound healing rate",
    "speed of healing",
  ],
  time_to_closure: [
    "time to closure",
    "time to heal",
    "time until healed",
    "time from baseline to closure",
    "days to closure",
    "weeks to closure",
  ],
  measurement_date: [
    "measurement date",
    "date of measurement",
    "assessment date",
    "baseline date",
    "timepoint",
    "time point",
    "at 12 weeks",
    "at 52 weeks",
    "days from baseline",
  ],
};

/**
 * Normalize a phrase for comparison:
 * - lower-case
 * - trim and collapse whitespace
 * - strip basic punctuation
 */
function normalizePhrase(phrase: string): string {
  const cleaned = phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

/**
 * Map a natural-language phrase to a canonical measurement concept key,
 * if it matches one of the known synonym sets.
 *
 * This is intentionally permissive: we treat a phrase as matching if the
 * normalized phrase either equals or contains one of the normalized synonyms.
 *
 * 4.S19A only requires the contract/spec; wiring this into the main
 * context discovery flow will happen in 4.S19B/4.S19C.
 */
export function normalizeMeasurementPhraseToConceptKey(
  phrase: string
): MeasurementConceptKey | null {
  if (!phrase || !phrase.trim()) {
    return null;
  }

  const normalized = normalizePhrase(phrase);

  for (const [key, synonyms] of Object.entries(
    MEASUREMENT_CONCEPT_SYNONYMS
  ) as [MeasurementConceptKey, string[]][]) {
    for (const synonym of synonyms) {
      const synonymNorm = normalizePhrase(synonym);
      if (!synonymNorm) continue;

      if (normalized === synonymNorm || normalized.includes(synonymNorm)) {
        return key;
      }
    }
  }

  return null;
}
