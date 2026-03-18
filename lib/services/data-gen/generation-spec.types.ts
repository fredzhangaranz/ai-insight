/**
 * Type definitions for synthetic data generation
 */

import type { FieldProfileSet } from "./trajectory-field-profile.types";

export type FieldClass = "source-of-truth" | "algorithm-output" | "pure-data";

export type StorageType =
  | "direct_patient"
  | "patient_attribute"
  | "wound_attribute"
  | "encounter_attribute";

export type BrowseMode = "insert" | "update" | "assessment";

export type EntityType = "patient" | "wound" | "assessment_bundle";

export type TargetMode =
  | "all"
  | "generated"
  | "without_assessments"
  | "custom";

export interface TargetSelector {
  mode: TargetMode;
  filter?: string;
  /** When mode is "custom", list of patient IDs to target */
  patientIds?: string[];
}

export interface FormSelector {
  assessmentTypeVersionId: string;
  name: string;
}

export type FieldCriteriaType =
  | "faker"
  | "fixed"
  | "distribution"
  | "range"
  | "ageRange"
  | "options"
  | "reference"
  | "progression";

export interface AgeRangeCriteria {
  type: "ageRange";
  mode: "uniform" | "normal";
  minAge: number;
  maxAge: number;
  mean?: number;
  sd?: number;
}

export interface FakerCriteria {
  type: "faker";
  fakerMethod: string;
  locale?: string;
}

export interface FixedCriteria {
  type: "fixed";
  value: string | number | boolean;
}

export interface DistributionCriteria {
  type: "distribution";
  weights: Record<string, number>;
}

export interface RangeCriteria {
  type: "range";
  min: number | string;
  max: number | string;
}

export interface OptionsCriteria {
  type: "options";
  pickFrom: string[];
  pickCount?: number;
}

export interface ReferenceCriteria {
  type: "reference";
  entity: string;
  filter?: string;
}

export interface ProgressionCriteria {
  type: "progression";
  profile: ProgressionProfile;
}

export type FieldCriteria =
  | FakerCriteria
  | FixedCriteria
  | DistributionCriteria
  | RangeCriteria
  | AgeRangeCriteria
  | OptionsCriteria
  | ReferenceCriteria
  | ProgressionCriteria;

export interface FieldSpec {
  fieldName: string;
  columnName: string;
  dataType: string;
  enabled: boolean;
  criteria: FieldCriteria;
  storageType?: StorageType;
  attributeTypeId?: string;
  assessmentTypeVersionId?: string;
  systemManaged?: boolean;
}

export interface GenerationSpec {
  entity: EntityType;
  count: number;
  /** insert = new rows, update = UPDATE existing rows by target.patientIds */
  mode?: "insert" | "update";
  target?: TargetSelector;
  form?: FormSelector;
  presetId?: string;
  fields: FieldSpec[];
  woundsPerPatient?: number | [number, number];
  assessmentsPerWound?: number | [number, number];
  trajectoryDistribution?: TrajectoryDistribution;
  /** Explicit trajectory per wound slot (Tier 1). Overrides trajectoryDistribution when present. */
  trajectoryAssignments?: SingleTrajectoryType[];
  /** When true, each wound independently gets a random trajectory (Tier 2). Uses uniform distribution. */
  trajectoryRandomisePerPatient?: boolean;
  /** cm², default [5, 50] */
  woundBaselineAreaRange?: [number, number];
  /** default 7 */
  assessmentIntervalDays?: number;
  /** default ±2 */
  assessmentTimingWobbleDays?: number;
  /** default 0.15 */
  missedAppointmentRate?: number;
  /** assessment window: only generate assessments in [start, start+days). Default: last 28 days */
  assessmentPeriodDays?: number;
  assessmentStartDate?: string;
  /** wound assessment only — trajectory-aware field value distributions */
  fieldProfiles?: FieldProfileSet;
}

export type ProgressionTrend = "healing" | "stable" | "deteriorating";

export type WoundProgressionStyle =
  | "JaggedLinear"
  | "Exponential"
  | "JaggedFlat"
  | "NPTraditionalDisposable"
  | "NPDisposable";

/** Trajectory type for explicit per-wound assignment (maps to TrajectoryDistribution keys) */
export type SingleTrajectoryType = "healing" | "stable" | "deteriorating" | "treatmentChange";

export interface TrajectoryDistribution {
  /** fraction 0–1: fast-healing (Exponential) */
  healing: number;
  /** fraction 0–1: chronic non-healing (JaggedFlat) */
  stable: number;
  /** fraction 0–1: slow healing (JaggedLinear) */
  deteriorating: number;
  /** fraction 0–1: NPTraditionalDisposable style */
  treatmentChange: number;
}

export interface ProgressionProfile {
  trend: ProgressionTrend;
  initialRange: [number, number];
  noisePercent: number;
}

export interface CoverageStats {
  total: number;
  nonNull: number;
  coveragePct: number;
}

export interface FieldSchema {
  fieldName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  storageType: StorageType;
  attributeTypeId?: string;
  assessmentTypeVersionId?: string;
  /** PatientNote name (e.g. Details, Medical History) for disambiguating duplicate fieldNames */
  patientNoteName?: string;
  systemManaged?: boolean;
  coverage?: CoverageStats;
  options?: string[];
  min?: number;
  max?: number;
  fieldClass?: FieldClass;
  calculatedValueExpression?: string | null;
}

export interface FormVersionInfo {
  assessmentFormId: string;
  assessmentTypeId: string;
  assessmentFormName: string;
  definitionVersion: number;
  fieldCount: number;
}

export interface VerificationResult {
  check: string;
  result: string | number;
  status: "PASS" | "FAIL" | "WARN";
}

export interface GenerationResult {
  success: boolean;
  insertedCount: number;
  insertedIds: string[];
  verification: VerificationResult[];
  error?: string;
  /** Rollback SQL for update mode; execute to revert field changes */
  rollbackSql?: string[];
  /** Patient IDs that received data (for assessment_bundle); used by validation */
  insertedPatientIds?: string[];
}

export interface DataGenStats {
  patientCount: number;
  generatedPatientCount: number;
  assessmentCountByForm: Array<{
    formName: string;
    count: number;
  }>;
}

export class DependencyMissingError extends Error {
  constructor(
    public dependency: string,
    message: string
  ) {
    super(message);
    this.name = "DependencyMissingError";
  }
}

export class ValidationError extends Error {
  constructor(
    public field: string,
    message: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
