import type { Pool } from "pg";

import { getInsightGenDbPool } from "@/lib/db";
import {
  getCustomer,
  getCustomerConnectionString,
} from "@/lib/services/customer-service";
import { discoverFormMetadata } from "@/lib/services/form-discovery.service";
import { discoverNonFormSchema } from "@/lib/services/non-form-schema-discovery.service";
// DISABLED: Privacy violation - indexes actual patient/form data
// import { discoverNonFormValues } from "@/lib/services/non-form-value-discovery.service";
import { discoverEntityRelationships } from "@/lib/services/relationship-discovery.service";
import { AssessmentTypeIndexer } from "@/lib/services/context-discovery/assessment-type-indexer.service";
import { closeSqlServerPool } from "@/lib/services/sqlserver/client";
import { createDiscoveryLogger } from "@/lib/services/discovery-logger";
import {
  type DiscoveryStageOptions,
  type DiscoveryRunOptions,
  getDiscoveryStages,
} from "@/lib/services/discovery-types";

type DiscoveryStatus = "succeeded" | "failed";

type FormDiscoveryResult = {
  formsDiscovered: number | null;
  fieldsDiscovered: number | null;
  avgConfidence: number | null;
  fieldsRequiringReview: number | null;
  warnings: string[];
  errors: string[];
};

type DiscoverySummary = {
  forms_discovered: number;
  fields_discovered: number;
  avg_confidence: number | null;
  fields_requiring_review: number;
  non_form_columns: number;
  non_form_columns_requiring_review: number;
  non_form_values: number;
  assessment_types_discovered: number; // Phase 5A
  warnings: string[];
};

export type DiscoveryRunResponse = {
  status: DiscoveryStatus;
  customerId: string;
  runId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  summary?: DiscoverySummary;
  warnings: string[];
  errors: string[];
  error?: string;
};

type CustomerRow = {
  id: string;
  code: string;
};

const CUSTOMER_FIELDS = `
  id,
  code
`;

function normaliseCustomerCode(code: string): string {
  return code.trim().toUpperCase();
}

async function fetchCustomerRow(
  code: string,
  pool: Pool
): Promise<CustomerRow | null> {
  const result = await pool.query<CustomerRow>(
    `SELECT ${CUSTOMER_FIELDS}
     FROM "Customer"
     WHERE code = $1
     LIMIT 1`,
    [normaliseCustomerCode(code)]
  );

  return result.rows[0] ?? null;
}

async function computeFormStats(
  pool: Pool,
  customerId: string
): Promise<FormDiscoveryResult> {
  const warnings: string[] = [];

  const formCountResult = await pool.query<{ forms: number }>(
    `SELECT COUNT(*)::int AS forms
     FROM "SemanticIndex"
     WHERE customer_id = $1`,
    [customerId]
  );

  const fieldStatsResult = await pool.query<{
    field_count: number | null;
    review_count: number | null;
    avg_confidence: number | null;
  }>(
    `SELECT
       COUNT(*)::int AS field_count,
       COUNT(*) FILTER (WHERE sif.is_review_required) ::int AS review_count,
       AVG(sif.confidence) AS avg_confidence
     FROM "SemanticIndexField" sif
     JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
     WHERE si.customer_id = $1`,
    [customerId]
  );

  const formsDiscovered = formCountResult.rows[0]?.forms ?? 0;
  const fieldsDiscovered = fieldStatsResult.rows[0]?.field_count ?? 0;
  const avgConfidence = fieldStatsResult.rows[0]?.avg_confidence;
  const reviewCount = fieldStatsResult.rows[0]?.review_count ?? 0;

  if (formsDiscovered === 0) {
    warnings.push(
      "No forms discovered. Form discovery step may not be configured."
    );
  }

  return {
    formsDiscovered,
    fieldsDiscovered,
    avgConfidence:
      avgConfidence != null
        ? Math.round(Number(avgConfidence) * 100) / 100
        : null,
    fieldsRequiringReview: reviewCount,
    warnings,
    errors: [],
  };
}

async function computeNonFormStats(
  pool: Pool,
  customerId: string
): Promise<{
  columnCount: number;
  reviewCount: number;
  valueCount: number;
}> {
  const columnResult = await pool.query<{
    total: number;
    review_count: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE is_review_required) ::int AS review_count
     FROM "SemanticIndexNonForm"
     WHERE customer_id = $1`,
    [customerId]
  );

  // DISABLED: SemanticIndexNonFormValue table dropped (privacy fix)
  // This table stored actual patient/form data and violated privacy principles
  // const valueResult = await pool.query<{ total: number }>(
  //   `SELECT COUNT(*)::int AS total
  //    FROM "SemanticIndexNonFormValue" nf
  //    JOIN "SemanticIndexNonForm" n ON n.id = nf.semantic_index_nonform_id
  //    WHERE n.customer_id = $1`,
  //   [customerId]
  // );

  return {
    columnCount: columnResult.rows[0]?.total ?? 0,
    reviewCount: columnResult.rows[0]?.review_count ?? 0,
    valueCount: 0, // Always 0 - table no longer exists
  };
}

async function computeAssessmentTypeStats(
  pool: Pool,
  customerId: string
): Promise<{
  assessmentTypeCount: number;
}> {
  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(DISTINCT assessment_type_id)::int AS total
     FROM "SemanticIndexAssessmentType"
     WHERE customer_id = $1`,
    [customerId]
  );

  return {
    assessmentTypeCount: result.rows[0]?.total ?? 0,
  };
}

async function updateCustomerLastDiscovered(
  pool: Pool,
  customerId: string
): Promise<void> {
  await pool.query(
    `UPDATE "Customer" SET last_discovered_at = NOW() WHERE id = $1`,
    [customerId]
  );
}

async function cleanupOldDiscoveryLogs(
  pool: Pool,
  customerId: string
): Promise<void> {
  // Keep only the last 5 discovery runs' logs for this customer
  await pool.query(
    `
      DELETE FROM "DiscoveryLog"
      WHERE discovery_run_id NOT IN (
        SELECT id FROM "CustomerDiscoveryRun"
        WHERE customer_id = $1
        ORDER BY started_at DESC
        LIMIT 5
      )
      AND discovery_run_id IN (
        SELECT id FROM "CustomerDiscoveryRun"
        WHERE customer_id = $1
      )
    `,
    [customerId]
  );
}

async function recordRunStart(
  pool: Pool,
  customerId: string,
  stages?: DiscoveryStageOptions
): Promise<{ runId: string; startedAt: Date }> {
  const metadata = stages ? { stages } : {};
  const result = await pool.query<{ id: string; started_at: Date }>(
    `INSERT INTO "CustomerDiscoveryRun" (customer_id, status, started_at, warnings, metadata)
     VALUES ($1, 'running', NOW(), '[]'::jsonb, $2::jsonb)
     RETURNING id, started_at`,
    [customerId, JSON.stringify(metadata)]
  );

  const row = result.rows[0];
  return {
    runId: row.id,
    startedAt: row.started_at,
  };
}

async function updateRunSuccess(
  pool: Pool,
  params: {
    runId: string;
    summary: DiscoverySummary;
    warnings: string[];
    errors: string[];
  }
): Promise<void> {
  const metadata = {
    summary: params.summary,
    errors: params.errors,
  };

  await pool.query(
    `UPDATE "CustomerDiscoveryRun"
     SET status = 'succeeded',
         completed_at = NOW(),
         forms_discovered = $2,
         fields_discovered = $3,
         avg_confidence = $4,
         warnings = $5::jsonb,
         metadata = $6::jsonb
     WHERE id = $1`,
    [
      params.runId,
      params.summary.forms_discovered,
      params.summary.fields_discovered,
      params.summary.avg_confidence,
      JSON.stringify(params.warnings),
      JSON.stringify(metadata),
    ]
  );
}

async function updateRunFailure(
  pool: Pool,
  params: {
    runId: string;
    warnings: string[];
    errors: string[];
    errorMessage: string;
  }
): Promise<void> {
  const metadata = {
    warnings: params.warnings,
    errors: params.errors,
  };

  await pool.query(
    `UPDATE "CustomerDiscoveryRun"
     SET status = 'failed',
         completed_at = NOW(),
         warnings = $2::jsonb,
         error_message = $3,
         metadata = $4::jsonb
     WHERE id = $1`,
    [
      params.runId,
      JSON.stringify(params.warnings),
      params.errorMessage,
      JSON.stringify(metadata),
    ]
  );
}

async function runFormDiscoveryStep(
  customerId: string,
  connectionString: string,
  runId: string
): Promise<FormDiscoveryResult> {
  const result = await discoverFormMetadata({
    customerId,
    connectionString,
    discoveryRunId: runId,
  });

  return {
    formsDiscovered: result.formsDiscovered,
    fieldsDiscovered: result.fieldsDiscovered,
    avgConfidence: result.avgConfidence,
    fieldsRequiringReview: result.fieldsRequiringReview,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    errors: Array.isArray(result.errors) ? result.errors : [],
  };
}

function buildSummary(params: {
  formStats: FormDiscoveryResult;
  nonFormStats: {
    columnCount: number;
    reviewCount: number;
    valueCount: number;
  };
  assessmentTypeStats: {
    assessmentTypeCount: number;
  };
  aggregateWarnings: string[];
}): DiscoverySummary {
  return {
    forms_discovered: params.formStats.formsDiscovered ?? 0,
    fields_discovered: params.formStats.fieldsDiscovered ?? 0,
    avg_confidence: params.formStats.avgConfidence,
    fields_requiring_review: params.formStats.fieldsRequiringReview ?? 0,
    non_form_columns: params.nonFormStats.columnCount,
    non_form_columns_requiring_review: params.nonFormStats.reviewCount,
    non_form_values: params.nonFormStats.valueCount,
    assessment_types_discovered: params.assessmentTypeStats.assessmentTypeCount,
    warnings: [...params.aggregateWarnings],
  };
}

function calculateDurationSeconds(startedAt: Date, completedAt: Date): number {
  const diff = completedAt.getTime() - startedAt.getTime();
  return diff > 0 ? Math.round(diff / 1000) : 0;
}

export async function runFullDiscovery(
  options: DiscoveryRunOptions
): Promise<DiscoveryRunResponse> {
  const { customerCode, stages: userStages } = options;
  const stages = getDiscoveryStages(userStages);

  const pool = await getInsightGenDbPool();

  const customer = await getCustomer(customerCode);
  if (!customer) {
    throw new Error(`Customer ${customerCode} not found`);
  }

  const customerRow = await fetchCustomerRow(customerCode, pool);
  if (!customerRow) {
    throw new Error(`Customer ${customerCode} not found`);
  }

  const connectionString = await getCustomerConnectionString(customerCode);
  if (!connectionString) {
    throw new Error(
      "Customer connection string is not available or could not be decrypted"
    );
  }

  const { runId, startedAt } = await recordRunStart(
    pool,
    customerRow.id,
    stages
  );
  const logger = createDiscoveryLogger(runId);
  logger.setPool(pool);

  const aggregateWarnings: string[] = [];
  const aggregateErrors: string[] = [];

  logger.info("discovery", "orchestrator", "Discovery run started", {
    customerId: customerRow.id,
    customerCode,
  });

  try {
    // Stage 1: Form Discovery
    if (stages.formDiscovery) {
      logger.startTimer("form_discovery");
      const formStats = await runFormDiscoveryStep(
        customerRow.id,
        connectionString,
        runId
      );
      const formDuration = logger.endTimer(
        "form_discovery",
        "form_discovery",
        "orchestrator",
        `Form discovery completed: ${formStats.formsDiscovered} forms, ${formStats.fieldsDiscovered} fields`,
        {
          formsDiscovered: formStats.formsDiscovered,
          fieldsDiscovered: formStats.fieldsDiscovered,
          avgConfidence: formStats.avgConfidence,
        }
      );
      aggregateWarnings.push(...formStats.warnings);
      aggregateErrors.push(...formStats.errors);
    }

    // Stage 2: Non-Form Schema Discovery
    if (stages.nonFormSchema) {
      logger.startTimer("non_form_schema");
      const nonFormSchemaResult = await discoverNonFormSchema({
        customerId: customerRow.id,
        connectionString,
        discoveryRunId: runId,
      });
      const nonFormDuration = logger.endTimer(
        "non_form_schema",
        "non_form_schema",
        "orchestrator",
        `Non-form schema discovery completed: ${nonFormSchemaResult.discoveredColumns} columns`,
        { discoveredColumns: nonFormSchemaResult.discoveredColumns }
      );
      aggregateWarnings.push(...nonFormSchemaResult.warnings);
      aggregateErrors.push(...nonFormSchemaResult.errors);
    }

    // Stage 3: Relationship Discovery
    if (stages.relationships) {
      logger.startTimer("relationships");
      const relationshipsResult = await discoverEntityRelationships({
        customerId: customerRow.id,
        connectionString,
        discoveryRunId: runId,
      });
      const relationshipsDuration = logger.endTimer(
        "relationships",
        "relationships",
        "orchestrator",
        `Entity relationship discovery completed: ${relationshipsResult.discoveredRelationships} relationships`,
        { discoveredRelationships: relationshipsResult.discoveredRelationships }
      );
      aggregateWarnings.push(...relationshipsResult.warnings);
      aggregateErrors.push(...relationshipsResult.errors);
    }

    // Stage 4: Assessment Type Indexing (Phase 5A)
    if (stages.assessmentTypes) {
      logger.startTimer("assessment_types");
      try {
        const indexer = new AssessmentTypeIndexer(customerRow.id, connectionString, runId);
        const indexResult = await indexer.indexAll();
        const assessmentDuration = logger.endTimer(
          "assessment_types",
          "assessment_types",
          "orchestrator",
          `Assessment type indexing completed: ${indexResult.indexed} assessment types indexed`,
          {
            total: indexResult.total,
            indexed: indexResult.indexed,
            skipped: indexResult.skipped,
          }
        );
        if (indexResult.indexed === 0 && indexResult.total > 0) {
          aggregateWarnings.push(
            `Found ${indexResult.total} assessment types but could not match any to semantic concepts`
          );
        }
      } catch (error: any) {
        logger.error(
          "assessment_types",
          "orchestrator",
          `Assessment type indexing failed: ${error.message}`,
          { errorType: error.constructor.name }
        );
        aggregateErrors.push(`Assessment type indexing failed: ${error.message}`);
      }
    }

    // Stage 5: Non-Form Values Discovery (DISABLED - Privacy Violation)
    // This stage queried actual patient/form data from rpt.* tables
    // and stored it in SemanticIndexNonFormValue table.
    // REMOVED: See privacy-safe-discovery-fix.md
    /*
    if (stages.nonFormValues) {
      logger.startTimer("non_form_values");
      const nonFormValuesResult = await discoverNonFormValues({
        customerId: customerRow.id,
        connectionString,
      });
      const valuesDuration = logger.endTimer(
        "non_form_values",
        "non_form_values",
        "orchestrator",
        `Non-form values discovery completed: ${nonFormValuesResult.valuesDiscovered} values`,
        { valuesDiscovered: nonFormValuesResult.valuesDiscovered }
      );
      aggregateWarnings.push(...nonFormValuesResult.warnings);
      aggregateErrors.push(...nonFormValuesResult.errors);
    }
    */

    // Stage 6: Summary Statistics
    logger.startTimer("summary");
    const formSummary = await computeFormStats(pool, customerRow.id);
    const summaryDuration = logger.endTimer(
      "summary",
      "summary",
      "orchestrator",
      "Summary statistics computed",
      {
        formsDiscovered: formSummary.formsDiscovered,
        fieldsDiscovered: formSummary.fieldsDiscovered,
      }
    );
    aggregateWarnings.push(...formSummary.warnings);
    aggregateErrors.push(...formSummary.errors);

    const nonFormStats = await computeNonFormStats(pool, customerRow.id);
    const assessmentTypeStats = await computeAssessmentTypeStats(pool, customerRow.id);

    const summary = buildSummary({
      formStats: formSummary,
      nonFormStats,
      assessmentTypeStats,
      aggregateWarnings,
    });

    await updateRunSuccess(pool, {
      runId,
      summary,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
    });

    await updateCustomerLastDiscovered(pool, customerRow.id);
    await cleanupOldDiscoveryLogs(pool, customerRow.id);

    const completedAt = new Date();
    const durationSeconds = calculateDurationSeconds(startedAt, completedAt);

    logger.info(
      "discovery",
      "orchestrator",
      "Discovery run completed successfully",
      {
        durationSeconds,
        formsDiscovered: summary.forms_discovered,
        fieldsDiscovered: summary.fields_discovered,
      }
    );

    // Persist logs to database (after all logging is complete)
    console.log("🔄 Orchestrator: About to persist logs...");
    await logger.persistLogs();
    console.log("🔄 Orchestrator: Logs persisted, printing summary...");
    logger.printSummary();

    return {
      status: "succeeded",
      customerId: customerRow.id,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      summary,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
    };
  } catch (error) {
    const completedAt = new Date();
    const durationSeconds = calculateDurationSeconds(startedAt, completedAt);
    const message = error instanceof Error ? error.message : "Discovery failed";
    aggregateErrors.push(message);

    logger.error("discovery", "orchestrator", `Discovery failed: ${message}`, {
      errorType: error instanceof Error ? error.constructor.name : "unknown",
    });

    await updateRunFailure(pool, {
      runId,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
      errorMessage: message,
    });

    // Persist logs even on failure
    await logger.persistLogs();
    logger.printSummary();

    return {
      status: "failed",
      customerId: customerRow.id,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
      error: message,
    };
  } finally {
    await closeSqlServerPool(connectionString).catch(() => undefined);
  }
}

export async function runFullDiscoveryWithProgress(
  options: DiscoveryRunOptions,
  sendEvent: (type: string, data: any) => void
): Promise<DiscoveryRunResponse> {
  const { customerCode, stages: userStages } = options;
  const stages = getDiscoveryStages(userStages);

  const pool = await getInsightGenDbPool();

  const customer = await getCustomer(customerCode);
  if (!customer) {
    throw new Error(`Customer ${customerCode} not found`);
  }

  const customerRow = await fetchCustomerRow(customerCode, pool);
  if (!customerRow) {
    throw new Error(`Customer ${customerCode} not found`);
  }

  const connectionString = await getCustomerConnectionString(customerCode);
  if (!connectionString) {
    throw new Error(
      "Customer connection string is not available or could not be decrypted"
    );
  }

  const { runId, startedAt } = await recordRunStart(
    pool,
    customerRow.id,
    stages
  );

  const aggregateWarnings: string[] = [];
  const aggregateErrors: string[] = [];

  try {
    // Stage 1: Form Discovery
    if (stages.formDiscovery) {
      sendEvent("stage-start", {
        stage: "form_discovery",
        name: "Form Discovery",
      });
      const formStats = await runFormDiscoveryStep(
        customerRow.id,
        connectionString,
        runId
      );
      aggregateWarnings.push(...formStats.warnings);
      aggregateErrors.push(...formStats.errors);
      sendEvent("stage-complete", {
        stage: "form_discovery",
        formsDiscovered: formStats.formsDiscovered,
        fieldsDiscovered: formStats.fieldsDiscovered,
      });
    }

    // Stage 2: Non-Form Schema Discovery
    if (stages.nonFormSchema) {
      sendEvent("stage-start", {
        stage: "non_form_schema",
        name: "Non-Form Schema Discovery",
      });
      const nonFormSchemaResult = await discoverNonFormSchema({
        customerId: customerRow.id,
        connectionString,
        discoveryRunId: runId,
      });
      aggregateWarnings.push(...nonFormSchemaResult.warnings);
      aggregateErrors.push(...nonFormSchemaResult.errors);
      sendEvent("stage-complete", {
        stage: "non_form_schema",
        columnsDiscovered: nonFormSchemaResult.discoveredColumns,
      });
    }

    // Stage 3: Relationship Discovery
    if (stages.relationships) {
      sendEvent("stage-start", {
        stage: "relationships",
        name: "Entity Relationship Discovery",
      });
      const relationshipsResult = await discoverEntityRelationships({
        customerId: customerRow.id,
        connectionString,
        discoveryRunId: runId,
      });
      aggregateWarnings.push(...relationshipsResult.warnings);
      aggregateErrors.push(...relationshipsResult.errors);
      sendEvent("stage-complete", {
        stage: "relationships",
        discoveredRelationships: relationshipsResult.discoveredRelationships,
      });
    }

    // Stage 4: Assessment Type Indexing (Phase 5A)
    if (stages.assessmentTypes) {
      sendEvent("stage-start", {
        stage: "assessment_types",
        name: "Assessment Type Indexing",
      });
      try {
        const indexer = new AssessmentTypeIndexer(customerRow.id, connectionString, runId);
        const indexResult = await indexer.indexAll();
        sendEvent("stage-complete", {
          stage: "assessment_types",
          assessmentTypesIndexed: indexResult.indexed,
          total: indexResult.total,
        });
        if (indexResult.indexed === 0 && indexResult.total > 0) {
          aggregateWarnings.push(
            `Found ${indexResult.total} assessment types but could not match any to semantic concepts`
          );
        }
      } catch (error: any) {
        aggregateErrors.push(`Assessment type indexing failed: ${error.message}`);
        sendEvent("stage-error", {
          stage: "assessment_types",
          error: error.message,
        });
      }
    }

    // Stage 5: Non-Form Values (DISABLED - Privacy Violation)
    // REMOVED: See privacy-safe-discovery-fix.md
    /*
    if (stages.nonFormValues) {
      sendEvent("stage-start", {
        stage: "non_form_values",
        name: "Non-Form Values Discovery",
      });
      const nonFormValuesResult = await discoverNonFormValues({
        customerId: customerRow.id,
        connectionString,
      });
      aggregateWarnings.push(...nonFormValuesResult.warnings);
      aggregateErrors.push(...nonFormValuesResult.errors);
      sendEvent("stage-complete", {
        stage: "non_form_values",
        valuesDiscovered: nonFormValuesResult.valuesDiscovered,
      });
    }
    */

    // Stage 6: Computing Summary Statistics
    sendEvent("stage-start", {
      stage: "summary",
      name: "Computing Summary Statistics",
    });
    const formSummary = await computeFormStats(pool, customerRow.id);
    aggregateWarnings.push(...formSummary.warnings);
    aggregateErrors.push(...formSummary.errors);

    const nonFormStats = await computeNonFormStats(pool, customerRow.id);
    const assessmentTypeStats = await computeAssessmentTypeStats(pool, customerRow.id);

    const summary = buildSummary({
      formStats: formSummary,
      nonFormStats,
      assessmentTypeStats,
      aggregateWarnings,
    });
    sendEvent("stage-complete", { stage: "summary" });

    // Update database with results
    await updateRunSuccess(pool, {
      runId,
      summary,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
    });

    await updateCustomerLastDiscovered(pool, customerRow.id);
    await cleanupOldDiscoveryLogs(pool, customerRow.id);

    const completedAt = new Date();
    const durationSeconds = calculateDurationSeconds(startedAt, completedAt);

    return {
      status: "succeeded",
      customerId: customerRow.id,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      summary,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
    };
  } catch (error) {
    const completedAt = new Date();
    const durationSeconds = calculateDurationSeconds(startedAt, completedAt);
    const message = error instanceof Error ? error.message : "Discovery failed";
    aggregateErrors.push(message);

    await updateRunFailure(pool, {
      runId,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
      errorMessage: message,
    });

    sendEvent("error", {
      message,
      stage: "unknown",
    });

    return {
      status: "failed",
      customerId: customerRow.id,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      warnings: aggregateWarnings,
      errors: aggregateErrors,
      error: message,
    };
  } finally {
    await closeSqlServerPool(connectionString).catch(() => undefined);
  }
}

export type DiscoveryRunHistoryEntry = {
  id: string;
  status: DiscoveryStatus;
  startedAt: string;
  completedAt: string | null;
  formsDiscovered: number | null;
  fieldsDiscovered: number | null;
  avgConfidence: number | null;
  warnings: string[];
  errorMessage: string | null;
  stages?: DiscoveryStageOptions;
};

export async function getDiscoveryHistory(
  customerCode: string,
  limit: number = 5
): Promise<DiscoveryRunHistoryEntry[]> {
  const pool = await getInsightGenDbPool();

  const result = await pool.query<{
    id: string;
    status: DiscoveryStatus;
    started_at: Date;
    completed_at: Date | null;
    forms_discovered: number | null;
    fields_discovered: number | null;
    avg_confidence: number | null;
    warnings: unknown;
    error_message: string | null;
    metadata: unknown;
  }>(
    `
      SELECT
        run.id,
        run.status,
        run.started_at,
        run.completed_at,
        run.forms_discovered,
        run.fields_discovered,
        run.avg_confidence,
        run.warnings,
        run.error_message,
        run.metadata
      FROM "CustomerDiscoveryRun" run
      JOIN "Customer" c ON c.id = run.customer_id
      WHERE c.code = $1
      ORDER BY run.started_at DESC
      LIMIT $2
    `,
    [normaliseCustomerCode(customerCode), limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    formsDiscovered: row.forms_discovered,
    fieldsDiscovered: row.fields_discovered,
    avgConfidence: row.avg_confidence,
    warnings: Array.isArray(row.warnings)
      ? (row.warnings as string[])
      : typeof row.warnings === "string"
      ? [row.warnings]
      : [],
    errorMessage: row.error_message,
    stages:
      row.metadata && typeof row.metadata === "object"
        ? ((row.metadata as Record<string, unknown>)
            .stages as DiscoveryStageOptions)
        : undefined,
  }));
}
