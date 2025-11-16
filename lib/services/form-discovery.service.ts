import type { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import {
  fetchAttributeSets,
  fetchAttributeTypeSummary,
} from "@/lib/services/discovery/silhouette-discovery.service";
import {
  createDiscoveryLogger,
  type DiscoveryLogger,
} from "@/lib/services/discovery-logger";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

export type FormDiscoveryOptions = {
  customerId: string;
  connectionString: string;
  discoveryRunId?: string | null;
};

export type FormDiscoveryResponse = {
  formsDiscovered: number | null;
  fieldsDiscovered: number | null;
  avgConfidence: number | null;
  fieldsRequiringReview: number | null;
  warnings: string[];
  errors: string[];
};

type OntologyMatch = {
  id: string;
  conceptName: string;
  conceptType: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
};

// Confidence thresholds
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.7;

/**
 * Convert embedding array to pgvector literal format
 */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Build embedding prompt for a form
 */
function buildFormEmbeddingPrompt(
  formName: string,
  description: string | null
): string {
  if (description && description.trim().length > 0) {
    return `${formName}: ${description}`;
  }
  return formName;
}

/**
 * Build embedding prompt for a field
 */
function buildFieldEmbeddingPrompt(
  fieldName: string,
  formName: string,
  variableName: string | null
): string {
  let prompt = `${fieldName} (${formName})`;
  if (variableName && variableName.trim().length > 0) {
    prompt += ` [${variableName}]`;
  }
  return prompt;
}

/**
 * Query ClinicalOntology for semantic match using vector similarity
 */
async function fetchOntologyMatch(
  embedding: number[],
  pool: Pool
): Promise<OntologyMatch | null> {
  const result = await pool.query<{
    id: string;
    concept_name: string;
    concept_type: string | null;
    metadata: Record<string, unknown>;
    similarity: number;
  }>(
    `
      SELECT
        id,
        concept_name,
        concept_type,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM "ClinicalOntology"
      WHERE is_deprecated = false
      ORDER BY embedding <=> $1::vector
      LIMIT 1
    `,
    [toVectorLiteral(embedding)]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    conceptName: row.concept_name,
    conceptType: row.concept_type,
    metadata: row.metadata ?? {},
    similarity: Number(row.similarity),
  };
}

/**
 * Extract semantic concept from ontology metadata
 */
function extractSemanticConcept(
  metadata: Record<string, unknown>,
  conceptType: string | null
): string {
  if (conceptType === "WOUND_TYPE" && metadata.woundType) {
    return String(metadata.woundType);
  }
  if (conceptType === "ANATOMICAL_LOCATION" && metadata.anatomicalSite) {
    return String(metadata.anatomicalSite);
  }
  if (conceptType === "CLINICAL_MEASURE" && metadata.measureType) {
    return String(metadata.measureType);
  }
  return "unknown";
}

/**
 * Extract semantic category from ontology metadata
 */
function extractSemanticCategory(
  metadata: Record<string, unknown>,
  conceptName: string
): string {
  return String(metadata.category ?? conceptName);
}

/**
 * Map Silhouette dataType to human-readable type
 * Reference: Silhouette AttributeType.dataType column values
 */
function mapDataType(dataType: number): string {
  const typeMap: { [key: number]: string } = {
    1: "File",
    2: "UserList",
    3: "CalculatedValue",
    4: "Information",
    5: "SourceList",
    56: "Integer",
    58: "DateTime",
    61: "Date",
    104: "Boolean",
    106: "Decimal",
    231: "Text",
    1000: "SingleSelect", // SingleSelectList
    1001: "MultiSelect", // MultiSelectList
    1004: "ImageCapture",
    1005: "Unit",
  };

  const mappedType = typeMap[dataType];

  if (!mappedType) {
    console.warn(
      `⚠️ Unknown Silhouette dataType: ${dataType}. Please update mapDataType function.`
    );
    return "Unknown";
  }

  return mappedType;
}

/**
 * Discover form metadata by:
 * 1. Querying the customer's Silhouette database for available assessment forms
 * 2. Generating embeddings for each form and field
 * 3. Matching against ClinicalOntology for semantic concepts
 * 4. Populating SemanticIndex and SemanticIndexField tables
 */
export async function discoverFormMetadata(
  options: FormDiscoveryOptions
): Promise<FormDiscoveryResponse> {
  if (!options?.customerId) {
    return {
      formsDiscovered: 0,
      fieldsDiscovered: 0,
      avgConfidence: null,
      fieldsRequiringReview: 0,
      warnings: ["No customer ID provided for form discovery"],
      errors: [],
    };
  }

  if (!options?.connectionString) {
    return {
      formsDiscovered: 0,
      fieldsDiscovered: 0,
      avgConfidence: null,
      fieldsRequiringReview: 0,
      warnings: ["No connection string provided for form discovery"],
      errors: [],
    };
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  let formsProcessed = 0;
  let fieldsProcessed = 0;
  const confidenceValues: number[] = [];
  let fieldsRequiringReview = 0;

  // Create logger instance
  const logger = options.discoveryRunId
    ? createDiscoveryLogger(options.discoveryRunId)
    : createDiscoveryLogger("temp-form-discovery");

  try {
    const pgPool = await getInsightGenDbPool();

    // Set pool for database persistence (optional if runId not available)
    if (options.discoveryRunId) {
      logger.setPool(pgPool);
    }

    const embeddingService = getEmbeddingService();

    // Step 0: Clean all existing semantic index data for this customer
    // This ensures we don't have stale data (deleted forms/fields/options)
    logger.startTimer("clean_semantic_index");
    logger.info(
      "form_discovery",
      "cleanup",
      `Cleaning existing semantic index data for customer ${options.customerId}`
    );

    // Delete in correct order (options -> fields -> forms) due to foreign key constraints
    const deleteOptionsResult = await pgPool.query(
      `
        DELETE FROM "SemanticIndexOption"
        WHERE semantic_index_field_id IN (
          SELECT sif.id
          FROM "SemanticIndexField" sif
          JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
          WHERE si.customer_id = $1
        )
      `,
      [options.customerId]
    );

    const deleteFieldsResult = await pgPool.query(
      `
        DELETE FROM "SemanticIndexField"
        WHERE semantic_index_id IN (
          SELECT id FROM "SemanticIndex" WHERE customer_id = $1
        )
      `,
      [options.customerId]
    );

    const deleteFormsResult = await pgPool.query(
      `DELETE FROM "SemanticIndex" WHERE customer_id = $1`,
      [options.customerId]
    );

    logger.endTimer(
      "clean_semantic_index",
      "form_discovery",
      "cleanup",
      `Cleaned ${deleteOptionsResult.rowCount} options, ${deleteFieldsResult.rowCount} fields, ${deleteFormsResult.rowCount} forms`,
      {
        optionsDeleted: deleteOptionsResult.rowCount,
        fieldsDeleted: deleteFieldsResult.rowCount,
        formsDeleted: deleteFormsResult.rowCount,
      }
    );

    // Step 1: Fetch forms from customer's Silhouette database
    logger.startTimer("fetch_forms");
    logger.info(
      "form_discovery",
      "silhouette",
      "Fetching forms from customer database"
    );
    const forms = await fetchAttributeSets(options.connectionString);
    const fetchFormsDuration = logger.endTimer(
      "fetch_forms",
      "form_discovery",
      "silhouette",
      `Successfully fetched ${forms.length} forms`,
      { formCount: forms.length }
    );

    if (forms.length === 0) {
      logger.warn(
        "form_discovery",
        "silhouette",
        "No forms found in customer database"
      );
      warnings.push("No forms found in customer database");
      return {
        formsDiscovered: 0,
        fieldsDiscovered: 0,
        avgConfidence: null,
        fieldsRequiringReview: 0,
        warnings,
        errors,
      };
    }

    // Step 2: Process each form
    for (const form of forms) {
      try {
        logger.debug(
          "form_discovery",
          "processor",
          `Processing form: ${form.name}`
        );
        logger.startTimer(`form_${form.attributeSetKey}`);

        // Step 2a: Fetch fields for this form
        // IMPORTANT: Use form.id (not attributeSetKey) because AttributeType.attributeSetFk references AttributeSet.id
        const fields = await fetchAttributeTypeSummary(
          options.connectionString,
          form.id
        );

        if (fields.length === 0) {
          logger.warn(
            "form_discovery",
            "processor",
            `Form "${form.name}" has no fields`
          );
          warnings.push(`Form "${form.name}" has no fields`);
          continue;
        }

        logger.debug(
          "form_discovery",
          "processor",
          `Found ${fields.length} fields`,
          {
            formName: form.name,
            fieldCount: fields.length,
          }
        );

        // Step 2b: Process each field and generate embeddings
        const fieldResults: Array<{
          fieldId: string;
          fieldName: string;
          dataType: string;
          semanticConcept: string | null;
          semanticCategory: string | null;
          confidence: number | null;
          isReviewRequired: boolean;
          reviewNote: string | null;
          ordinal: number;
          variableName: string | null;
        }> = [];

        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          const fieldName = field.name;
          const embeddingPrompt = buildFieldEmbeddingPrompt(
            fieldName,
            form.name,
            field.variableName
          );

          // DEBUG: Log the raw dataType value from Silhouette
          logger.debug(
            "form_discovery",
            "field_processing",
            `🔍 Processing field: ${fieldName} (raw dataType: ${
              field.dataType
            }, type: ${typeof field.dataType})`,
            {
              fieldName: field.name,
              rawDataType: field.dataType,
              dataTypeType: typeof field.dataType,
              variableName: field.variableName,
              formName: form.name,
            }
          );

          let semanticConcept: string | null = null;
          let semanticCategory: string | null = null;
          let confidence: number | null = null;
          let isReviewRequired = true;
          let reviewNote: string | null = null;

          try {
            // Generate embedding
            const embedding = await embeddingService.generateEmbedding(
              embeddingPrompt
            );

            // Match against ClinicalOntology
            const match = await fetchOntologyMatch(embedding, pgPool);

            if (match) {
              semanticConcept = extractSemanticConcept(
                match.metadata,
                match.conceptType
              );
              semanticCategory = extractSemanticCategory(
                match.metadata,
                match.conceptName
              );
              confidence = Math.round(match.similarity * 100) / 100;
              confidenceValues.push(confidence);

              isReviewRequired = confidence < REVIEW_THRESHOLD;

              if (isReviewRequired) {
                fieldsRequiringReview++;
                reviewNote = `Confidence ${confidence.toFixed(
                  2
                )} below review threshold ${REVIEW_THRESHOLD}`;
                warnings.push(
                  `${
                    form.name
                  }.${fieldName} flagged for review (confidence ${confidence.toFixed(
                    2
                  )})`
                );
              }
            } else {
              reviewNote = "No ontology match found";
              warnings.push(`${form.name}.${fieldName} has no ontology match`);
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            reviewNote = `Discovery error: ${message}`;
            errors.push(`${form.name}.${fieldName}: ${message}`);
          }

          const mappedDataType = mapDataType(field.dataType);

          // DEBUG: Log the mapping result
          logger.debug(
            "form_discovery",
            "field_processing",
            `📊 Data type mapping: ${field.dataType} → ${mappedDataType}`,
            {
              fieldName: field.name,
              rawDataType: field.dataType,
              mappedDataType,
              isSelectField:
                mappedDataType === "SingleSelect" ||
                mappedDataType === "MultiSelect",
            }
          );

          fieldResults.push({
            fieldId: field.id,
            fieldName: field.name,
            dataType: mappedDataType,
            semanticConcept,
            semanticCategory,
            confidence,
            isReviewRequired,
            reviewNote,
            ordinal: i,
            variableName: field.variableName,
          });

          fieldsProcessed++;
        }

        // DEBUG: Log summary of field data types found
        const dataTypeCounts = fieldResults.reduce((acc, field) => {
          acc[field.dataType] = (acc[field.dataType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        logger.info(
          "form_discovery",
          "field_processing",
          `📊 Field data type summary for form "${form.name}"`,
          {
            formName: form.name,
            totalFields: fieldResults.length,
            dataTypeCounts,
            selectFields: fieldResults.filter(
              (f) =>
                f.dataType === "SingleSelect" || f.dataType === "MultiSelect"
            ).length,
            unknownFields: fieldResults.filter((f) => f.dataType === "Unknown")
              .length,
          }
        );

        // Step 2c: Calculate form-level statistics
        const formConfidenceValues = fieldResults
          .map((f) => f.confidence)
          .filter((c): c is number => c !== null);

        const avgFormConfidence =
          formConfidenceValues.length > 0
            ? formConfidenceValues.reduce((sum, c) => sum + c, 0) /
              formConfidenceValues.length
            : null;

        // Step 2d: Insert/Update SemanticIndex record for this form
        const formMetadata = {
          description: form.description,
          type: form.type,
          attributeSetKey: form.attributeSetKey,
          fieldCount: fields.length,
        };

        const formInsertResult = await pgPool.query<{ id: string }>(
          `
            INSERT INTO "SemanticIndex" (
              customer_id,
              form_identifier,
              form_name,
              form_type,
              discovered_at,
              discovery_run_id,
              field_count,
              avg_confidence,
              metadata
            ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
            ON CONFLICT (customer_id, form_identifier)
            DO UPDATE SET
              form_name = EXCLUDED.form_name,
              form_type = EXCLUDED.form_type,
              discovered_at = NOW(),
              discovery_run_id = EXCLUDED.discovery_run_id,
              field_count = EXCLUDED.field_count,
              avg_confidence = EXCLUDED.avg_confidence,
              metadata = EXCLUDED.metadata
            RETURNING id
          `,
          [
            options.customerId,
            form.attributeSetKey,
            form.name,
            form.type.toString(),
            options.discoveryRunId ?? null,
            fields.length,
            avgFormConfidence,
            formMetadata,
          ]
        );

        const semanticIndexId = formInsertResult.rows[0].id;

        // Step 2e: Insert/Update SemanticIndexField records for each field
        for (const fieldResult of fieldResults) {
          const fieldMetadata = {
            variableName: fieldResult.variableName,
            attributeTypeId: fieldResult.fieldId,
          };

          await pgPool.query(
            `
              INSERT INTO "SemanticIndexField" (
                semantic_index_id,
                attribute_type_id,
                field_name,
                data_type,
                ordinal,
                semantic_concept,
                semantic_category,
                confidence,
                is_review_required,
                review_note,
                metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              ON CONFLICT (semantic_index_id, attribute_type_id)
              DO UPDATE SET
                field_name = EXCLUDED.field_name,
                data_type = EXCLUDED.data_type,
                ordinal = EXCLUDED.ordinal,
                semantic_concept = EXCLUDED.semantic_concept,
                semantic_category = EXCLUDED.semantic_category,
                confidence = EXCLUDED.confidence,
                is_review_required = EXCLUDED.is_review_required,
                review_note = EXCLUDED.review_note,
                metadata = EXCLUDED.metadata
            `,
            [
              semanticIndexId,
              fieldResult.fieldId,
              fieldResult.fieldName,
              fieldResult.dataType,
              fieldResult.ordinal,
              fieldResult.semanticConcept,
              fieldResult.semanticCategory,
              fieldResult.confidence,
              fieldResult.isReviewRequired,
              fieldResult.reviewNote,
              fieldMetadata,
            ]
          );

          // Step 2f: Discover field options for select/multi-select fields
          // Data type 1 = SingleSelect, type 2 = MultiSelect
          if (
            fieldResult.dataType === "SingleSelect" ||
            fieldResult.dataType === "MultiSelect"
          ) {
            logger.info(
              "form_discovery",
              "options",
              `🔍 Starting option discovery for ${fieldResult.dataType} field: ${fieldResult.fieldName} (ID: ${fieldResult.fieldId})`,
              {
                fieldName: fieldResult.fieldName,
                fieldId: fieldResult.fieldId,
                dataType: fieldResult.dataType,
                formName: form.name,
              }
            );

            try {
              // Fetch options from AttributeLookup (in customer's SQL Server DB)
              logger.debug(
                "form_discovery",
                "options",
                `🔗 Getting SQL Server connection for customer database`
              );

              const sqlServerPool = await getSqlServerPool(
                options.connectionString
              );

              logger.debug(
                "form_discovery",
                "options",
                `📊 Querying dbo.AttributeLookup for field ${fieldResult.fieldId}`,
                {
                  fieldId: fieldResult.fieldId,
                  query:
                    "SELECT id, [text], [code] FROM dbo.AttributeLookup WHERE attributeTypeFk = @1 AND isDeleted = 0",
                }
              );

              const optionsResult = await sqlServerPool
                .request()
                .input("fieldId", fieldResult.fieldId).query(`
                  SELECT
                    id,
                    [text] as text,
                    [code] as code
                  FROM dbo.AttributeLookup
                  WHERE attributeTypeFk = @fieldId
                    AND isDeleted = 0
                  ORDER BY orderIndex
                `);

              const fieldOptions = optionsResult.recordset ?? [];

              logger.info(
                "form_discovery",
                "options",
                `✅ Found ${fieldOptions.length} options for field: ${fieldResult.fieldName}`,
                {
                  fieldName: fieldResult.fieldName,
                  optionCount: fieldOptions.length,
                  options: fieldOptions.map((opt) => ({
                    id: opt.id,
                    text: opt.text,
                    code: opt.code,
                  })),
                }
              );

              if (fieldOptions.length === 0) {
                logger.warn(
                  "form_discovery",
                  "options",
                  `⚠️ No options found for ${fieldResult.dataType} field: ${fieldResult.fieldName}. This might indicate: 1) Field has no options in Silhouette DB, 2) Query failed, 3) Field is not actually a select field`,
                  {
                    fieldName: fieldResult.fieldName,
                    fieldId: fieldResult.fieldId,
                    dataType: fieldResult.dataType,
                  }
                );
                continue;
              }

              // Get the SemanticIndexField ID
              logger.debug(
                "form_discovery",
                "options",
                `🔍 Looking up SemanticIndexField ID for field ${fieldResult.fieldName}`,
                {
                  semanticIndexId,
                  fieldId: fieldResult.fieldId,
                }
              );

              const fieldRecord = await pgPool.query<{ id: string }>(
                `
                  SELECT id FROM "SemanticIndexField"
                  WHERE semantic_index_id = $1
                    AND attribute_type_id = $2
                `,
                [semanticIndexId, fieldResult.fieldId]
              );

              if (fieldRecord.rows.length === 0) {
                logger.error(
                  "form_discovery",
                  "options",
                  `❌ Could not find SemanticIndexField for ${fieldResult.fieldName}. This means the field was not properly inserted into SemanticIndexField table.`,
                  {
                    fieldName: fieldResult.fieldName,
                    fieldId: fieldResult.fieldId,
                    semanticIndexId,
                    availableFields: await pgPool
                      .query(
                        `SELECT id, field_name, attribute_type_id FROM "SemanticIndexField" WHERE semantic_index_id = $1`,
                        [semanticIndexId]
                      )
                      .then((result) => result.rows),
                  }
                );
                continue;
              }

              const semanticIndexFieldId = fieldRecord.rows[0].id;

              logger.info(
                "form_discovery",
                "options",
                `🎯 Processing ${fieldOptions.length} options for field ${fieldResult.fieldName}`,
                {
                  fieldName: fieldResult.fieldName,
                  semanticIndexFieldId,
                  optionCount: fieldOptions.length,
                }
              );

              let processedOptions = 0;
              let successfulInserts = 0;
              let failedInserts = 0;

              // Process each option
              for (const option of fieldOptions) {
                processedOptions++;

                logger.debug(
                  "form_discovery",
                  "options",
                  `🔄 Processing option ${processedOptions}/${fieldOptions.length}: "${option.text}" (${option.code})`,
                  {
                    optionText: option.text,
                    optionCode: option.code,
                    optionId: option.id,
                    progress: `${processedOptions}/${fieldOptions.length}`,
                  }
                );

                try {
                  // Generate embedding for option
                  logger.debug(
                    "form_discovery",
                    "options",
                    `🧠 Generating embedding for option: "${option.text}"`
                  );

                  const optionEmbedding =
                    await embeddingService.generateEmbedding(
                      `${option.text} (${form.name} ${fieldResult.fieldName})`
                    );

                  logger.debug(
                    "form_discovery",
                    "options",
                    `🔍 Matching option against ClinicalOntology`,
                    {
                      optionText: option.text,
                      embeddingLength: optionEmbedding.length,
                    }
                  );

                  const optionMatch = await fetchOntologyMatch(
                    optionEmbedding,
                    pgPool
                  );

                  let optionSemanticCategory: string | null = null;
                  let optionConfidence: number | null = null;

                  if (optionMatch) {
                    optionSemanticCategory = extractSemanticCategory(
                      optionMatch.metadata,
                      optionMatch.conceptName
                    );
                    optionConfidence =
                      Math.round(optionMatch.similarity * 100) / 100;

                    logger.debug(
                      "form_discovery",
                      "options",
                      `✅ Found ontology match for "${option.text}": ${optionSemanticCategory} (confidence: ${optionConfidence})`,
                      {
                        optionText: option.text,
                        semanticCategory: optionSemanticCategory,
                        confidence: optionConfidence,
                        conceptName: optionMatch.conceptName,
                      }
                    );
                  } else {
                    logger.debug(
                      "form_discovery",
                      "options",
                      `⚠️ No ontology match found for "${option.text}"`,
                      { optionText: option.text }
                    );
                  }

                  const optionMetadata = {
                    optionCode: option.code,
                    fieldName: fieldResult.fieldName,
                    formName: form.name,
                  };

                  logger.debug(
                    "form_discovery",
                    "options",
                    `💾 Inserting option into SemanticIndexOption table`,
                    {
                      semanticIndexFieldId,
                      optionValue: option.text,
                      optionCode: option.code,
                      semanticCategory: optionSemanticCategory,
                      confidence: optionConfidence,
                    }
                  );

                  // Handle case where option_code might be null
                  if (option.code) {
                    // Use ON CONFLICT when option_code is not null
                    await pgPool.query(
                      `
                        INSERT INTO "SemanticIndexOption" (
                          semantic_index_field_id,
                          option_value,
                          option_code,
                          semantic_category,
                          confidence,
                          metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (semantic_index_field_id, option_code)
                        DO UPDATE SET
                          option_value = EXCLUDED.option_value,
                          semantic_category = EXCLUDED.semantic_category,
                          confidence = EXCLUDED.confidence,
                          metadata = EXCLUDED.metadata
                      `,
                      [
                        semanticIndexFieldId,
                        option.text,
                        option.code,
                        optionSemanticCategory,
                        optionConfidence,
                        JSON.stringify(optionMetadata),
                      ]
                    );
                  } else {
                    // For options without codes, check if option_value already exists
                    const existingOption = await pgPool.query(
                      `
                        SELECT id FROM "SemanticIndexOption"
                        WHERE semantic_index_field_id = $1 
                          AND option_value = $2 
                          AND option_code IS NULL
                      `,
                      [semanticIndexFieldId, option.text]
                    );

                    if (existingOption.rows.length === 0) {
                      // Insert new option
                      await pgPool.query(
                        `
                          INSERT INTO "SemanticIndexOption" (
                            semantic_index_field_id,
                            option_value,
                            option_code,
                            semantic_category,
                            confidence,
                            metadata
                          ) VALUES ($1, $2, $3, $4, $5, $6)
                        `,
                        [
                          semanticIndexFieldId,
                          option.text,
                          null,
                          optionSemanticCategory,
                          optionConfidence,
                          JSON.stringify(optionMetadata),
                        ]
                      );
                    } else {
                      // Update existing option
                      await pgPool.query(
                        `
                          UPDATE "SemanticIndexOption"
                          SET semantic_category = $1,
                              confidence = $2,
                              metadata = $3
                          WHERE id = $4
                        `,
                        [
                          optionSemanticCategory,
                          optionConfidence,
                          JSON.stringify(optionMetadata),
                          existingOption.rows[0].id,
                        ]
                      );
                    }
                  }

                  successfulInserts++;

                  logger.debug(
                    "form_discovery",
                    "options",
                    `✅ Successfully inserted option "${option.text}" into SemanticIndexOption`,
                    {
                      optionText: option.text,
                      optionCode: option.code,
                      semanticCategory: optionSemanticCategory,
                      confidence: optionConfidence,
                    }
                  );
                } catch (error) {
                  failedInserts++;
                  const message =
                    error instanceof Error ? error.message : "Unknown error";

                  logger.error(
                    "form_discovery",
                    "options",
                    `❌ Failed to process option "${option.text}" for field ${fieldResult.fieldName}: ${message}`,
                    {
                      optionText: option.text,
                      optionCode: option.code,
                      fieldName: fieldResult.fieldName,
                      error: message,
                      stack: error instanceof Error ? error.stack : undefined,
                    }
                  );
                }
              }

              logger.info(
                "form_discovery",
                "options",
                `📊 Option discovery completed for field ${fieldResult.fieldName}`,
                {
                  fieldName: fieldResult.fieldName,
                  totalOptions: fieldOptions.length,
                  processedOptions,
                  successfulInserts,
                  failedInserts,
                  successRate:
                    fieldOptions.length > 0
                      ? `${Math.round(
                          (successfulInserts / fieldOptions.length) * 100
                        )}%`
                      : "0%",
                }
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unknown error";

              logger.error(
                "form_discovery",
                "options",
                `❌ Failed to discover options for field ${fieldResult.fieldName}: ${message}`,
                {
                  fieldName: fieldResult.fieldName,
                  fieldId: fieldResult.fieldId,
                  dataType: fieldResult.dataType,
                  error: message,
                  stack: error instanceof Error ? error.stack : undefined,
                }
              );
            }
          } else {
            logger.debug(
              "form_discovery",
              "options",
              `⏭️ Skipping option discovery for ${fieldResult.dataType} field: ${fieldResult.fieldName} (not a select field)`,
              {
                fieldName: fieldResult.fieldName,
                dataType: fieldResult.dataType,
              }
            );
          }
        }

        formsProcessed++;
        logger.endTimer(
          `form_${form.attributeSetKey}`,
          "form_discovery",
          "processor",
          `Successfully processed form "${form.name}" with ${fields.length} fields`,
          { formName: form.name, fieldCount: fields.length }
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to process form "${form.name}": ${message}`);
        logger.error(
          "form_discovery",
          "processor",
          `Error processing form "${form.name}": ${message}`,
          { error: String(error) }
        );
      }
    }

    // Step 3: Calculate final statistics
    const avgConfidence =
      confidenceValues.length > 0
        ? Number(
            (
              confidenceValues.reduce((sum, c) => sum + c, 0) /
              confidenceValues.length
            ).toFixed(2)
          )
        : null;

    logger.info("form_discovery", "summary", "Form Discovery Summary");
    logger.logMetric(
      "form_discovery",
      "summary",
      "forms_processed",
      formsProcessed
    );
    logger.logMetric(
      "form_discovery",
      "summary",
      "fields_processed",
      fieldsProcessed
    );
    logger.logMetric(
      "form_discovery",
      "summary",
      "avg_confidence",
      avgConfidence
    );
    logger.logMetric(
      "form_discovery",
      "summary",
      "fields_requiring_review",
      fieldsRequiringReview
    );
    logger.logMetric(
      "form_discovery",
      "summary",
      "warnings_count",
      warnings.length
    );
    logger.logMetric(
      "form_discovery",
      "summary",
      "errors_count",
      errors.length
    );

    // Persist logs to database
    console.log("🔄 Form Discovery: About to persist logs...");
    await logger.persistLogs();
    console.log("🔄 Form Discovery: Logs persisted");

    return {
      formsDiscovered: formsProcessed,
      fieldsDiscovered: fieldsProcessed,
      avgConfidence,
      fieldsRequiringReview,
      warnings,
      errors,
    };
  } catch (error: any) {
    const message = error?.message || "Form discovery failed";
    logger.error("form_discovery", "summary", "Form discovery failed:", error);

    // Persist logs even on error
    console.log("🔄 Form Discovery (Error): About to persist logs...");
    await logger.persistLogs();
    console.log("🔄 Form Discovery (Error): Logs persisted");

    return {
      formsDiscovered: null,
      fieldsDiscovered: null,
      avgConfidence: null,
      fieldsRequiringReview: null,
      warnings,
      errors: [message],
    };
  }
}
