import * as sql from "mssql";

import { getSqlServerPool } from "@/lib/services/sqlserver/client";

export type AttributeSetRecord = {
  id: string;
  attributeSetKey: string;
  name: string;
  description: string | null;
  type: number;
};

/**
 * Fetch published Silhouette attribute sets (forms) for customer discovery.
 * See docs/design/semantic_layer/semantic_layer_design.md §6.3.
 *
 * IMPORTANT: We fetch both 'id' and 'attributeSetKey' because:
 * - AttributeType.attributeSetFk references AttributeSet.id (NOT attributeSetKey)
 * - We must use 'id' for field lookups to find all fields correctly
 */
export async function fetchAttributeSets(
  connectionString: string
): Promise<AttributeSetRecord[]> {
  const pool = await getSqlServerPool(connectionString);

  const result = await pool.request().query<AttributeSetRecord>(
    `SELECT
         id,
         attributeSetKey,
         name,
         description,
         type
       FROM dbo.AttributeSet
       WHERE isDeleted = 0
       ORDER BY name ASC`
  );

  return result.recordset.map((row) => ({
    id: row.id,
    attributeSetKey: row.attributeSetKey,
    name: row.name,
    description: row.description ?? null,
    type: row.type,
  }));
}

export async function fetchAttributeTypeSummary(
  connectionString: string,
  attributeSetId: string
): Promise<
  Array<{
    id: string;
    name: string;
    dataType: number;
    variableName: string | null;
  }>
> {
  const pool = await getSqlServerPool(connectionString);

  const result = await pool
    .request()
    .input("attributeSetId", sql.UniqueIdentifier, attributeSetId)
    .query(
      `SELECT
         at.id,
         at.name,
         at.dataType,
         at.variableName
       FROM dbo.AttributeType at
       WHERE at.isDeleted = 0
         AND at.attributeSetFk = @attributeSetId
       ORDER BY at.orderIndex`
    );

  return result.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    dataType: row.dataType,
    variableName: row.variableName ?? null,
  }));
}

/**
 * Detect enum fields by pattern matching and value distribution
 *
 * Phase 5A: Identifies fields that are likely enum/dropdown fields based on:
 * 1. Field name patterns (*status, *state, *type, *category)
 * 2. Low cardinality (2-50 distinct values)
 * 3. High repetition (values appear multiple times)
 *
 * @param connectionString - Silhouette database connection string
 * @param fieldId - Semantic field ID from SemanticIndexField
 * @param fieldName - Field name (for pattern matching)
 * @param tableName - Table name (e.g., "rpt.Assessment")
 * @param columnName - Column name (e.g., "workflow_status")
 * @returns Enum detection result with distinct values
 */
export async function detectEnumField(
  connectionString: string,
  fieldName: string,
  tableName: string,
  columnName: string
): Promise<{
  isEnum: boolean;
  distinctValues: Array<{ value: string; count: number }>;
  totalCount: number;
  cardinality: number;
}> {
  const pool = await getSqlServerPool(connectionString);

  // Check if field name matches enum patterns
  const nameLower = fieldName.toLowerCase();
  const isEnumPattern =
    nameLower.includes("status") ||
    nameLower.includes("state") ||
    nameLower.includes("type") ||
    nameLower.includes("category") ||
    nameLower.includes("classification") ||
    nameLower.includes("level") ||
    nameLower.includes("grade");

  // Query distinct values and their counts
  const query = `
    SELECT
      TOP 100
      ${columnName} as value,
      COUNT(*) as count
    FROM ${tableName}
    WHERE ${columnName} IS NOT NULL
      AND ${columnName} != ''
    GROUP BY ${columnName}
    ORDER BY COUNT(*) DESC
  `;

  try {
    const result = await pool.request().query(query);

    const distinctValues = result.recordset.map((row: any) => ({
      value: String(row.value),
      count: row.count,
    }));

    const cardinality = distinctValues.length;
    const totalCount = distinctValues.reduce((sum, v) => sum + v.count, 0);

    // Enum detection criteria:
    // 1. Field name matches enum pattern, OR
    // 2. Low cardinality (2-50 distinct values) AND high repetition
    const isEnum =
      isEnumPattern &&
      cardinality >= 2 &&
      cardinality <= 50 &&
      totalCount >= cardinality * 2; // Each value appears at least twice on average

    return {
      isEnum,
      distinctValues,
      totalCount,
      cardinality,
    };
  } catch (error: any) {
    console.error(`[detectEnumField] Error detecting enum for ${fieldName}:`, error.message);
    return {
      isEnum: false,
      distinctValues: [],
      totalCount: 0,
      cardinality: 0,
    };
  }
}

/**
 * Get distinct values for a known enum field
 *
 * Simpler version of detectEnumField that just returns the values
 * without detection logic.
 *
 * @param connectionString - Silhouette database connection string
 * @param tableName - Table name (e.g., "rpt.Note")
 * @param columnName - Column name (e.g., "valueText")
 * @param limit - Maximum number of values to return (default: 100)
 * @returns Array of distinct values with usage counts
 */
export async function getEnumValues(
  connectionString: string,
  tableName: string,
  columnName: string,
  limit: number = 100
): Promise<Array<{ value: string; count: number }>> {
  const pool = await getSqlServerPool(connectionString);

  const query = `
    SELECT
      TOP ${limit}
      ${columnName} as value,
      COUNT(*) as count
    FROM ${tableName}
    WHERE ${columnName} IS NOT NULL
      AND ${columnName} != ''
    GROUP BY ${columnName}
    ORDER BY COUNT(*) DESC
  `;

  try {
    const result = await pool.request().query(query);

    return result.recordset.map((row: any) => ({
      value: String(row.value),
      count: row.count,
    }));
  } catch (error: any) {
    console.error(`[getEnumValues] Error getting values for ${columnName}:`, error.message);
    return [];
  }
}
