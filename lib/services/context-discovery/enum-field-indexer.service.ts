/**
 * Enum Field Indexer Service
 *
 * Detects and indexes enum fields (dropdown/radio fields with limited value sets)
 * from non-form columns in rpt.* tables.
 *
 * Created: 2025-11-20
 * Purpose: Phase 5A - Day 3 - Enum Field Detection
 * See: docs/design/templating_system/templating_improvement_real_customer_analysis.md Section 3.3
 */

import { getInsightGenDbPool } from "@/lib/db";
import { detectEnumField } from "../discovery/silhouette-discovery.service";

/**
 * Enum field detection result
 */
export interface EnumFieldDetectionResult {
  fieldId: string;
  fieldName: string;
  tableName: string;
  columnName: string;
  isEnum: boolean;
  cardinality: number;
  enumValues: Array<{
    value: string;
    count: number;
  }>;
}

/**
 * EnumFieldIndexer Service
 *
 * Responsibilities:
 * 1. Detect enum fields from non-form columns using pattern matching + cardinality analysis
 * 2. Extract distinct values and usage counts from actual data
 * 3. Populate SemanticIndexFieldEnumValue table
 * 4. Mark fields as field_type='enum' in SemanticIndexField
 */
export class EnumFieldIndexer {
  private customerId: string;
  private connectionString: string;

  constructor(customerId: string, connectionString: string) {
    this.customerId = customerId;
    this.connectionString = connectionString;
  }

  /**
   * Get all non-form fields for enum detection
   */
  async getNonFormFields(): Promise<
    Array<{
      fieldId: string;
      fieldName: string;
      tableName: string;
      columnName: string;
    }>
  > {
    const pool = await getInsightGenDbPool();

    const query = `
      SELECT
        id as "fieldId",
        column_name as "fieldName",
        table_name as "tableName",
        column_name as "columnName"
      FROM "SemanticIndexNonForm"
      WHERE customer_id = $1
        AND data_type IN ('varchar', 'text', 'nvarchar', 'char')
      ORDER BY column_name ASC
    `;

    try {
      const result = await pool.query(query, [this.customerId]);
      return result.rows;
    } catch (error: any) {
      console.error('[EnumFieldIndexer] Error fetching non-form fields:', error);
      throw error;
    }
  }

  /**
   * Detect if a field is an enum and extract its values
   */
  async detectEnumForField(
    fieldId: string,
    fieldName: string,
    tableName: string,
    columnName: string
  ): Promise<EnumFieldDetectionResult> {
    console.log(`[EnumFieldIndexer] Analyzing: ${fieldName} (${tableName}.${columnName})`);

    try {
      const detection = await detectEnumField(
        this.connectionString,
        fieldName,
        tableName,
        columnName
      );

      return {
        fieldId,
        fieldName,
        tableName,
        columnName,
        isEnum: detection.isEnum,
        cardinality: detection.cardinality,
        enumValues: detection.distinctValues,
      };
    } catch (error: any) {
      console.error(
        `[EnumFieldIndexer] Error detecting enum for ${fieldName}:`,
        error.message
      );
      return {
        fieldId,
        fieldName,
        tableName,
        columnName,
        isEnum: false,
        cardinality: 0,
        enumValues: [],
      };
    }
  }

  /**
   * Save enum values to database
   */
  async saveEnumValues(detection: EnumFieldDetectionResult): Promise<void> {
    const pool = await getInsightGenDbPool();

    // 1. Mark field as enum type
    await pool.query(
      `UPDATE "SemanticIndexNonForm"
       SET field_type = 'enum'
       WHERE id = $1`,
      [detection.fieldId]
    );

    // 2. Insert enum values
    for (let i = 0; i < detection.enumValues.length; i++) {
      const { value, count } = detection.enumValues[i];

      const query = `
        INSERT INTO "SemanticIndexNonFormEnumValue" (
          nonform_id,
          enum_value,
          display_label,
          sort_order,
          usage_count,
          last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (nonform_id, enum_value)
        DO UPDATE SET
          usage_count = EXCLUDED.usage_count,
          last_seen_at = NOW(),
          updated_at = NOW()
      `;

      await pool.query(query, [
        detection.fieldId,
        value,
        value, // display_label defaults to value
        i + 1, // sort_order by frequency (most common first)
        count,
      ]);
    }

    console.log(
      `[EnumFieldIndexer] Saved ${detection.enumValues.length} enum values for: ${detection.fieldName}`
    );
  }

  /**
   * Index all enum fields for this customer
   */
  async indexAll(): Promise<{
    total: number;
    detected: number;
    skipped: number;
    results: EnumFieldDetectionResult[];
  }> {
    console.log(
      `[EnumFieldIndexer] Starting enum field detection for customer ${this.customerId}`
    );

    // Get all non-form fields
    const fields = await this.getNonFormFields();
    console.log(`[EnumFieldIndexer] Found ${fields.length} non-form fields to analyze`);

    const results: EnumFieldDetectionResult[] = [];
    let detected = 0;
    let skipped = 0;

    for (const field of fields) {
      const detection = await this.detectEnumForField(
        field.fieldId,
        field.fieldName,
        field.tableName,
        field.columnName
      );

      results.push(detection);

      if (detection.isEnum) {
        await this.saveEnumValues(detection);
        detected++;
        console.log(
          `[EnumFieldIndexer] ✅ Enum detected: ${detection.fieldName} (${detection.cardinality} values)`
        );
      } else {
        skipped++;
        console.log(
          `[EnumFieldIndexer] ⏭️  Not enum: ${detection.fieldName} (cardinality: ${detection.cardinality})`
        );
      }
    }

    console.log(`[EnumFieldIndexer] Complete: ${detected} enums detected, ${skipped} skipped`);

    return {
      total: fields.length,
      detected,
      skipped,
      results,
    };
  }

  /**
   * Get all indexed enum fields for this customer
   */
  async getIndexedEnumFields(): Promise<
    Array<{
      fieldId: string;
      fieldName: string;
      tableName: string;
      cardinality: number;
      enumValues: Array<{ value: string; count: number }>;
    }>
  > {
    const pool = await getInsightGenDbPool();

    const query = `
      SELECT
        f.id as "fieldId",
        f.column_name as "fieldName",
        f.table_name as "tableName",
        COUNT(e.id)::int as cardinality,
        json_agg(
          json_build_object(
            'value', e.enum_value,
            'count', e.usage_count
          )
          ORDER BY e.sort_order ASC
        ) as "enumValues"
      FROM "SemanticIndexNonForm" f
      LEFT JOIN "SemanticIndexNonFormEnumValue" e ON f.id = e.nonform_id
      WHERE f.customer_id = $1
        AND f.field_type = 'enum'
        AND e.is_active = true
      GROUP BY f.id, f.column_name, f.table_name
      ORDER BY f.column_name ASC
    `;

    try {
      const result = await pool.query(query, [this.customerId]);
      return result.rows;
    } catch (error: any) {
      console.error('[EnumFieldIndexer] Error fetching indexed enum fields:', error);
      throw error;
    }
  }

  /**
   * Clear all enum data for this customer
   */
  async clearAll(): Promise<number> {
    const pool = await getInsightGenDbPool();

    // 1. Delete enum values (CASCADE will handle this, but explicit is clearer)
    await pool.query(
      `DELETE FROM "SemanticIndexNonFormEnumValue"
       WHERE nonform_id IN (
         SELECT id FROM "SemanticIndexNonForm"
         WHERE customer_id = $1
       )`,
      [this.customerId]
    );

    // 2. Reset field_type to 'text' for enum fields
    const result = await pool.query(
      `UPDATE "SemanticIndexNonForm"
       SET field_type = 'text'
       WHERE customer_id = $1
         AND field_type = 'enum'`,
      [this.customerId]
    );

    const count = result.rowCount || 0;
    console.log(`[EnumFieldIndexer] Cleared ${count} enum fields`);
    return count;
  }
}

/**
 * Create an EnumFieldIndexer instance
 */
export function createEnumFieldIndexer(
  customerId: string,
  connectionString: string
): EnumFieldIndexer {
  return new EnumFieldIndexer(customerId, connectionString);
}
