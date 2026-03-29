/**
 * Deterministic trajectory field profile fallback.
 * Client-safe: no Node-only or AI provider imports.
 * Used when AI profile generation fails or when building profiles in the browser.
 */

import type { FieldSchema } from "./generation-spec.types";
import type {
  FieldProfileSet,
  TrajectoryFieldProfile,
  TrajectoryPhaseProfile,
  PhaseFieldDistribution,
  TrajectoryPhase,
  FieldValueBehavior,
} from "./trajectory-field-profile.types";
import type { WoundProgressionStyle } from "./generation-spec.types";
import { suggestFieldBehavior } from "./field-classifier.service";

const TRAJECTORY_STYLES: WoundProgressionStyle[] = [
  "Exponential",
  "JaggedLinear",
  "JaggedFlat",
  "NPTraditionalDisposable",
];

const TRAJECTORY_DESCRIPTIONS: Record<WoundProgressionStyle, string> = {
  Exponential:
    "Fast-healing wound — area halves every ~2 weeks, typically healed within 4 weeks",
  JaggedLinear:
    "Slow healing — gradual improvement over time, may not fully heal within assessment period",
  JaggedFlat:
    "Non-healing / chronic — wound area stable or increasing, no improvement",
  NPTraditionalDisposable:
    "Treatment change — starts flat/deteriorating, then area decreases after treatment switch",
  NPDisposable:
    "Treatment change variant — similar to NPTraditionalDisposable",
};

export function getProfileFieldOptions(field: FieldSchema): string[] | null {
  if (field.dataType === "Boolean") {
    return ["true", "false"];
  }

  if (
    (field.dataType === "SingleSelectList" || field.dataType === "MultiSelectList") &&
    field.options &&
    field.options.length > 0
  ) {
    return field.options;
  }

  return null;
}

function buildUniformWeights(options: string[]): Record<string, number> {
  const weights: Record<string, number> = {};
  const weight = 1 / options.length;

  for (const option of options) {
    weights[option] = weight;
  }

  return weights;
}

/**
 * Deterministic fallback when AI fails. Equal weights over all options.
 */
export function buildFallbackProfiles(
  formSchema: FieldSchema[]
): FieldProfileSet {
  const schema = formSchema.filter((f) => f.dataType !== "ImageCapture");
  return TRAJECTORY_STYLES.map((style) =>
    buildSingleFallbackProfile(style, schema)
  );
}

export function buildSingleFallbackProfile(
  style: WoundProgressionStyle,
  schema: FieldSchema[]
): TrajectoryFieldProfile {
  return {
    trajectoryStyle: style,
    clinicalSummary: TRAJECTORY_DESCRIPTIONS[style],
    phases: (["early", "mid", "late"] as const).map((phase) =>
      buildFallbackPhase(phase, schema)
    ),
  };
}

export function buildFallbackPhase(
  phase: TrajectoryPhase,
  schema: FieldSchema[]
): TrajectoryPhaseProfile {
  const fieldDistributions: PhaseFieldDistribution[] = [];

  for (const f of schema) {
    const options = getProfileFieldOptions(f);
    if (!options?.length) continue;

    const suggestion = suggestFieldBehavior(f);
    fieldDistributions.push({
      fieldName: f.fieldName,
      columnName: f.columnName,
      weights: buildUniformWeights(options),
      behavior: suggestion.behavior,
      recommendedBehavior: suggestion.behavior,
      behaviorConfidence: suggestion.confidence,
      behaviorRationale: suggestion.rationale,
    });
  }

  return {
    phase,
    description: `${phase} phase`,
    fieldDistributions,
  };
}

export function sanitizeFieldProfiles(
  profiles: FieldProfileSet,
  schema: FieldSchema[]
): FieldProfileSet {
  const profiledFields = new Map(
    schema
      .filter((field) => getProfileFieldOptions(field)?.length)
      .map((field) => [field.columnName, field])
  );

  return profiles.map((profile) =>
    sanitizeProfile(profile, profiledFields)
  );
}

function sanitizeProfile(
  profile: TrajectoryFieldProfile,
  profiledFields: Map<string, FieldSchema>
): TrajectoryFieldProfile {
  const canonical = new Map<
    string,
    {
      field: FieldSchema;
      behavior: FieldValueBehavior;
      recommendedBehavior: FieldValueBehavior;
      behaviorConfidence: number;
      behaviorRationale: string;
      weightsByPhase: Map<TrajectoryPhase, Record<string, number>>;
    }
  >();

  for (const phase of profile.phases) {
    for (const distribution of phase.fieldDistributions) {
      const field = profiledFields.get(distribution.columnName);
      const options = field ? getProfileFieldOptions(field) : null;
      if (!field || !options?.length) continue;

      const suggestion = suggestFieldBehavior(field);
      const current = canonical.get(field.columnName);
      const weights = sanitizeDistributionWeights(distribution.weights, options);
      const behavior = sanitizeBehavior(distribution.behavior);
      const recommendedBehavior =
        sanitizeBehavior(distribution.recommendedBehavior) ?? suggestion.behavior;
      const behaviorConfidence = sanitizeConfidence(
        distribution.behaviorConfidence,
        suggestion.confidence
      );
      const behaviorRationale =
        sanitizeRationale(distribution.behaviorRationale) ?? suggestion.rationale;

      if (!current) {
        canonical.set(field.columnName, {
          field,
          behavior: behavior ?? recommendedBehavior,
          recommendedBehavior,
          behaviorConfidence,
          behaviorRationale,
          weightsByPhase: new Map([[phase.phase, weights]]),
        });
        continue;
      }

      current.weightsByPhase.set(phase.phase, weights);
    }
  }

  for (const field of profiledFields.values()) {
    if (canonical.has(field.columnName)) continue;

    const options = getProfileFieldOptions(field);
    if (!options?.length) continue;

    const suggestion = suggestFieldBehavior(field);
    const fallbackWeights = buildUniformWeights(options);

    canonical.set(field.columnName, {
      field,
      behavior: suggestion.behavior,
      recommendedBehavior: suggestion.behavior,
      behaviorConfidence: suggestion.confidence,
      behaviorRationale: suggestion.rationale,
      weightsByPhase: new Map([
        ["early", { ...fallbackWeights }],
        ["mid", { ...fallbackWeights }],
        ["late", { ...fallbackWeights }],
      ]),
    });
  }

  return {
    ...profile,
    phases: profile.phases.map((phase) => ({
      ...phase,
      fieldDistributions: buildSanitizedPhaseDistributions(phase.phase, canonical),
    })),
  };
}

function buildSanitizedPhaseDistributions(
  phase: TrajectoryPhase,
  canonical: Map<
    string,
    {
      field: FieldSchema;
      behavior: FieldValueBehavior;
      recommendedBehavior: FieldValueBehavior;
      behaviorConfidence: number;
      behaviorRationale: string;
      weightsByPhase: Map<TrajectoryPhase, Record<string, number>>;
    }
  >
): PhaseFieldDistribution[] {
  const sanitized: PhaseFieldDistribution[] = [];

  for (const entry of canonical.values()) {
    const weights =
      entry.behavior === "per_wound"
        ? getCanonicalPerWoundWeights(entry)
        : entry.weightsByPhase.get(phase);
    if (!weights) continue;

    sanitized.push({
      fieldName: entry.field.fieldName,
      columnName: entry.field.columnName,
      weights,
      behavior: entry.behavior,
      recommendedBehavior: entry.recommendedBehavior,
      behaviorConfidence: entry.behaviorConfidence,
      behaviorRationale: entry.behaviorRationale,
    });
  }

  return sanitized;
}

function getCanonicalPerWoundWeights(entry: {
  weightsByPhase: Map<TrajectoryPhase, Record<string, number>>;
}): Record<string, number> | undefined {
  return (
    entry.weightsByPhase.get("early") ??
    entry.weightsByPhase.get("mid") ??
    entry.weightsByPhase.get("late")
  );
}

function sanitizeDistributionWeights(
  weights: Record<string, number>,
  options: string[]
): Record<string, number> {
  const positiveEntries = options
    .map((option) => [option, Number(weights[option] ?? 0)] as const)
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0);

  if (positiveEntries.length === 0) {
    const equalWeight = 1 / options.length;
    return Object.fromEntries(options.map((option) => [option, equalWeight]));
  }

  const totalWeight = positiveEntries.reduce(
    (sum, [, weight]) => sum + weight,
    0
  );
  const normalized = Object.fromEntries(options.map((option) => [option, 0]));

  for (const [option, weight] of positiveEntries) {
    normalized[option] = weight / totalWeight;
  }

  return normalized;
}

function sanitizeBehavior(
  behavior: unknown
): FieldValueBehavior | undefined {
  if (
    behavior === "per_assessment" ||
    behavior === "per_wound" ||
    behavior === "system"
  ) {
    return behavior;
  }

  return undefined;
}

function sanitizeConfidence(
  confidence: unknown,
  fallback: number
): number {
  const numeric = Number(confidence);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function sanitizeRationale(rationale: unknown): string | undefined {
  const text = String(rationale ?? "").trim();
  return text.length > 0 ? text : undefined;
}
