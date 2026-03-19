/**
 * Validation helpers for data generation execution
 * Checks data integrity before cloning to rpt schema
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  rowsInserted?: number;
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
