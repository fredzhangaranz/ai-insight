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
} from "./trajectory-field-profile.types";
import type { WoundProgressionStyle } from "./generation-spec.types";

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
    if (
      (f.dataType === "SingleSelectList" || f.dataType === "MultiSelectList") &&
      f.options &&
      f.options.length > 0
    ) {
      const weights: Record<string, number> = {};
      const w = 1 / f.options.length;
      for (const opt of f.options) {
        weights[opt] = w;
      }
      fieldDistributions.push({
        fieldName: f.fieldName,
        columnName: f.columnName,
        weights,
      });
    }
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
  const selectableFields = new Map(
    schema
      .filter(
        (field) =>
          (field.dataType === "SingleSelectList" ||
            field.dataType === "MultiSelectList") &&
          field.options &&
          field.options.length > 0
      )
      .map((field) => [field.columnName, field])
  );

  return profiles.map((profile) => ({
    ...profile,
    phases: profile.phases.map((phase) => ({
      ...phase,
      fieldDistributions: phase.fieldDistributions.flatMap((distribution) => {
        const field = selectableFields.get(distribution.columnName);
        if (!field?.options?.length) return [];

        return [
          {
            fieldName: field.fieldName,
            columnName: field.columnName,
            weights: sanitizeDistributionWeights(
              distribution.weights,
              field.options
            ),
          },
        ];
      }),
    })),
  }));
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
