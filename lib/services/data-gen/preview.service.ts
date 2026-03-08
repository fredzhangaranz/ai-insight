/**
 * Preview Service
 * Generates sample data without writing to database
 */

import { faker } from "@faker-js/faker";
import type { GenerationSpec } from "./generation-spec.types";
import { generateFieldValue, distributeAcrossBuckets } from "./generators/base.generator";

export interface PreviewRow {
  [key: string]: any;
}

export interface PreviewResult {
  sampleRows: PreviewRow[];
  summary: {
    totalRows: number;
    distributions: Record<string, Record<string, number>>;
    ranges: Record<
      string,
      { min: number | string; max: number | string; mean?: number }
    >;
  };
}

/**
 * Generate preview data for a spec without DB writes
 */
export function generatePreview(
  spec: GenerationSpec,
  sampleSize: number = 5,
  mockDependencies?: { units?: Array<{ id: string; name: string }> }
): PreviewResult {
  if (spec.entity === "patient") {
    return spec.mode === "update"
      ? generatePatientUpdatePreview(spec, sampleSize, mockDependencies?.units)
      : generatePatientPreview(spec, sampleSize, mockDependencies?.units);
  } else if (spec.entity === "assessment_bundle") {
    return generateAssessmentPreview(spec, sampleSize);
  }

  return {
    sampleRows: [],
    summary: {
      totalRows: 0,
      distributions: {},
      ranges: {},
    },
  };
}

/**
 * Generate patient UPDATE preview (shows id + new values for selected patients)
 */
function generatePatientUpdatePreview(
  spec: GenerationSpec,
  sampleSize: number,
  units?: Array<{ id: string; name: string }>
): PreviewResult {
  const patientIds = spec.target?.mode === "custom" ? spec.target.patientIds ?? [] : [];
  if (patientIds.length === 0) {
    return {
      sampleRows: [],
      summary: { totalRows: 0, distributions: {}, ranges: {} },
    };
  }
  const sampleIds = patientIds.slice(0, Math.min(sampleSize, patientIds.length));

  const mockUnits = units || [
    { id: "unit-1", name: "Ward A" },
    { id: "unit-2", name: "Ward B" },
  ];

  const rows: PreviewRow[] = [];
  const distributions: Record<string, Record<string, number>> = {};

  const unitField = spec.fields.find((f) => f.columnName === "unitFk");
  const unitWeights = unitField?.criteria.type === "distribution"
    ? unitField.criteria.weights
    : null;

  for (let i = 0; i < sampleIds.length; i++) {
    const row: PreviewRow = {
      id: sampleIds[i],
      _action: "UPDATE",
    };

    for (const fieldSpec of spec.fields.filter((f) => f.enabled)) {
      const col = fieldSpec.columnName;
      if (
        col === "id" ||
        col === "accessCode" ||
        col === "isDeleted" ||
        col === "assignedToUnitDate" ||
        col === "serverChangeDate"
      ) {
        continue;
      }

      let value: unknown;
      if (col === "unitFk") {
        const u = unitWeights
          ? mockUnits.find((m) => Object.keys(unitWeights).includes(m.name))
          : mockUnits[i % mockUnits.length];
        value = u?.name ?? "—";
      } else {
        try {
          value = generateFieldValue(fieldSpec, faker);
        } catch {
          continue;
        }
      }

      if (value !== null && value !== undefined) {
        row[fieldSpec.fieldName] = value;
        if (fieldSpec.criteria.type === "distribution") {
          const str = String(value);
          if (!distributions[fieldSpec.fieldName]) distributions[fieldSpec.fieldName] = {};
          distributions[fieldSpec.fieldName][str] =
            (distributions[fieldSpec.fieldName][str] || 0) + 1;
        }
      }
    }

    rows.push(row);
  }

  return {
    sampleRows: rows,
    summary: {
      totalRows: patientIds.length,
      distributions,
      ranges: {},
    },
  };
}

/**
 * Generate patient preview
 */
function generatePatientPreview(
  spec: GenerationSpec,
  sampleSize: number,
  units?: Array<{ id: string; name: string }>
): PreviewResult {
  const mockUnits = units || [
    { id: "unit-1", name: "Ward A" },
    { id: "unit-2", name: "Ward B" },
  ];

  const rows: PreviewRow[] = [];
  const distributions: Record<string, Record<string, number>> = {};
  const ranges: Record<string, { min: any; max: any; values: any[] }> = {};

  // Pre-calculate unit assignments
  const unitField = spec.fields.find((f) => f.columnName === "unitFk");
  let unitAssignments: string[] = [];

  if (unitField?.criteria.type === "distribution") {
    const unitWeights: Record<string, number> = {};
    for (const [unitName, weight] of Object.entries(
      unitField.criteria.weights
    )) {
      const unit = mockUnits.find((u) => u.name === unitName);
      if (unit) {
        unitWeights[unit.id] = weight;
      }
    }
    unitAssignments = distributeAcrossBuckets(spec.count, unitWeights);
  } else {
    for (let i = 0; i < spec.count; i++) {
      unitAssignments.push(mockUnits[i % mockUnits.length].id);
    }
  }

  // Generate sample rows
  for (let i = 0; i < Math.min(sampleSize, spec.count); i++) {
    const row: PreviewRow = {
      id: `preview-${i}`,
      accessCode: `IG${String(i).padStart(4, "0")}`,
    };

    // Get unit name
    const unitId = unitAssignments[i];
    const unit = mockUnits.find((u) => u.id === unitId);
    row.unit = unit?.name || "Unknown";

    for (const fieldSpec of spec.fields.filter((f) => f.enabled)) {
      const columnName = fieldSpec.columnName;

      if (
        columnName === "id" ||
        columnName === "accessCode" ||
        columnName === "unitFk" ||
        columnName === "isDeleted" ||
        columnName === "assignedToUnitDate" ||
        columnName === "serverChangeDate"
      ) {
        continue;
      }

      try {
        const value = generateFieldValue(fieldSpec, faker);
        if (value !== null && value !== undefined) {
          row[fieldSpec.fieldName] = value;

          // Track for summary
          if (fieldSpec.criteria.type === "distribution") {
            if (!distributions[fieldSpec.fieldName]) {
              distributions[fieldSpec.fieldName] = {};
            }
            const strValue = String(value);
            distributions[fieldSpec.fieldName][strValue] =
              (distributions[fieldSpec.fieldName][strValue] || 0) + 1;
          } else if (
            fieldSpec.criteria.type === "range" &&
            (typeof value === "number" || value instanceof Date)
          ) {
            if (!ranges[fieldSpec.fieldName]) {
              ranges[fieldSpec.fieldName] = {
                min: value,
                max: value,
                values: [],
              };
            }
            ranges[fieldSpec.fieldName].values.push(value);
            if (value < ranges[fieldSpec.fieldName].min) {
              ranges[fieldSpec.fieldName].min = value;
            }
            if (value > ranges[fieldSpec.fieldName].max) {
              ranges[fieldSpec.fieldName].max = value;
            }
          }
        }
      } catch (error) {
        console.warn(`Preview: failed to generate ${columnName}:`, error);
      }
    }

    rows.push(row);
  }

  // Calculate range means for numeric fields
  const rangeSummary: Record<
    string,
    { min: number | string; max: number | string; mean?: number }
  > = {};
  for (const [field, data] of Object.entries(ranges)) {
    rangeSummary[field] = {
      min: data.min,
      max: data.max,
    };
    if (data.values.length > 0 && typeof data.values[0] === "number") {
      const sum = (data.values as number[]).reduce((a, b) => a + b, 0);
      rangeSummary[field].mean = sum / data.values.length;
    }
  }

  // Scale distributions to full spec.count
  const scaledDistributions: Record<string, Record<string, number>> = {};
  for (const [field, dist] of Object.entries(distributions)) {
    scaledDistributions[field] = {};
    const sampleTotal = Object.values(dist).reduce((a, b) => a + b, 0);
    for (const [value, count] of Object.entries(dist)) {
      scaledDistributions[field][value] = Math.round(
        (count / sampleTotal) * spec.count
      );
    }
  }

  return {
    sampleRows: rows,
    summary: {
      totalRows: spec.count,
      distributions: scaledDistributions,
      ranges: rangeSummary,
    },
  };
}

/**
 * Generate assessment preview (placeholder)
 */
function generateAssessmentPreview(
  spec: GenerationSpec,
  sampleSize: number
): PreviewResult {
  // Simplified preview for assessments
  return {
    sampleRows: [],
    summary: {
      totalRows: spec.count,
      distributions: {},
      ranges: {},
    },
  };
}
