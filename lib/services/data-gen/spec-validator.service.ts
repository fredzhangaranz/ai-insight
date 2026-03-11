/**
 * Spec Validator Service
 * Validates GenerationSpec and checks dependencies exist
 */

import type { ConnectionPool } from "mssql";
import type { GenerationSpec } from "./generation-spec.types";
import {
  DependencyMissingError,
  ValidationError,
} from "./generation-spec.types";

/**
 * Validate a generation spec and check all dependencies exist
 */
export async function validateGenerationSpec(
  spec: GenerationSpec,
  db: ConnectionPool
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Basic validation
  const isUpdate = spec.mode === "update";
  const effectiveCount = isUpdate && spec.target?.patientIds?.length
    ? spec.target.patientIds.length
    : spec.count;

  if (effectiveCount <= 0) {
    errors.push(isUpdate ? "target.patientIds must not be empty" : "count must be greater than 0");
  }

  if (spec.entity === "patient") {
    await validatePatientSpec(spec, db, errors);
  } else if (spec.entity === "assessment_bundle") {
    await validateAssessmentSpec(spec, db, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate patient generation spec
 */
async function validatePatientSpec(
  spec: GenerationSpec,
  db: ConnectionPool,
  errors: string[]
): Promise<void> {
  const isUpdate = spec.mode === "update";
  const updatingUnitFk = spec.fields.some((f) => f.enabled && f.columnName === "unitFk");

  // Check that units exist (required for insert, or when updating unitFk)
  if (!isUpdate || updatingUnitFk) {
    try {
      const unitResult = await db
        .request()
        .query("SELECT COUNT(*) as count FROM dbo.Unit WHERE isDeleted = 0");

      const unitCount = unitResult.recordset[0]?.count || 0;
      if (unitCount === 0) {
        errors.push(
          "No units found in dbo.Unit. Please create at least one unit before generating patients."
        );
      }
    } catch (error: any) {
      errors.push(`Failed to check unit dependencies: ${error.message}`);
    }
  }

  // For update mode, verify target patients exist
  if (isUpdate && spec.target?.mode === "custom" && spec.target.patientIds?.length) {
    try {
      const ids = spec.target.patientIds.map((id) => `'${id}'`).join(",");
      const r = await db.request().query(`
        SELECT COUNT(*) as count FROM dbo.Patient
        WHERE id IN (${ids}) AND isDeleted = 0
      `);
      const found = r.recordset[0]?.count ?? 0;
      if (found < spec.target.patientIds.length) {
        errors.push(`Only ${found} of ${spec.target.patientIds.length} target patients exist`);
      }
    } catch (err: any) {
      errors.push(`Failed to verify target patients: ${err.message}`);
    }
  }

  // Validate field criteria
  for (const field of spec.fields) {
    if (!field.enabled) continue;

    const criteria = field.criteria;

    if (criteria.type === "distribution") {
      const totalWeight = Object.values(criteria.weights).reduce(
        (sum, w) => sum + w,
        0
      );
      if (totalWeight <= 0) {
        errors.push(
          `Field ${field.fieldName}: distribution weights must sum to > 0`
        );
      }
    }

    if (criteria.type === "range") {
      if (
        typeof criteria.min === "number" &&
        typeof criteria.max === "number"
      ) {
        if (criteria.min >= criteria.max) {
          errors.push(
            `Field ${field.fieldName}: range min must be less than max`
          );
        }
      }
    }

    if (criteria.type === "options" && criteria.pickFrom.length === 0) {
      errors.push(`Field ${field.fieldName}: options list cannot be empty`);
    }
  }
}

/**
 * Validate assessment generation spec
 */
async function validateAssessmentSpec(
  spec: GenerationSpec,
  db: ConnectionPool,
  errors: string[]
): Promise<void> {
  if (spec.trajectoryDistribution) {
    const sum = Object.values(spec.trajectoryDistribution).reduce(
      (a, b) => a + b,
      0
    );
    if (Math.abs(sum - 1.0) > 0.01) {
      errors.push(
        "trajectoryDistribution values must sum to 1.0 (healing + stable + deteriorating + treatmentChange)"
      );
    }
  }

  // Check that form exists
  if (!spec.form?.assessmentTypeVersionId) {
    errors.push("Assessment form ID is required for assessment generation");
    return;
  }

  try {
    const formResult = await db.request().query(`
      SELECT COUNT(*) as count 
      FROM dbo.AssessmentTypeVersion 
      WHERE id = '${spec.form.assessmentTypeVersionId}' 
        AND isDeleted = 0 
        AND versionType = 2
    `);

    const formCount = formResult.recordset[0]?.count || 0;
    if (formCount === 0) {
      errors.push(
        `Assessment form ${spec.form.assessmentTypeVersionId} not found or not published`
      );
    }
  } catch (error: any) {
    errors.push(`Failed to check form: ${error.message}`);
  }

  // Check that target patients exist
  const target = spec.target;
  if (!target) {
    errors.push("Target selector is required for assessment generation");
    return;
  }

  try {
    let patientQuery = "SELECT COUNT(*) as count FROM dbo.Patient WHERE isDeleted = 0";

    if (target.mode === "generated") {
      patientQuery += " AND accessCode LIKE 'IG%'";
    } else if (target.mode === "without_assessments") {
      patientQuery += ` 
        AND NOT EXISTS (
          SELECT 1 FROM dbo.Series s 
          WHERE s.patientFk = dbo.Patient.id 
            AND s.isDeleted = 0
        )
      `;
    } else if (target.mode === "custom") {
      if (target.patientIds?.length) {
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        const validIds = target.patientIds.filter((id) => uuidRegex.test(id));
        if (validIds.length > 0) {
          const ids = validIds.map((id) => `'${id}'`).join(",");
          patientQuery += ` AND id IN (${ids})`;
        }
      } else if (target.filter) {
        patientQuery += ` AND ${target.filter}`;
      }
    }

    const patientResult = await db.request().query(patientQuery);
    const patientCount = patientResult.recordset[0]?.count || 0;

    if (patientCount === 0) {
      errors.push(
        `No patients found matching target criteria: ${target.mode}`
      );
    }
  } catch (error: any) {
    errors.push(`Failed to check patient dependencies: ${error.message}`);
  }
}

/**
 * Throw validation error if spec is invalid
 */
export async function validateOrThrow(
  spec: GenerationSpec,
  db: ConnectionPool
): Promise<void> {
  const result = await validateGenerationSpec(spec, db);
  if (!result.valid) {
    throw new ValidationError("spec", result.errors.join("; "));
  }
}
