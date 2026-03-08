/**
 * Field Classifier Service
 * Classifies fields into source-of-truth, algorithm-output, or pure-data
 */

import type { FieldClass } from "./generation-spec.types";

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

  if (
    calculatedValueExpression != null &&
    String(calculatedValueExpression).trim() !== ""
  ) {
    return "algorithm-output";
  }

  return "pure-data";
}
