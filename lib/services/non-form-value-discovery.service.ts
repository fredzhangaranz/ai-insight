import * as sql from "mssql";
import type { Pool } from "pg";

import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

const VALUE_SAMPLE_LIMIT = 50;
const REVIEW_THRESHOLD = 0.7;

type NonFormColumnRow = {
  id: string;
  table_name: string;
  column_name: string;
  data_type: string | null;
  semantic_concept: string | null;
  semantic_category: string | null;
  confidence: number | null;
};

type ValueSampleRow = {
  value: unknown;
  sample_count: number;
};

type NonFormValueRecord = {
  semanticIndexNonFormId: string;
  valueText: string;
  semanticCategory: string | null;
  confidence: number | null;
  sampleCount: number;
  frequency: number;
  reviewRequired: boolean;
};

export type NonFormValueDiscoveryOptions = {
  customerId: string;
  connectionString: string;
};

export type NonFormValueDiscoveryResult = {
  customerId: string;
  columnsProcessed: number;
  valuesDiscovered: number;
  lowConfidenceValues: number;
  averageConfidence: number | null;
  warnings: string[];
  errors: string[];
  records: NonFormValueRecord[];
};

type TableIdentifier = {
  schema: string;
  table: string;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

function normaliseDataType(dataType: string | null): string | null {
  if (!dataType) {
    return null;
  }
  return dataType.trim().toLowerCase();
}

function isSafeIdentifier(value: string | null): boolean {
  if (!value) {
    return false;
  }
  return /^[A-Za-z0-9_]+$/.test(value);
}

function splitTableIdentifier(tableName: string): TableIdentifier | null {
  const parts = tableName.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [schema, table] = parts;
  if (!isSafeIdentifier(schema) || !isSafeIdentifier(table)) {
    return null;
  }

  return { schema, table };
}

function buildQualifiedName(
  identifier: TableIdentifier,
  column: string
): {
  tableSql: string;
  columnSql: string;
} | null {
  if (!isSafeIdentifier(column)) {
    return null;
  }

  const tableSql = `[${identifier.schema}].[${identifier.table}]`;
  const columnSql = `[${column}]`;
  return { tableSql, columnSql };
}

function normaliseValueText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return null;
}

function summariseConfidence(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

async function lookupOntologyMatch(
  pool: Pool,
  embedding: number[]
): Promise<{
  similarity: number;
  conceptName: string;
  metadata: Record<string, unknown>;
} | null> {
  if (embedding.length === 0) {
    return null;
  }

  const vector = toVectorLiteral(embedding);

  const result = await pool.query(
    `
      SELECT
        concept_name,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM "ClinicalOntology"
      ORDER BY embedding <=> $1::vector
      LIMIT 1
    `,
    [vector]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const similarity =
    typeof row.similarity === "number" ? clamp(row.similarity, 0, 1) : 0;

  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return {
    similarity,
    conceptName: row.concept_name,
    metadata,
  };
}

async function columnHasIsDeleted(
  sqlPool: Awaited<ReturnType<typeof getSqlServerPool>>,
  identifier: TableIdentifier,
  cache: Map<string, boolean>
): Promise<boolean> {
  const cacheKey = `${identifier.schema}.${identifier.table}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const result = await sqlPool
    .request()
    .input("schema", sql.NVarChar, identifier.schema)
    .input("table", sql.NVarChar, identifier.table)
    .query(
      `
        SELECT COUNT(*) AS columnCount
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema
          AND TABLE_NAME = @table
          AND COLUMN_NAME = 'isDeleted'
      `
    );

  const count = Number(result.recordset?.[0]?.columnCount ?? 0);
  const hasColumn = Number.isFinite(count) && count > 0;
  cache.set(cacheKey, hasColumn);
  return hasColumn;
}

async function fetchValueSamples(
  sqlPool: Awaited<ReturnType<typeof getSqlServerPool>>,
  identifier: TableIdentifier,
  column: string,
  hasIsDeletedColumn: boolean
): Promise<{ samples: ValueSampleRow[]; total: number }> {
  const qualified = buildQualifiedName(identifier, column);
  if (!qualified) {
    return { samples: [], total: 0 };
  }

  const { tableSql, columnSql } = qualified;

  const whereClauses = [`${columnSql} IS NOT NULL`];
  if (hasIsDeletedColumn) {
    whereClauses.push("isDeleted = 0");
  }
  const whereSql = whereClauses.join(" AND ");

  const totalResult = await sqlPool.request().query(
    `
      SELECT COUNT(*) AS totalCount
      FROM ${tableSql}
      WHERE ${whereSql}
    `
  );

  const total = Number(totalResult.recordset?.[0]?.totalCount ?? 0);
  if (!Number.isFinite(total) || total === 0) {
    return { samples: [], total: 0 };
  }

  const sampleRequest = sqlPool.request();
  sampleRequest.input("limit", sql.Int, VALUE_SAMPLE_LIMIT);

  const sampleResult = await sampleRequest.query(
    `
      SELECT TOP (@limit)
        ${columnSql} AS value,
        COUNT(*) AS sample_count
      FROM ${tableSql}
      WHERE ${whereSql}
      GROUP BY ${columnSql}
      ORDER BY COUNT(*) DESC, ${columnSql}
    `
  );

  return {
    samples: sampleResult.recordset ?? [],
    total,
  };
}

function extractSemanticCategory(
  metadata: Record<string, unknown>,
  fallback: string
): string {
  const categoryKey = metadata["category_key"];
  if (typeof categoryKey === "string" && categoryKey.trim().length > 0) {
    return categoryKey.trim();
  }
  return fallback;
}

export async function discoverNonFormValues(
  options: NonFormValueDiscoveryOptions
): Promise<NonFormValueDiscoveryResult> {
  console.log("🔍 Non-form values discovery started");

  if (!options?.customerId) {
    throw new Error("customerId is required for non-form value discovery");
  }
  if (!options?.connectionString) {
    throw new Error(
      "connectionString is required for non-form value discovery"
    );
  }

  const pgPool = await getInsightGenDbPool();
  const sqlPool = await getSqlServerPool(options.connectionString);
  const embeddingService = getEmbeddingService();

  const columnResult = await pgPool.query<NonFormColumnRow>(
    `
      SELECT
        id,
        table_name,
        column_name,
        data_type,
        semantic_concept,
        semantic_category,
        confidence
      FROM "SemanticIndexNonForm"
      WHERE customer_id = $1
        AND is_filterable = true
    `,
    [options.customerId]
  );

  console.log(
    `🔍 Found ${columnResult.rows.length} non-form columns to process`
  );

  const columns = columnResult.rows ?? [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const records: NonFormValueRecord[] = [];
  const confidenceValues: number[] = [];
  const isDeletedCache = new Map<string, boolean>();

  let columnsProcessed = 0;
  let valuesDiscovered = 0;
  let lowConfidenceValues = 0;

  if (columns.length === 0) {
    console.log("⚠️ No filterable non-form columns found for value discovery");
    warnings.push("No filterable non-form columns found for value discovery");
    return {
      customerId: options.customerId,
      columnsProcessed: 0,
      valuesDiscovered: 0,
      lowConfidenceValues: 0,
      averageConfidence: null,
      warnings,
      errors,
      records,
    };
  }

  for (const column of columns) {
    const identifier = splitTableIdentifier(column.table_name);
    if (!identifier) {
      warnings.push(
        `Skipping column with invalid table identifier: ${column.table_name}`
      );
      continue;
    }

    const qualified = buildQualifiedName(identifier, column.column_name);
    if (!qualified) {
      warnings.push(
        `Skipping column with invalid name: ${column.table_name}.${column.column_name}`
      );
      continue;
    }

    console.log(
      `🔄 Processing column ${columnsProcessed + 1}/${columns.length}: ${
        column.table_name
      }.${column.column_name}`
    );

    const hasIsDeleted = await columnHasIsDeleted(
      sqlPool,
      identifier,
      isDeletedCache
    );

    let valueSamples: ValueSampleRow[] = [];
    let totalSamples = 0;

    try {
      console.log(`   Fetching value samples...`);
      const { samples, total } = await fetchValueSamples(
        sqlPool,
        identifier,
        column.column_name,
        hasIsDeleted
      );
      valueSamples = samples;
      totalSamples = total;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error fetching column values";
      errors.push(
        `Failed to fetch values for ${column.table_name}.${column.column_name}: ${message}`
      );
      continue;
    }

    columnsProcessed++;

    if (totalSamples === 0 || valueSamples.length === 0) {
      warnings.push(
        `No sample values found for ${column.table_name}.${column.column_name}`
      );
      continue;
    }

    try {
      await pgPool.query(
        `DELETE FROM "SemanticIndexNonFormValue" WHERE semantic_index_nonform_id = $1`,
        [column.id]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error clearing existing values";
      errors.push(
        `Failed to clear previous values for ${column.table_name}.${column.column_name}: ${message}`
      );
      continue;
    }

    for (const sample of valueSamples) {
      const valueText = normaliseValueText(sample.value);
      if (!valueText) {
        continue;
      }

      const sampleCount = Number(sample.sample_count ?? 0);
      if (!Number.isFinite(sampleCount) || sampleCount === 0) {
        continue;
      }

      const frequencyRaw = sampleCount / totalSamples;
      const frequency = Number.isFinite(frequencyRaw)
        ? Math.round(frequencyRaw * 100) / 100
        : 0;

      let confidence: number | null = null;
      let semanticCategory: string | null = null;
      let reviewRequired = true;

      try {
        const embeddingPrompt = `${valueText} (${column.table_name}.${column.column_name})`;
        const embedding = await embeddingService.generateEmbedding(
          embeddingPrompt
        );
        const match = await lookupOntologyMatch(pgPool, embedding);

        if (match) {
          confidence = Math.round(match.similarity * 100) / 100;
          semanticCategory = extractSemanticCategory(
            match.metadata,
            match.conceptName
          );
          reviewRequired = confidence < REVIEW_THRESHOLD;

          if (Number.isFinite(confidence)) {
            confidenceValues.push(confidence);
          }

          if (reviewRequired) {
            warnings.push(
              `${column.table_name}.${
                column.column_name
              } value "${valueText}" flagged for review (confidence ${confidence.toFixed(
                2
              )})`
            );
          }
        } else {
          warnings.push(
            `${column.table_name}.${column.column_name} value "${valueText}" has no ontology match`
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown error generating embedding";
        errors.push(
          `Failed to map value "${valueText}" for ${column.table_name}.${column.column_name}: ${message}`
        );
        continue;
      }

      reviewRequired = reviewRequired || confidence === null;

      const metadata = {
        sample_count: sampleCount,
        frequency,
        total_samples: totalSamples,
        review_required: reviewRequired,
        column_semantic_concept: column.semantic_concept,
        column_semantic_category: column.semantic_category,
      };

      try {
        await pgPool.query(
          `
            INSERT INTO "SemanticIndexNonFormValue" (
              semantic_index_nonform_id,
              value_text,
              value_code,
              semantic_category,
              confidence,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            column.id,
            valueText,
            null,
            semanticCategory,
            confidence,
            JSON.stringify(metadata),
          ]
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown error persisting value mapping";
        errors.push(
          `Failed to persist value "${valueText}" for ${column.table_name}.${column.column_name}: ${message}`
        );
        continue;
      }

      records.push({
        semanticIndexNonFormId: column.id,
        valueText,
        semanticCategory,
        confidence,
        sampleCount,
        frequency,
        reviewRequired,
      });
      valuesDiscovered++;
      if (reviewRequired) {
        lowConfidenceValues++;
      }
    }
  }

  const averageConfidence = summariseConfidence(confidenceValues);

  return {
    customerId: options.customerId,
    columnsProcessed,
    valuesDiscovered,
    lowConfidenceValues,
    averageConfidence,
    warnings,
    errors,
    records,
  };
}
