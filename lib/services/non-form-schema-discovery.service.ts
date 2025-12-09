import type { Pool } from "pg";

import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import measurementFamilies from "@/lib/config/measurement-families.json";
import {
  applyOverrideMetadataFields,
  createOverrideMetadata,
  formatOriginalValue,
  normalizeOverrideMetadata,
  shouldUseIncomingValue,
  type OverrideMetadata,
  type OverrideSource,
} from "@/lib/types/semantic-index";

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.7;

type ColumnRecord = {
  tableSchema: string;
  tableName: string;
  columnName: string;
  dataType: string | null;
  ordinalPosition: number | null;
  isNullable: string | null;
  characterMaxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  columnDefault: string | null;
};

type OntologyMatch = {
  conceptId: string;
  conceptName: string;
  canonicalName: string;
  conceptType: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

type MeasurementFamilyConfig = {
  tables: string[];
  columns: string[];
  canonical_concept: string;
  confidence: number;
  unit?: string;
};

type MeasurementFamiliesConfig = {
  families: Record<string, MeasurementFamilyConfig>;
};

export type NonFormSchemaDiscoveryOptions = {
  customerId: string;
  connectionString: string;
  discoveryRunId?: string | null;
};

export type NonFormSchemaDiscoveryColumn = {
  tableName: string;
  columnName: string;
  dataType: string | null;
  semanticConcept: string | null;
  semanticCategory: string | null;
  conceptId: string | null;
  confidence: number | null;
  isFilterable: boolean;
  isJoinable: boolean;
  isReviewRequired: boolean;
  reviewNote: string | null;
};

export type NonFormSchemaDiscoveryResult = {
  customerId: string;
  columns: NonFormSchemaDiscoveryColumn[];
  discoveredColumns: number;
  highConfidenceColumns: number;
  filterableColumns: number;
  joinableColumns: number;
  reviewRequiredColumns: number;
  averageConfidence: number | null;
  warnings: string[];
  errors: string[];
};

const NON_FILTERABLE_TYPES = new Set([
  "image",
  "text",
  "ntext",
  "sql_variant",
  "xml",
  "hierarchyid",
  "timestamp",
  "varbinary",
  "geography",
  "geometry",
]);

const LIKELY_JOIN_SUFFIXES = ["id", "_id", "fk", "_fk", "key", "_key"];

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

function buildEmbeddingPrompt(column: ColumnRecord): string {
  const qualifiedTable = `${column.tableSchema}.${column.tableName}`;
  const segments = [
    qualifiedTable.replace(/\./g, " "),
    column.columnName,
    column.dataType ?? "",
  ];
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(" ")
    .replace(/\s+/g, " ");
}

function inferFilterable(
  columnName: string,
  dataType: string | null
): { value: boolean; reason: string | null } {
  const normalisedType = normaliseDataType(dataType);
  if (normalisedType && NON_FILTERABLE_TYPES.has(normalisedType)) {
    return { value: false, reason: "Data type excluded from filtering" };
  }

  if (!normalisedType) {
    return { value: true, reason: "Unknown type, default filterable" };
  }

  if (normalisedType.includes("char")) {
    return { value: true, reason: "Textual column suitable for filters" };
  }
  if (normalisedType.includes("int")) {
    return { value: true, reason: "Integer column suitable for filters" };
  }
  if (
    normalisedType.includes("decimal") ||
    normalisedType.includes("numeric")
  ) {
    return { value: true, reason: "Numeric column suitable for filters" };
  }
  if (
    normalisedType.includes("date") ||
    normalisedType.includes("time") ||
    normalisedType.includes("datetime")
  ) {
    return { value: true, reason: "Temporal column suitable for filters" };
  }
  if (normalisedType.includes("uniqueidentifier")) {
    return {
      value: true,
      reason: "Identifier column suitable for equality filters",
    };
  }
  if (normalisedType === "bit") {
    return { value: true, reason: "Boolean column suitable for filters" };
  }

  return { value: false, reason: "Data type not recognised as filterable" };
}

function inferJoinable(
  columnName: string,
  dataType: string | null
): { value: boolean; reason: string | null } {
  const lowerCaseName = columnName.toLowerCase();
  const matchesSuffix = LIKELY_JOIN_SUFFIXES.some((suffix) =>
    lowerCaseName.endsWith(suffix)
  );

  if (!matchesSuffix) {
    return { value: false, reason: "Column name does not resemble a join key" };
  }

  const normalisedType = normaliseDataType(dataType);
  if (!normalisedType) {
    return {
      value: true,
      reason: "Likely join key based on naming convention",
    };
  }

  if (
    normalisedType.includes("int") ||
    normalisedType.includes("uniqueidentifier") ||
    normalisedType.includes("char")
  ) {
    return { value: true, reason: "Naming and type suggest foreign key" };
  }

  return {
    value: false,
    reason: "Naming matches join pattern but type is not join-friendly",
  };
}

function extractSemanticConcept(
  metadata: Record<string, unknown>,
  conceptType: string
): string {
  const conceptTypeKey = metadata["concept_type_key"];
  if (typeof conceptTypeKey === "string" && conceptTypeKey.trim().length > 0) {
    return conceptTypeKey.trim();
  }
  return conceptType;
}

function extractSemanticCategory(
  metadata: Record<string, unknown>,
  conceptName: string
): string {
  const categoryKey = metadata["category_key"];
  if (typeof categoryKey === "string" && categoryKey.trim().length > 0) {
    return categoryKey.trim();
  }
  return conceptName;
}

/**
 * Build a lookup map from ClinicalOntology.data_sources for measurement/time
 * aware discovery (4.S19B).
 *
 * Map key: "table.column" (e.g. "rpt.Measurement.area")
 * Value: { conceptName, conceptType, conceptId, confidence }
 */
async function buildOntologyDataSourceMap(
  pool: Pool
): Promise<
  Map<
    string,
    { conceptName: string; conceptType: string; conceptId: string; confidence?: number }
  >
> {
  const map = new Map<
    string,
    { conceptName: string; conceptType: string; conceptId: string; confidence?: number }
  >();

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          concept_name,
          concept_type,
          data_sources
        FROM "ClinicalOntology"
        WHERE data_sources IS NOT NULL
          AND jsonb_array_length(data_sources) > 0
      `
    );

    for (const row of result.rows) {
      const conceptId: string = row.id;
      const conceptName: string = row.concept_name;
      const conceptType: string = row.concept_type;
      const dataSources: any[] = Array.isArray(row.data_sources)
        ? row.data_sources
        : [];

      for (const entry of dataSources) {
        let table: string | null = null;
        let column: string | null = null;
        let confidence: number | undefined;

        if (typeof entry === "string") {
          const parts = entry.split(".");
          if (parts.length >= 2) {
            table = parts.slice(0, parts.length - 1).join(".").trim();
            column = parts[parts.length - 1].trim();
          }
        } else if (entry && typeof entry === "object") {
          table =
            typeof entry.table === "string" ? entry.table.trim() : null;
          column =
            typeof entry.column === "string" ? entry.column.trim() : null;
          confidence =
            typeof entry.confidence === "number"
              ? entry.confidence
              : undefined;
        }

        if (table) {
          table = table.toLowerCase();
        }
        if (column) {
          column = column.toLowerCase();
        }

        if (!table || !column) continue;

        const key = `${table}.${column}`;
        const existing = map.get(key);

        // Prefer higher confidence if multiple concepts reference same column
        if (!existing || (confidence ?? 0) > (existing.confidence ?? 0)) {
          map.set(key, {
            conceptName,
            conceptType,
            conceptId,
            confidence,
          });
        }
      }
    }
  } catch (error) {
    console.warn(
      "[NonFormSchemaDiscovery] Failed to build ontology data_sources map:",
      error instanceof Error ? error.message : error
    );
  }

  return map;
}

async function buildOntologyConceptNameMap(
  pool: Pool
): Promise<Map<string, { id: string; conceptType: string | null }>> {
  const conceptMap = new Map<
    string,
    { id: string; conceptType: string | null }
  >();

  try {
    const result = await pool.query(
      `
        SELECT id, concept_name, concept_type
        FROM "ClinicalOntology"
      `
    );

    for (const row of result.rows) {
      if (!row.concept_name) continue;
      const key = String(row.concept_name).toLowerCase();
      conceptMap.set(key, {
        id: row.id,
        conceptType: row.concept_type ?? null,
      });
    }
  } catch (error) {
    console.warn(
      "[NonFormSchemaDiscovery] Failed to build ontology concept map:",
      error instanceof Error ? error.message : error
    );
  }

  return conceptMap;
}

/**
 * Resolve measurement family heuristic for a given rpt.* column using
 * lib/config/measurement-families.json (4.S19B).
 */
function resolveMeasurementFamily(
  tableNameQualified: string,
  columnName: string
): { concept: string; confidence: number; familyKey: string } | null {
  const config = measurementFamilies as MeasurementFamiliesConfig;
  const familyEntries = Object.entries(config.families || {});

  const [schema, table] = tableNameQualified.split(".");
  const qualifiedTable =
    schema && table ? `${schema}.${table}` : tableNameQualified;
  const normalizedTable = qualifiedTable.toLowerCase();
  const normalizedColumn = columnName.toLowerCase();

  for (const [familyKey, family] of familyEntries) {
    const tableMatches = family.tables.some(
      (t) => t.toLowerCase() === normalizedTable
    );
    const columnMatches = family.columns.some(
      (c) => c.toLowerCase() === normalizedColumn
    );

    if (tableMatches && columnMatches) {
      return {
        concept: family.canonical_concept,
        confidence: family.confidence,
        familyKey,
      };
    }
  }

  return null;
}

async function fetchOntologyMatch(
  embedding: number[],
  pool: Pool
): Promise<OntologyMatch | null> {
  if (embedding.length === 0) {
    return null;
  }

  const vectorLiteral = toVectorLiteral(embedding);

  const result = await pool.query(
    `
      SELECT
        id,
        concept_name,
        canonical_name,
        concept_type,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM "ClinicalOntology"
      ORDER BY embedding <=> $1::vector
      LIMIT 1
    `,
    [vectorLiteral]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const similarity =
    typeof row.similarity === "number" ? clamp(row.similarity, 0, 1) : 0;

  return {
    conceptId: row.id,
    conceptName: row.concept_name,
    canonicalName: row.canonical_name,
    conceptType: row.concept_type,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : ({} as Record<string, unknown>),
    similarity,
  };
}

function buildColumnMetadata(
  column: ColumnRecord,
  heuristics: Record<string, unknown>
): Record<string, unknown> {
  return {
    schema: column.tableSchema,
    ordinalPosition: column.ordinalPosition,
    isNullable: column.isNullable === "YES",
    characterMaxLength: column.characterMaxLength,
    numericPrecision: column.numericPrecision,
    numericScale: column.numericScale,
    defaultValue: column.columnDefault,
    heuristics,
  };
}

function summariseConfidence(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export async function discoverNonFormSchema(
  options: NonFormSchemaDiscoveryOptions
): Promise<NonFormSchemaDiscoveryResult> {
  if (!options?.customerId) {
    throw new Error("customerId is required for non-form schema discovery");
  }
  if (!options?.connectionString) {
    throw new Error(
      "connectionString is required for non-form schema discovery"
    );
  }

  const sqlServerPool = await getSqlServerPool(options.connectionString);
  const pgPool = await getInsightGenDbPool();
  const embeddingService = getEmbeddingService();

  // Pre-compute ontology data_sources map for measurement-aware discovery (4.S19B)
  const ontologyDataSourceMap = await buildOntologyDataSourceMap(pgPool);
  const ontologyConceptNameMap = await buildOntologyConceptNameMap(pgPool);

  const columnResult = await sqlServerPool.request().query<ColumnRecord>(`
      SELECT
        c.TABLE_SCHEMA AS tableSchema,
        c.TABLE_NAME AS tableName,
        c.COLUMN_NAME AS columnName,
        c.DATA_TYPE AS dataType,
        c.ORDINAL_POSITION AS ordinalPosition,
        c.IS_NULLABLE AS isNullable,
        c.CHARACTER_MAXIMUM_LENGTH AS characterMaxLength,
        c.NUMERIC_PRECISION AS numericPrecision,
        c.NUMERIC_SCALE AS numericScale,
        c.COLUMN_DEFAULT AS columnDefault
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = 'rpt'
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
    `);

  const columns = columnResult.recordset ?? [];
  const processedColumns: NonFormSchemaDiscoveryColumn[] = [];
  const confidenceValues: number[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const processedKeys: string[] = [];

  let highConfidenceColumns = 0;
  let filterableColumns = 0;
  let joinableColumns = 0;
  let reviewRequiredColumns = 0;
  let hadUpsertError = false;

  for (const column of columns) {
    const tableNameQualified = `${column.tableSchema}.${column.tableName}`;
    const normalizedTableName = tableNameQualified.toLowerCase();
    const normalizedColumnName = column.columnName.toLowerCase();
    const columnKey = `${tableNameQualified}::${column.columnName}`;
    processedKeys.push(columnKey);

    const embeddingPrompt = buildEmbeddingPrompt(column);

    let semanticConcept: string | null = null;
    let semanticCategory: string | null = null;
    let semanticConceptId: string | null = null;
    let confidence: number | null = null;
    let isFilterable = false;
    let isJoinable = false;
    let isReviewRequired = true;
    let reviewNote: string | null = null;
    let assignmentSource: OverrideSource | null = null;
    let assignmentReason: string | undefined;

    const filterableHeuristic = inferFilterable(
      column.columnName,
      column.dataType
    );
    const joinableHeuristic = inferJoinable(column.columnName, column.dataType);

    try {
      const embedding = await embeddingService.generateEmbedding(
        embeddingPrompt
      );
      const match = await fetchOntologyMatch(embedding, pgPool);
      const reviewSources: string[] = [];

      // First, check if this column is explicitly referenced in ClinicalOntology.data_sources
      const dataSourceKey = `${normalizedTableName}.${normalizedColumnName}`;
      const ontologySource = ontologyDataSourceMap.get(dataSourceKey);

      if (ontologySource) {
        // Ontology-backed mapping (highest precedence for measurement/time fields)
        semanticConcept = ontologySource.conceptName;
        semanticCategory = ontologySource.conceptType;
        semanticConceptId = ontologySource.conceptId;
        assignmentSource = "ontology_backed";
        assignmentReason = `ontology_data_sources:${dataSourceKey}`;
        console.log(
          `[NonFormDiscovery] ${tableNameQualified}.${column.columnName} → ${semanticConcept} via ontology data_sources`
        );
        confidence =
          typeof ontologySource.confidence === "number"
            ? clamp(ontologySource.confidence, 0, 1)
            : 0.95;
        confidenceValues.push(confidence);

        reviewSources.push(`ontology_data_sources:${dataSourceKey}`);
      } else if (match) {
        // Fall back to embedding-based ontology match
        semanticConcept = extractSemanticConcept(
          match.metadata,
          match.conceptType
        );
        semanticCategory = extractSemanticCategory(
          match.metadata,
          match.conceptName
        );
        semanticConceptId = match.conceptId;
        assignmentSource = "discovery_inferred";
        assignmentReason = `ontology_embedding:${match.conceptName}`;
        console.log(
          `[NonFormDiscovery] ${tableNameQualified}.${column.columnName} → ${semanticConcept} via embedding (${assignmentReason})`
        );
        confidence = Math.round(match.similarity * 100) / 100;
        confidenceValues.push(confidence);
        reviewSources.push(
          `ontology_embedding:${match.conceptName}`
        );
      } else {
        warnings.push(
          `${tableNameQualified}.${column.columnName} has no ontology match`
        );
      }

      // Apply measurement family heuristic only if we still don't have a concept
      if (!semanticConcept) {
        const familyMatch = resolveMeasurementFamily(
          tableNameQualified,
          column.columnName
        );
        if (familyMatch) {
          semanticConcept = familyMatch.concept;
          semanticCategory = familyMatch.familyKey;
          const conceptLookup = ontologyConceptNameMap.get(
            familyMatch.concept.toLowerCase()
          );
          semanticConceptId = conceptLookup?.id ?? null;
          assignmentSource = "4.S19_heuristic";
          assignmentReason = `measurement_family:${familyMatch.familyKey}`;
          console.log(
            `[NonFormDiscovery] ${tableNameQualified}.${column.columnName} → ${semanticConcept} via measurement family ${familyMatch.familyKey}`
          );
          confidence = familyMatch.confidence;
          confidenceValues.push(confidence);
          reviewSources.push(
            `measurement_family:${familyMatch.familyKey}`
          );
        }
      }

      if (confidence !== null) {
        const isHighConfidence = confidence >= HIGH_CONFIDENCE_THRESHOLD;
        if (isHighConfidence) {
          highConfidenceColumns++;
        }
      }

      // Mark columns as filterable/joinable based on data type, not confidence.
      isFilterable = filterableHeuristic.value;
      isJoinable = joinableHeuristic.value;
      isReviewRequired =
        confidence === null ? true : confidence < REVIEW_THRESHOLD;

      if (confidence !== null && isReviewRequired) {
        const displayConfidence = confidence;
        reviewRequiredColumns++;
        warnings.push(
          `${tableNameQualified}.${
            column.columnName
          } flagged for review (confidence ${displayConfidence.toFixed(
            2
          )})`
        );
        if (!reviewNote) {
          reviewNote = `Confidence ${displayConfidence.toFixed(
            2
          )} below review threshold ${REVIEW_THRESHOLD}`;
        }
      }

      if (reviewSources.length > 0) {
        const sourceTag = `[SOURCE:${reviewSources.join("|")}]`;
        reviewNote = reviewNote
          ? `${sourceTag} ${reviewNote}`
          : sourceTag;
      }

      if (isFilterable) {
        filterableColumns++;
      }
      if (isJoinable) {
        joinableColumns++;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error during discovery";
      reviewNote = `Discovery error: ${message}`;
      errors.push(`${tableNameQualified}.${column.columnName}: ${message}`);
    }

    if (confidence === null) {
      reviewRequiredColumns++;
      isFilterable = false;
      isJoinable = false;
    }

    const metadata = buildColumnMetadata(column, {
      embeddingPrompt,
      filterable: filterableHeuristic,
      joinable: joinableHeuristic,
      highConfidenceThreshold: HIGH_CONFIDENCE_THRESHOLD,
      reviewThreshold: REVIEW_THRESHOLD,
    }) as Record<string, any>;

    let semanticConceptToPersist = semanticConcept;
    let semanticCategoryToPersist = semanticCategory;
    let conceptIdToPersist = semanticConceptId;
    let metadataToPersist: Record<string, any> = metadata;
    const incomingOverride =
      assignmentSource && semanticConceptToPersist
        ? createOverrideMetadata({
            source: assignmentSource,
            reason: assignmentReason,
          })
        : null;
    let overrideMetadataToPersist: OverrideMetadata | null = null;
    let overrideBlocked = false;

    try {
      const existingRow = await pgPool.query(
        `
          SELECT semantic_concept, semantic_category, concept_id, metadata
          FROM "SemanticIndexNonForm"
          WHERE customer_id = $1
            AND table_name = $2
            AND column_name = $3
        `,
        [options.customerId, tableNameQualified, column.columnName]
      );

      if (existingRow.rows.length > 0) {
        const row = existingRow.rows[0];
        const existingMetadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        const existingOverride = normalizeOverrideMetadata(existingMetadata);

        metadataToPersist = {
          ...existingMetadata,
          ...metadata,
        };

        if (incomingOverride) {
          const canUpdateConcept = shouldUseIncomingValue({
            existing: existingOverride,
            incoming: incomingOverride,
            field: "semantic_concept",
          });

          if (!canUpdateConcept) {
            semanticConceptToPersist = row.semantic_concept;
            conceptIdToPersist = row.concept_id;
            overrideMetadataToPersist = existingOverride;
            overrideBlocked = true;
          } else {
            incomingOverride.original_value = formatOriginalValue(
              row.semantic_concept,
              row.semantic_category
            );
            overrideMetadataToPersist = incomingOverride;
          }

          const canUpdateCategory = shouldUseIncomingValue({
            existing: existingOverride,
            incoming: incomingOverride,
            field: "semantic_category",
          });

          if (!canUpdateCategory) {
            semanticCategoryToPersist = row.semantic_category;
            overrideMetadataToPersist =
              overrideMetadataToPersist ?? existingOverride;
            overrideBlocked = true;
          } else if (
            overrideMetadataToPersist === incomingOverride &&
            !incomingOverride.original_value
          ) {
            incomingOverride.original_value = formatOriginalValue(
              row.semantic_concept,
              row.semantic_category
            );
          }
        } else if (existingOverride) {
          overrideMetadataToPersist = existingOverride;
        }
      } else {
        metadataToPersist = metadata;
        overrideMetadataToPersist = incomingOverride;
      }
    } catch (error) {
      metadataToPersist = metadata;
      console.warn(
        `[NonFormSchemaDiscovery] Failed to check overrides for ${tableNameQualified}.${column.columnName}:`,
        error instanceof Error ? error.message : error
      );
      if (incomingOverride) {
        overrideMetadataToPersist = incomingOverride;
      }
    }

    metadataToPersist = applyOverrideMetadataFields(
      metadataToPersist,
      overrideMetadataToPersist
    );

    if (overrideBlocked) {
      const sourceLabel =
        overrideMetadataToPersist?.override_source ?? "manual_review";
      reviewNote = reviewNote
        ? `${reviewNote} [override preserved:${sourceLabel}]`
        : `[override preserved:${sourceLabel}]`;
      console.log(
        `[NonFormDiscovery] Override preserved for ${tableNameQualified}.${column.columnName} (source=${sourceLabel})`
      );
    }

    try {
      await pgPool.query(
        `
          INSERT INTO "SemanticIndexNonForm" (
            customer_id,
            table_name,
            column_name,
            data_type,
            semantic_concept,
            semantic_category,
            concept_id,
            is_filterable,
            is_joinable,
            confidence,
            is_review_required,
            review_note,
            discovered_at,
            discovery_run_id,
            metadata
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13
          )
          ON CONFLICT (customer_id, table_name, column_name)
          DO UPDATE SET
            data_type = EXCLUDED.data_type,
            semantic_concept = EXCLUDED.semantic_concept,
            semantic_category = EXCLUDED.semantic_category,
            concept_id = EXCLUDED.concept_id,
            is_filterable = EXCLUDED.is_filterable,
            is_joinable = EXCLUDED.is_joinable,
            confidence = EXCLUDED.confidence,
            is_review_required = EXCLUDED.is_review_required,
            review_note = EXCLUDED.review_note,
            discovered_at = NOW(),
            discovery_run_id = EXCLUDED.discovery_run_id,
            metadata = EXCLUDED.metadata
        `,
        [
          options.customerId,
          tableNameQualified,
          column.columnName,
          column.dataType,
          semanticConceptToPersist,
          semanticCategoryToPersist,
          conceptIdToPersist,
          isFilterable,
          isJoinable,
          confidence,
          isReviewRequired,
          reviewNote,
          options.discoveryRunId ?? null,
          metadataToPersist,
        ]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error writing discovery results";
      hadUpsertError = true;
      errors.push(
        `Failed to persist ${tableNameQualified}.${column.columnName}: ${message}`
      );
    }

    processedColumns.push({
      tableName: tableNameQualified,
      columnName: column.columnName,
      dataType: column.dataType,
      semanticConcept: semanticConceptToPersist,
      semanticCategory: semanticCategoryToPersist,
      conceptId: conceptIdToPersist,
      confidence,
      isFilterable,
      isJoinable,
      isReviewRequired,
      reviewNote,
    });
  }

  if (!hadUpsertError && processedKeys.length > 0) {
    try {
      await pgPool.query(
        `
          DELETE FROM "SemanticIndexNonForm"
          WHERE customer_id = $1
            AND NOT (table_name || '::' || column_name = ANY($2::text[]))
        `,
        [options.customerId, processedKeys]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error pruning stale columns";
      errors.push(`Failed to prune stale non-form columns: ${message}`);
    }
  }

  const averageConfidence = summariseConfidence(confidenceValues);

  return {
    customerId: options.customerId,
    columns: processedColumns,
    discoveredColumns: processedColumns.length,
    highConfidenceColumns,
    filterableColumns,
    joinableColumns,
    reviewRequiredColumns,
    averageConfidence,
    warnings,
    errors,
  };
}
