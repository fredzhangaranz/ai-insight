/**
 * Trajectory Selector Utility
 * Determines which trajectory profiles are actually needed based on the config.
 * Supports three modes:
 * - Tier 1: Single trajectory (one wound, one selected type)
 * - Tier 2: Explicit per-wound assignments (multiple wounds, each assigned a trajectory)
 * - Tier 3: Randomise per patient (needs all trajectories; marked probabilistic)
 */

import type { SingleTrajectoryType } from "./generation-spec.types";
import type { WoundProgressionStyle } from "./generation-spec.types";

/**
 * Map from SingleTrajectoryType to WoundProgressionStyle
 */
export const TRAJECTORY_TYPE_TO_STYLE: Record<SingleTrajectoryType, WoundProgressionStyle> = {
  healing: "Exponential",
  stable: "JaggedFlat",
  deteriorating: "JaggedLinear",
  treatmentChange: "NPTraditionalDisposable",
};

export const ALL_PROGRESSION_STYLES: WoundProgressionStyle[] = [
  "Exponential",
  "JaggedLinear",
  "JaggedFlat",
  "NPTraditionalDisposable",
];

export interface TrajectorySelectionResult {
  /** Styles to generate (subset of ALL_PROGRESSION_STYLES) */
  selectedStyles: WoundProgressionStyle[];
  /** True if random selection happens at generation time (needs all styles) */
  isRandomised: boolean;
  /** Human-readable description of the selection */
  description: string;
}

/**
 * Determine which trajectory profiles are needed based on the config.
 *
 * @param trajectoryAssignments Explicit per-wound assignments (Tier 1/2)
 * @param trajectoryRandomisePerPatient If true, randomise mode is enabled (Tier 3)
 * @returns Object containing selected styles and metadata
 */
export function selectRequiredTrajectories(
  trajectoryAssignments?: SingleTrajectoryType[],
  trajectoryRandomisePerPatient?: boolean
): TrajectorySelectionResult {
  // Tier 3: Randomise per patient
  if (trajectoryRandomisePerPatient) {
    return {
      selectedStyles: ALL_PROGRESSION_STYLES,
      isRandomised: true,
      description:
        "Randomised per patient: all trajectory types needed (each wound gets random trajectory at generation time)",
    };
  }

  // Tier 1/2: Explicit assignments
  if (trajectoryAssignments && trajectoryAssignments.length > 0) {
    const uniqueTypes = new Set(trajectoryAssignments);
    const selectedStyles = Array.from(uniqueTypes)
      .map((type) => TRAJECTORY_TYPE_TO_STYLE[type])
      .filter((style) => style !== undefined);

    const typeList = Array.from(uniqueTypes).join(", ");
    const styleList = selectedStyles.join(", ");

    return {
      selectedStyles,
      isRandomised: false,
      description:
        trajectoryAssignments.length === 1
          ? `Single trajectory: ${typeList} (${styleList})`
          : `Multiple wounds assigned: ${typeList}. Generating ${selectedStyles.length} profile(s): ${styleList}`,
    };
  }

  // Fallback: if neither is set, return all (shouldn't happen in practice)
  return {
    selectedStyles: ALL_PROGRESSION_STYLES,
    isRandomised: false,
    description: "No selection made; generating all trajectory types",
  };
}
