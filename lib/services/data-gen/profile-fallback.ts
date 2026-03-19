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
    phases: ["early", "mid", "late"].map((phase) =>
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
