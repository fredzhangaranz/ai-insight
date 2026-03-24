/**
 * Validation helpers for data generation execution
 * Checks data integrity before cloning to rpt schema
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import {
  getFormFields,
  resolveWoundStateCompanion,
} from "./schema-discovery.service";
import {
  compileAssessmentForm,
  evaluateFieldVisibility,
  getAssessmentVisibilityMode,
  parseStoredContextValue,
  validateContextValue,
  type CompiledAssessmentField,
} from "./assessment-form.service";
import type { AssessmentFormDiagnostic } from "./generation-spec.types";
import { partitionAssessmentWoundStateFields } from "./wound-state.service";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  rowsInserted?: number;
  diagnostics?: AssessmentFormDiagnostic[];
}

function validateStoredAssessmentFields(params: {
  contextFields: Map<string, CompiledAssessmentField>;
  validationFields: CompiledAssessmentField[];
  storedValuesByColumn: Map<string, string>;
  seededContext?: Map<string, ReturnType<typeof parseStoredContextValue>>;
  ownerLabel: string;
  diagnostics: AssessmentFormDiagnostic[];
  visibilityChecksEnabled: boolean;
}): void {
  const context = new Map<string, ReturnType<typeof parseStoredContextValue>>();

  for (const [columnName, value] of params.seededContext ?? new Map()) {
    context.set(columnName, value);
  }

  for (const [columnName, value] of params.storedValuesByColumn) {
    const field = params.contextFields.get(columnName);
    if (!field) continue;
    context.set(columnName, parseStoredContextValue(field, value));
  }

  for (const field of params.validationFields.filter((candidate) => candidate.isGeneratable)) {
    const stored = params.storedValuesByColumn.get(field.columnName);
    if (params.visibilityChecksEnabled) {
      const visible = evaluateFieldVisibility(field, context);
      if (!visible && stored != null) {
        params.diagnostics.push({
          severity: "error",
          code: "hidden_field_generated",
          message: `Inserted hidden field "${field.fieldName}" on ${params.ownerLabel}`,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
        continue;
      }
      if (visible && field.isNullable === false && stored == null) {
        params.diagnostics.push({
          severity: "error",
          code: "missing_visible_required_field",
          message: `Missing visible required field "${field.fieldName}" on ${params.ownerLabel}`,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
        continue;
      }
    }

    if (stored == null) continue;
    const parsed = parseStoredContextValue(field, stored);
    const validationError = validateContextValue(field, parsed);
    if (validationError) {
      params.diagnostics.push({
        severity: "error",
        code: "invalid_generated_value",
        message: `${validationError} on ${params.ownerLabel}`,
        fieldName: field.fieldName,
        columnName: field.columnName,
        visibilityExpression: field.visibilityExpression ?? null,
      });
    }
  }
}

/**
 * Validate inserted wounds and assessments
 * Runs after INSERT/UPDATE but before cloning to rpt
 * @param insertedPatientIds - Patient IDs that received new wounds/assessments (not Series IDs)
 */
export async function validateInsertedData(
  db: ConnectionPool,
  insertedPatientIds: string[],
  checkWindowMinutes: number = 5
): Promise<ValidationResult> {
  if (!insertedPatientIds || insertedPatientIds.length === 0) {
    return { isValid: true, rowsInserted: 0 };
  }

  try {
    const cutoff = new Date(Date.now() - checkWindowMinutes * 60 * 1000);
    const cutoffStr = cutoff.toISOString();

    // mssql does not support array params; use individual params for IN clause
    const woundReq = db.request().input("cutoff", cutoffStr);
    const inPlaceholders = insertedPatientIds
      .map((_, i) => {
        woundReq.input(`pid${i}`, sql.UniqueIdentifier, insertedPatientIds[i]);
        return `@pid${i}`;
      })
      .join(", ");

    const woundCheckResult = await woundReq.query(`
        SELECT 
          w.id AS woundId,
          w.patientFk,
          COUNT(s.id) AS assessmentCount
        FROM dbo.Wound w
        LEFT JOIN dbo.Series s ON s.woundFk = w.id AND s.isDeleted = 0
        WHERE w.patientFk IN (${inPlaceholders})
          AND w.serverChangeDate > @cutoff
          AND w.isDeleted = 0
        GROUP BY w.id, w.patientFk
        HAVING COUNT(s.id) = 0
      `);

    if (woundCheckResult.recordset.length > 0) {
      const count = woundCheckResult.recordset.length;
      return {
        isValid: false,
        error: `Found ${count} wound(s) with no assessments. Data is incomplete.`,
      };
    }

    // Check for NULL references
    const nullCheckResult = await db
      .request()
      .input("cutoff", cutoffStr)
      .query(`
        SELECT 
          'Series with NULL patientFk' AS issue, COUNT(*) AS count
        FROM dbo.Series
        WHERE patientFk IS NULL AND serverChangeDate > @cutoff AND isDeleted = 0
        UNION ALL
        SELECT 
          'Series with NULL woundFk', COUNT(*)
        FROM dbo.Series
        WHERE woundFk IS NULL AND serverChangeDate > @cutoff AND isDeleted = 0
        UNION ALL
        SELECT 
          'Wound with NULL patientFk', COUNT(*)
        FROM dbo.Wound
        WHERE patientFk IS NULL AND serverChangeDate > @cutoff AND isDeleted = 0
      `);

    const nullIssues = nullCheckResult.recordset.filter(
      (r: any) => r.count > 0
    );
    if (nullIssues.length > 0) {
      const msg = nullIssues.map((r: any) => `${r.issue}: ${r.count}`).join("; ");
      return {
        isValid: false,
        error: `Data integrity issue: ${msg}`,
      };
    }

    // Count total rows inserted
    const countResult = await db
      .request()
      .input("cutoff", cutoffStr)
      .query(`
        SELECT 
          (SELECT COUNT(*) FROM dbo.Wound WHERE serverChangeDate > @cutoff AND isDeleted = 0) AS wounds,
          (SELECT COUNT(*) FROM dbo.Series WHERE serverChangeDate > @cutoff AND isDeleted = 0) AS assessments
      `);

    const { wounds, assessments } = countResult.recordset[0];

    const warnings: string[] = [];
    if (wounds === 0) warnings.push("No wounds inserted");
    if (assessments === 0) warnings.push("No assessments inserted");

    return {
      isValid: true,
      rowsInserted: wounds + assessments,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Validation query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function validateInsertedAssessmentAttributes(
  db: ConnectionPool,
  assessmentTypeVersionId: string,
  insertedSeriesIds: string[],
  insertedWoundIds: string[] = []
): Promise<ValidationResult> {
  if (!insertedSeriesIds.length && !insertedWoundIds.length) {
    return { isValid: true, rowsInserted: 0, diagnostics: [] };
  }

  try {
    const formFields = await getFormFields(db, assessmentTypeVersionId);
    const woundStateCompanion = await resolveWoundStateCompanion(db);
    const assessmentWoundState = await partitionAssessmentWoundStateFields(db, formFields);
    const compiledForm = compileAssessmentForm(formFields);
    const compiledWoundStateCompanion = compileAssessmentForm(woundStateCompanion.fields);
    const mode = getAssessmentVisibilityMode();
    const blockingDiagnostics = [
      ...compiledForm.blockingDiagnostics,
      ...compiledWoundStateCompanion.blockingDiagnostics,
    ];
    if (blockingDiagnostics.length > 0) {
      if (mode === "enforce") {
        return {
          isValid: false,
          error: blockingDiagnostics.map((d) => d.message).join("; "),
          diagnostics: [
            ...compiledForm.diagnostics,
            ...compiledWoundStateCompanion.diagnostics,
          ],
        };
      }
    }
    const visibilityChecksEnabled = blockingDiagnostics.length === 0;

    const diagnostics: AssessmentFormDiagnostic[] = [
      ...compiledForm.diagnostics,
      ...compiledWoundStateCompanion.diagnostics,
    ];

    const rowsBySeries = new Map<string, Map<string, string>>();
    const woundStateBySeries = new Map<
      string,
      { woundStateId: string; woundFk: string; woundStateText: string }
    >();
    const woundStateCountBySeries = new Map<string, number>();
    const woundStateAttributeBySeries = new Map<string, Map<string, string>>();
    const baselineWoundStateByWound = new Map<
      string,
      { woundStateId: string; woundStateText: string }
    >();
    const baselineWoundStateCountByWound = new Map<string, number>();
    const baselineWoundStateAttributesByWound = new Map<string, Map<string, string>>();

    if (insertedSeriesIds.length > 0) {
      const attributeReq = db.request();
      const seriesPlaceholders = insertedSeriesIds
        .map((seriesId, idx) => {
          attributeReq.input(`sid${idx}`, sql.UniqueIdentifier, seriesId);
          return `@sid${idx}`;
        })
        .join(", ");

      const attributes = await attributeReq.query(`
        SELECT
          wa.seriesFk,
          at.variableName AS columnName,
          wa.value
        FROM dbo.WoundAttribute wa
        INNER JOIN dbo.AttributeType at ON at.id = wa.attributeTypeFk
        WHERE wa.seriesFk IN (${seriesPlaceholders})
          AND wa.isDeleted = 0
          AND at.isDeleted = 0
      `);

      for (const row of attributes.recordset ?? []) {
        const seriesId = String(row.seriesFk);
        if (!rowsBySeries.has(seriesId)) {
          rowsBySeries.set(seriesId, new Map<string, string>());
        }
        rowsBySeries.get(seriesId)!.set(String(row.columnName), String(row.value ?? ""));
      }

      const woundStateReq = db.request();
      const woundStatePlaceholders = insertedSeriesIds
        .map((seriesId, idx) => {
          woundStateReq.input(`wsSid${idx}`, sql.UniqueIdentifier, seriesId);
          return `@wsSid${idx}`;
        })
        .join(", ");
      const woundStates = await woundStateReq.query(`
        SELECT
          ws.id AS woundStateId,
          ws.seriesFk,
          ws.woundFk,
          al.[text] AS woundStateText
        FROM dbo.WoundState ws
        INNER JOIN dbo.AttributeLookup al ON al.id = ws.attributeLookupFk
        WHERE ws.seriesFk IN (${woundStatePlaceholders})
          AND ws.isDeleted = 0
      `);

      for (const row of woundStates.recordset ?? []) {
        const seriesId = String(row.seriesFk);
        woundStateCountBySeries.set(
          seriesId,
          (woundStateCountBySeries.get(seriesId) ?? 0) + 1
        );
        woundStateBySeries.set(seriesId, {
          woundStateId: String(row.woundStateId),
          woundFk: String(row.woundFk),
          woundStateText: String(row.woundStateText),
        });
      }

      if (woundStates.recordset.length > 0) {
        const wsaReq = db.request();
        const woundStateIdPlaceholders = woundStates.recordset
          .map((row, idx) => {
            wsaReq.input(`wsa${idx}`, sql.UniqueIdentifier, row.woundStateId);
            return `@wsa${idx}`;
          })
          .join(", ");
        const woundStateAttributes = await wsaReq.query(`
          SELECT
            wsa.woundStateFk,
            at.variableName AS columnName,
            wsa.value
          FROM dbo.WoundStateAttribute wsa
          INNER JOIN dbo.AttributeType at ON at.id = wsa.attributeTypeFk
          WHERE wsa.woundStateFk IN (${woundStateIdPlaceholders})
            AND wsa.isDeleted = 0
            AND at.isDeleted = 0
        `);

        for (const row of woundStateAttributes.recordset ?? []) {
          const woundStateId = String(row.woundStateFk);
          const seriesEntry = [...woundStateBySeries.entries()].find(
            ([, value]) => value.woundStateId === woundStateId
          );
          if (!seriesEntry) continue;
          const [seriesId] = seriesEntry;
          if (!woundStateAttributeBySeries.has(seriesId)) {
            woundStateAttributeBySeries.set(seriesId, new Map<string, string>());
          }
          woundStateAttributeBySeries
            .get(seriesId)!
            .set(String(row.columnName), String(row.value ?? ""));
        }
      }
    }

    if (insertedWoundIds.length > 0) {
      const baselineReq = db.request();
      const woundPlaceholders = insertedWoundIds
        .map((woundId, idx) => {
          baselineReq.input(`wid${idx}`, sql.UniqueIdentifier, woundId);
          return `@wid${idx}`;
        })
        .join(", ");
      const baselineWoundStates = await baselineReq.query(`
        SELECT
          ws.id AS woundStateId,
          ws.woundFk,
          al.[text] AS woundStateText
        FROM dbo.WoundState ws
        INNER JOIN dbo.AttributeLookup al ON al.id = ws.attributeLookupFk
        WHERE ws.woundFk IN (${woundPlaceholders})
          AND ws.seriesFk IS NULL
          AND ws.isDeleted = 0
      `);

      for (const row of baselineWoundStates.recordset ?? []) {
        const woundId = String(row.woundFk);
        baselineWoundStateCountByWound.set(
          woundId,
          (baselineWoundStateCountByWound.get(woundId) ?? 0) + 1
        );
        baselineWoundStateByWound.set(woundId, {
          woundStateId: String(row.woundStateId),
          woundStateText: String(row.woundStateText),
        });
      }

      if (baselineWoundStates.recordset.length > 0) {
        const baselineAttrReq = db.request();
        const baselineIds = baselineWoundStates.recordset
          .map((row, idx) => {
            baselineAttrReq.input(`bwsa${idx}`, sql.UniqueIdentifier, row.woundStateId);
            return `@bwsa${idx}`;
          })
          .join(", ");
        const baselineAttributes = await baselineAttrReq.query(`
          SELECT
            wsa.woundStateFk,
            at.variableName AS columnName,
            wsa.value
          FROM dbo.WoundStateAttribute wsa
          INNER JOIN dbo.AttributeType at ON at.id = wsa.attributeTypeFk
          WHERE wsa.woundStateFk IN (${baselineIds})
            AND wsa.isDeleted = 0
            AND at.isDeleted = 0
        `);

        for (const row of baselineAttributes.recordset ?? []) {
          const woundStateId = String(row.woundStateFk);
          const woundEntry = [...baselineWoundStateByWound.entries()].find(
            ([, value]) => value.woundStateId === woundStateId
          );
          if (!woundEntry) continue;
          const [woundId] = woundEntry;
          if (!baselineWoundStateAttributesByWound.has(woundId)) {
            baselineWoundStateAttributesByWound.set(woundId, new Map<string, string>());
          }
          baselineWoundStateAttributesByWound
            .get(woundId)!
            .set(String(row.columnName), String(row.value ?? ""));
        }
      }
    }

    for (const seriesId of insertedSeriesIds) {
      const woundStateCount = woundStateCountBySeries.get(seriesId) ?? 0;
      if (woundStateCount !== 1) {
        diagnostics.push({
          severity: "error",
          code: "missing_visible_required_field",
          message: `Expected exactly one wound state row for series ${seriesId}, found ${woundStateCount}`,
        });
        continue;
      }

      const woundRow = rowsBySeries.get(seriesId) ?? new Map<string, string>();
      const woundStateRow = woundStateBySeries.get(seriesId);
      if (!woundStateRow) {
        diagnostics.push({
          severity: "error",
          code: "missing_visible_required_field",
          message: `Missing wound state row for series ${seriesId}`,
        });
        continue;
      }

      validateStoredAssessmentFields({
        contextFields: compiledForm.fieldByColumn,
        validationFields: compiledForm.fields.filter(
          (field) => field.storageType === "wound_attribute"
        ),
        storedValuesByColumn: woundRow,
        seededContext: new Map([
          [
            assessmentWoundState.selectorField.columnName,
            parseStoredContextValue(
              assessmentWoundState.selectorField,
              woundStateRow.woundStateText
            ),
          ],
        ]),
        ownerLabel: `series ${seriesId}`,
        diagnostics,
        visibilityChecksEnabled,
      });

      const woundStateAttributes = woundStateAttributeBySeries.get(seriesId) ?? new Map<string, string>();
      const woundStateSeed = new Map<string, ReturnType<typeof parseStoredContextValue>>([
        [
          assessmentWoundState.selectorField.columnName,
          parseStoredContextValue(
            assessmentWoundState.selectorField,
            woundStateRow.woundStateText
          ),
        ],
      ]);
      for (const [columnName, value] of woundRow) {
        const field = compiledForm.fieldByColumn.get(columnName);
        if (!field) continue;
        woundStateSeed.set(columnName, parseStoredContextValue(field, value));
      }

      validateStoredAssessmentFields({
        contextFields: compiledForm.fieldByColumn,
        validationFields: compiledForm.fields.filter(
          (field) =>
            field.storageType === "wound_state_attribute" &&
            field.columnName !== assessmentWoundState.selectorField.columnName
        ),
        storedValuesByColumn: woundStateAttributes,
        seededContext: woundStateSeed,
        ownerLabel: `wound state ${woundStateRow.woundStateId}`,
        diagnostics,
        visibilityChecksEnabled,
      });
    }

    for (const woundId of insertedWoundIds) {
      const baselineCount = baselineWoundStateCountByWound.get(woundId) ?? 0;
      if (baselineCount !== 1) {
        diagnostics.push({
          severity: "error",
          code: "missing_visible_required_field",
          message: `Expected exactly one baseline wound state row for wound ${woundId}, found ${baselineCount}`,
        });
        continue;
      }

      const baselineState = baselineWoundStateByWound.get(woundId);
      if (!baselineState) {
        diagnostics.push({
          severity: "error",
          code: "missing_visible_required_field",
          message: `Missing baseline wound state row for wound ${woundId}`,
        });
        continue;
      }

      validateStoredAssessmentFields({
        contextFields: compiledWoundStateCompanion.fieldByColumn,
        validationFields: compiledWoundStateCompanion.fields.filter(
          (field) => field.columnName !== woundStateCompanion.selectorField.columnName
        ),
        storedValuesByColumn:
          baselineWoundStateAttributesByWound.get(woundId) ?? new Map<string, string>(),
        seededContext: new Map([
          [
            woundStateCompanion.selectorField.columnName,
            parseStoredContextValue(
              woundStateCompanion.selectorField,
              baselineState.woundStateText
            ),
          ],
        ]),
        ownerLabel: `baseline wound state ${baselineState.woundStateId}`,
        diagnostics,
        visibilityChecksEnabled,
      });
    }

    const blocking = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    return {
      isValid: mode === "enforce" ? blocking.length === 0 : true,
      error:
        mode === "enforce" && blocking.length > 0
          ? blocking.map((diagnostic) => diagnostic.message).join("; ")
          : undefined,
      diagnostics,
      rowsInserted:
        [...rowsBySeries.values()].reduce((sum, row) => sum + row.size, 0) +
        [...woundStateAttributeBySeries.values()].reduce((sum, row) => sum + row.size, 0) +
        [...baselineWoundStateAttributesByWound.values()].reduce((sum, row) => sum + row.size, 0),
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Assessment visibility validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Update change tracking version to current before cloning.
 * SQL Server's Change Tracking feature uses version numbers to track changes.
 * This must be called BEFORE clonePatientDataToRpt to ensure all recent changes are detected.
 */
export async function syncChangeTrackingVersion(
  db: ConnectionPool
): Promise<{ previousVersion: number; currentVersion: number }> {
  try {
    // Get current change tracking version from SQL Server
    const versionResult = await db.request().query(`
      SELECT CHANGE_TRACKING_CURRENT_VERSION() AS currentVersion
    `);

    const currentVersion = versionResult.recordset[0]?.currentVersion;
    if (currentVersion === undefined) {
      throw new Error("Failed to retrieve CHANGE_TRACKING_CURRENT_VERSION");
    }

    // Get the last exported version from tracking table
    // Table has lastExportedVersion, currentExportVersion (no id column)
    const trackingResult = await db.request().query(`
      SELECT TOP 1 lastExportedVersion, currentExportVersion
      FROM ChangeTrackingVersion
    `);

    const previousVersion =
      trackingResult.recordset[0]?.currentExportVersion ?? 0;

    // Update the currentExportVersion to the actual current version
    // This tells sp_clonePatients to sync all changes up to this version
    // Single-row table: update without WHERE
    await db.request().input("currentVersion", currentVersion).query(`
      UPDATE ChangeTrackingVersion
      SET currentExportVersion = @currentVersion
    `);

    return {
      previousVersion,
      currentVersion,
    };
  } catch (error) {
    throw new Error(
      `Failed to sync change tracking version: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update last exported version after successful clone.
 * This marks the version as "processed" so future clones start from this point.
 */
export async function updateLastExportedVersion(
  db: ConnectionPool,
  version: number
): Promise<void> {
  try {
    await db.request().input("version", version).query(`
      UPDATE ChangeTrackingVersion
      SET lastExportedVersion = @version
    `);
  } catch (error) {
    throw new Error(
      `Failed to update last exported version: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Clone patients to reporting schema
 * Mirrors dbo.Patient, dbo.Wound, dbo.Series data to rpt schema
 *
 * sp_clonePatients signature varies by DB: some expect 3 params, others none.
 * We try with params first; if "too many arguments", retry without.
 *
 * NOTE: Call syncChangeTrackingVersion() BEFORE this function to ensure
 * the stored procedure detects all recent changes.
 */
export async function clonePatientDataToRpt(
  db: ConnectionPool
): Promise<{ cloned: number }> {
  try {
    await db.request().query(`
      EXEC sp_set_session_context @key = 'all_access', @value = 1;
    `);

    const withParams = `
      EXEC sp_clonePatients @woundLabelFormat = 0, @ignoreIslands = 0, @ignorePerimeter = 0;
    `;
    const noParams = `EXEC sp_clonePatients;`;

    let result: { recordset?: { cloned_count?: number }[] };
    try {
      result = await db.request().query(withParams);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("too many arguments")) {
        result = await db.request().query(noParams);
      } else {
        throw err;
      }
    }

    return { cloned: result.recordset?.[0]?.cloned_count ?? 0 };
  } catch (error) {
    throw new Error(
      `Failed to clone patients to rpt schema: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
