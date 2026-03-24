/**
 * Types for trajectory-aware field profiles
 * Used to generate semantically coherent wound assessment field values
 */

export type TrajectoryPhase = "early" | "mid" | "late";

export interface PhaseFieldDistribution {
  fieldName: string;
  columnName: string;
  /** option value → relative weight (non-negative; proportions are normalized when sampling) */
  weights: Record<string, number>;
}

export interface TrajectoryPhaseProfile {
  phase: TrajectoryPhase;
  /** e.g. "Weeks 1–3: active wound, heavy exudate" */
  description: string;
  fieldDistributions: PhaseFieldDistribution[];
}

/** One profile per WoundProgressionStyle */
export interface TrajectoryFieldProfile {
  trajectoryStyle: string;
  /** e.g. "Fast-healing wound — area halves each 2 weeks" */
  clinicalSummary: string;
  phases: TrajectoryPhaseProfile[];
}

export type FieldProfileSet = TrajectoryFieldProfile[];
