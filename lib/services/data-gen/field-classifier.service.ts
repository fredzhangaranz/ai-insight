/**
 * Field Classifier Service
 * Classifies fields into source-of-truth, algorithm-output, or pure-data
 */

import type { FieldClass } from "./generation-spec.types";
import type { FieldSchema } from "./generation-spec.types";
import type { FieldValueBehavior } from "./trajectory-field-profile.types";

const PHYSICAL_COLUMN_CLASSES: Record<string, Record<string, FieldClass>> = {
  Outline: {
    points: "source-of-truth",
    lengthAxis_location: "source-of-truth",
    widthAxis_location: "source-of-truth",
    imageCaptureFk: "source-of-truth",
    area: "algorithm-output",
    perimeter: "algorithm-output",
    volume: "algorithm-output",
    maxDepth: "algorithm-output",
    avgDepth: "algorithm-output",
  },
};

/**
 * Classify a physical database column (e.g. dbo.Outline.area)
 */
export function classifyPhysicalColumn(
  tableName: string,
  columnName: string
): FieldClass {
  const tableClasses = PHYSICAL_COLUMN_CLASSES[tableName];
  if (tableClasses && columnName in tableClasses) {
    return tableClasses[columnName];
  }

  if (columnName.endsWith("Fk") || columnName.endsWith("_fk")) {
    return "source-of-truth";
  }

  const lower = columnName.toLowerCase();
  if (
    lower.includes("image") ||
    lower === "points" ||
    lower.includes("blob")
  ) {
    return "source-of-truth";
  }

  return "pure-data";
}

const WOUND_MEASUREMENT_VARIABLES = new Set([
  "area",
  "perimeter",
  "depth",
  "volume",
  "wound_area",
  "wound_perimeter",
  "wound_depth",
  "wound_volume",
  "woundstate",
  "wound_state",
  "ishealed",
  "isamputated",
  "dayssincebaseline",
  "days_since_baseline",
  "isbaseline",
]);

/**
 * Classify a form field (AttributeType) based on calculatedValueExpression
 */
export function classifyFormField(
  columnName: string,
  calculatedValueExpression: string | null | undefined
): FieldClass {
  if (columnName.endsWith("Fk") || columnName.endsWith("_fk")) {
    return "source-of-truth";
  }

  if (WOUND_MEASUREMENT_VARIABLES.has(columnName.toLowerCase())) {
    return "algorithm-output";
  }

  if (
    calculatedValueExpression != null &&
    String(calculatedValueExpression).trim() !== ""
  ) {
    return "algorithm-output";
  }

  return "pure-data";
}

/** Column/field name patterns for attributes fixed per wound (e.g. wound type, etiology) */
const FIXED_PER_WOUND_PATTERNS = [
  "etiology",
  "woundtype",
  "wound_type",
  "wound type",
  "woundclassification",
  "wound_classification",
  "woundtypeid",
  "wound_type_id",
];

const SYSTEM_CONTROLLED_PATTERNS = [
  "woundstate",
  "wound_state",
  "healingstatus",
  "healing_status",
  "woundstatus",
  "wound_status",
];

const PER_WOUND_PATTERNS = [
  ...FIXED_PER_WOUND_PATTERNS,
  "wound occurrence",
  "wound_occurrence",
  "woundoccurrence",
  "present on admission",
  "present_on_admission",
  "presentonadmission",
  "poa",
  "hospital acquired",
  "hospital_acquired",
  "onset date",
  "onset_date",
  "onsetdate",
  "leg ulcer type",
  "leg_ulcer_type",
  "legulcertype",
  "diabetic foot ulcer type",
  "diabetic_foot_ulcer_type",
  "diabeticfootulcertype",
  "dfu type",
  "dfu_type",
];

export const WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY =
  "56A71C1C-214E-46AD-8A74-BB735AB87B39";

/**
 * Returns true if this field should have the same value across all assessments of a wound.
 * Wound type / etiology rarely changes during a healing trajectory.
 */
export function isFixedPerWoundField(
  fieldName: string,
  columnName: string
): boolean {
  const combined = `${(fieldName ?? "").toLowerCase()} ${(columnName ?? "").toLowerCase()}`;
  return FIXED_PER_WOUND_PATTERNS.some((p) => combined.includes(p));
}

export interface FieldBehaviorSuggestion {
  behavior: FieldValueBehavior;
  confidence: number;
  rationale: string;
}

export function suggestFieldBehavior(
  field: Pick<
    FieldSchema,
    "fieldName" | "columnName" | "attributeTypeKey" | "systemManaged"
  >
): FieldBehaviorSuggestion {
  const combined = `${field.fieldName ?? ""} ${field.columnName ?? ""}`.toLowerCase();
  const attributeTypeKey = String(field.attributeTypeKey ?? "").toUpperCase();

  if (
    field.systemManaged ||
    attributeTypeKey === WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY ||
    SYSTEM_CONTROLLED_PATTERNS.some((pattern) => combined.includes(pattern))
  ) {
    return {
      behavior: "system",
      confidence: 0.98,
      rationale: "This field is controlled by wound-state or other system-managed semantics.",
    };
  }

  if (PER_WOUND_PATTERNS.some((pattern) => combined.includes(pattern))) {
    return {
      behavior: "per_wound",
      confidence: 0.92,
      rationale:
        "This field usually represents wound identity or episode context and should stay stable across assessments.",
    };
  }

  return {
    behavior: "per_assessment",
    confidence: 0.7,
    rationale:
      "This field is expected to vary with wound progression, assessment findings, or treatment over time.",
  };
}
