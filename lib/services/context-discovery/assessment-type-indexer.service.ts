/**
 * Assessment Type Indexer Service
 *
 * Discovers and indexes assessment types (forms) from Silhouette schema,
 * mapping them to semantic concepts for assessment-level queries.
 *
 * Created: 2025-11-19
 * Purpose: Phase 5A - Assessment-Level Semantic Indexing
 * See: docs/design/templating_system/templating_improvement_real_customer_analysis.md
 */

import { getInsightGenDbPool } from "@/lib/db";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import {
  ASSESSMENT_TYPE_TAXONOMY,
  findMatchingConcepts,
  type AssessmentTypeConcept,
} from "./assessment-type-taxonomy";

/**
 * Assessment type discovered from Silhouette schema
 */
export interface DiscoveredAssessmentType {
  assessmentTypeId: string;
  assessmentTypeVersionId: string | null;
  assessmentName: string;
  definitionVersion: number;
  isActive: boolean;
}

/**
 * Indexed assessment type with semantic mapping
 */
export interface IndexedAssessmentType {
  assessmentTypeId: string;
  assessmentName: string;
  semanticConcept: string;
  semanticCategory: string;
  semanticSubcategory: string | null;
  confidence: number;
  isWoundSpecific: boolean;
  typicalFrequency: string;
  description: string;
}

/**
 * AssessmentTypeIndexer Service
 *
 * Responsibilities:
 * 1. Query Silhouette rpt.AssessmentTypeVersion to discover assessment types
 * 2. Match assessment names to semantic concepts using taxonomy
 * 3. Populate SemanticIndexAssessmentType table
 * 4. Support manual seeding for common assessment types
 */
export class AssessmentTypeIndexer {
  private customerId: string;
  private connectionString: string;
  private discoveryRunId: string | null;

  constructor(customerId: string, connectionString: string, discoveryRunId?: string) {
    this.customerId = customerId;
    this.connectionString = connectionString;
    this.discoveryRunId = discoveryRunId || null;
  }

  /**
   * Discover all assessment types from Silhouette schema
   */
  async discoverAssessmentTypes(): Promise<DiscoveredAssessmentType[]> {
    const pool = await getSqlServerPool(this.connectionString);

    // Query to get all assessment types (latest version only)
    // Use ROW_NUMBER to select only the row with the highest definitionVersion per assessmentTypeId
    const query = `
      WITH LatestVersions AS (
        SELECT
          assessmentTypeId,
          id as assessmentTypeVersionId,
          name as assessmentName,
          definitionVersion,
          ROW_NUMBER() OVER (
            PARTITION BY assessmentTypeId
            ORDER BY definitionVersion DESC
          ) AS rn
        FROM rpt.AssessmentTypeVersion
      )
      SELECT
        assessmentTypeId,
        assessmentTypeVersionId,
        assessmentName,
        definitionVersion
      FROM LatestVersions
      WHERE rn = 1
      ORDER BY assessmentName ASC
    `;

    try {
      const result = await pool.request().query(query);

      return result.recordset.map((row: any) => ({
        assessmentTypeId: row.assessmentTypeId,
        assessmentTypeVersionId: row.assessmentTypeVersionId,
        assessmentName: row.assessmentName,
        definitionVersion: row.definitionVersion,
        isActive: true, // Always true since we're only querying latest versions
      }));
    } catch (error: any) {
      console.error('[AssessmentTypeIndexer] Error discovering assessment types:', error);
      throw error;
    }
  }

  /**
   * Match assessment type to semantic concepts using taxonomy
   */
  matchSemanticConcepts(
    assessmentName: string
  ): Array<{ concept: AssessmentTypeConcept; confidence: number }> {
    return findMatchingConcepts(assessmentName);
  }

  /**
   * Index a single assessment type
   */
  async indexAssessmentType(
    discovered: DiscoveredAssessmentType,
    manualConcept?: string,
    manualConfidence?: number
  ): Promise<IndexedAssessmentType | null> {
    // Match semantic concepts
    const matches = this.matchSemanticConcepts(discovered.assessmentName);

    if (matches.length === 0 && !manualConcept) {
      console.log(
        `[AssessmentTypeIndexer] No concept match for "${discovered.assessmentName}" - skipping`
      );
      return null;
    }

    // Use manual concept if provided, otherwise use best match
    let concept: AssessmentTypeConcept;
    let confidence: number;

    if (manualConcept) {
      const manualMatch = ASSESSMENT_TYPE_TAXONOMY.find((c) => c.concept === manualConcept);
      if (!manualMatch) {
        throw new Error(`Invalid manual concept: ${manualConcept}`);
      }
      concept = manualMatch;
      confidence = manualConfidence || 1.0;
    } else {
      concept = matches[0].concept;
      confidence = matches[0].confidence;
    }

    const indexed: IndexedAssessmentType = {
      assessmentTypeId: discovered.assessmentTypeId,
      assessmentName: discovered.assessmentName,
      semanticConcept: concept.concept,
      semanticCategory: concept.category,
      semanticSubcategory: concept.subcategory || null,
      confidence,
      isWoundSpecific: concept.isWoundSpecific,
      typicalFrequency: concept.typicalFrequency,
      description: concept.description,
    };

    // Save to database
    await this.saveToDatabase(indexed);

    return indexed;
  }

  /**
   * Save indexed assessment type to database
   */
  private async saveToDatabase(indexed: IndexedAssessmentType): Promise<void> {
    const pool = await getInsightGenDbPool();

    const query = `
      INSERT INTO "SemanticIndexAssessmentType" (
        customer_id,
        assessment_type_id,
        assessment_name,
        semantic_concept,
        semantic_category,
        semantic_subcategory,
        description,
        is_wound_specific,
        is_patient_specific,
        typical_frequency,
        confidence,
        discovery_run_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (customer_id, assessment_type_id, semantic_concept)
      DO UPDATE SET
        assessment_name = EXCLUDED.assessment_name,
        semantic_category = EXCLUDED.semantic_category,
        semantic_subcategory = EXCLUDED.semantic_subcategory,
        description = EXCLUDED.description,
        is_wound_specific = EXCLUDED.is_wound_specific,
        typical_frequency = EXCLUDED.typical_frequency,
        confidence = EXCLUDED.confidence,
        updated_at = NOW()
    `;

    const values = [
      this.customerId,
      indexed.assessmentTypeId,
      indexed.assessmentName,
      indexed.semanticConcept,
      indexed.semanticCategory,
      indexed.semanticSubcategory,
      indexed.description,
      indexed.isWoundSpecific,
      true, // is_patient_specific (all assessments are patient-specific for now)
      indexed.typicalFrequency,
      indexed.confidence,
      this.discoveryRunId,
    ];

    try {
      await pool.query(query, values);
      console.log(
        `[AssessmentTypeIndexer] Indexed: "${indexed.assessmentName}" → ${indexed.semanticConcept}`
      );
    } catch (error: any) {
      console.error('[AssessmentTypeIndexer] Error saving to database:', error);
      throw error;
    }
  }

  /**
   * Index all discovered assessment types
   */
  async indexAll(): Promise<{
    total: number;
    indexed: number;
    skipped: number;
    results: IndexedAssessmentType[];
  }> {
    console.log(`[AssessmentTypeIndexer] Starting assessment type indexing for customer ${this.customerId}`);

    // Discover all assessment types
    const discovered = await this.discoverAssessmentTypes();
    console.log(`[AssessmentTypeIndexer] Discovered ${discovered.length} assessment types`);

    const results: IndexedAssessmentType[] = [];
    let indexed = 0;
    let skipped = 0;

    for (const assessment of discovered) {
      const result = await this.indexAssessmentType(assessment);

      if (result) {
        results.push(result);
        indexed++;
      } else {
        skipped++;
      }
    }

    console.log(
      `[AssessmentTypeIndexer] Complete: ${indexed} indexed, ${skipped} skipped (no match)`
    );

    return {
      total: discovered.length,
      indexed,
      skipped,
      results,
    };
  }

  /**
   * Seed manual assessment type mappings
   *
   * Use this for assessment types that don't match automatic patterns,
   * or to override automatic detection with manual mappings.
   */
  async seedManualMapping(
    assessmentTypeId: string,
    assessmentName: string,
    semanticConcept: string,
    confidence: number = 1.0
  ): Promise<void> {
    const concept = ASSESSMENT_TYPE_TAXONOMY.find((c) => c.concept === semanticConcept);
    if (!concept) {
      throw new Error(`Invalid semantic concept: ${semanticConcept}`);
    }

    const indexed: IndexedAssessmentType = {
      assessmentTypeId,
      assessmentName,
      semanticConcept: concept.concept,
      semanticCategory: concept.category,
      semanticSubcategory: concept.subcategory || null,
      confidence,
      isWoundSpecific: concept.isWoundSpecific,
      typicalFrequency: concept.typicalFrequency,
      description: concept.description,
    };

    await this.saveToDatabase(indexed);

    console.log(
      `[AssessmentTypeIndexer] Manual seed: "${assessmentName}" → ${semanticConcept} (${confidence})`
    );
  }

  /**
   * Get all indexed assessment types for this customer
   */
  async getIndexed(): Promise<IndexedAssessmentType[]> {
    const pool = await getInsightGenDbPool();

    const query = `
      SELECT
        assessment_type_id as "assessmentTypeId",
        assessment_name as "assessmentName",
        semantic_concept as "semanticConcept",
        semantic_category as "semanticCategory",
        semantic_subcategory as "semanticSubcategory",
        confidence,
        is_wound_specific as "isWoundSpecific",
        typical_frequency as "typicalFrequency",
        description
      FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
      ORDER BY semantic_category, semantic_concept
    `;

    try {
      const result = await pool.query(query, [this.customerId]);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeIndexer] Error fetching indexed types:', error);
      throw error;
    }
  }

  /**
   * Clear all indexed assessment types for this customer
   */
  async clearAll(): Promise<number> {
    const pool = await getInsightGenDbPool();

    const query = `
      DELETE FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
    `;

    try {
      const result = await pool.query(query, [this.customerId]);
      const count = result.rowCount || 0;
      console.log(`[AssessmentTypeIndexer] Cleared ${count} indexed assessment types`);
      return count;
    } catch (error: any) {
      console.error('[AssessmentTypeIndexer] Error clearing indexed types:', error);
      throw error;
    }
  }
}

/**
 * Create an AssessmentTypeIndexer instance
 */
export function createAssessmentTypeIndexer(
  customerId: string,
  connectionString: string,
  discoveryRunId?: string
): AssessmentTypeIndexer {
  return new AssessmentTypeIndexer(customerId, connectionString, discoveryRunId);
}
