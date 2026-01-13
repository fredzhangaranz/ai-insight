/**
 * Assessment Type Searcher Service
 *
 * Searches indexed assessment types during query resolution to provide
 * assessment-level context for SQL generation.
 *
 * Created: 2025-11-19
 * Purpose: Phase 5A - Assessment-Level Semantic Indexing
 * See: docs/design/templating_system/templating_improvement_real_customer_analysis.md
 */

import { getInsightGenDbPool } from "@/lib/db";

/**
 * Assessment type search result
 */
export interface AssessmentTypeSearchResult {
  assessmentTypeId: string;
  assessmentName: string;
  semanticConcept: string;
  semanticCategory: string;
  semanticSubcategory: string | null;
  confidence: number;
  isWoundSpecific: boolean;
  typicalFrequency: string;
}

/**
 * Assessment Type Searcher Service
 *
 * Responsibilities:
 * 1. Search indexed assessment types by semantic concept
 * 2. Search by category (clinical, billing, administrative, treatment)
 * 3. Search by keywords in assessment name
 * 4. Provide assessment context for SQL generation
 */
export class AssessmentTypeSearcher {
  private customerId: string;

  constructor(customerId: string) {
    this.customerId = customerId;
  }

  /**
   * Search assessment types by semantic concept
   *
   * @param concepts - Array of semantic concepts to search for
   * @returns Matching assessment types sorted by confidence
   */
  async searchByConcept(concepts: string[]): Promise<AssessmentTypeSearchResult[]> {
    if (concepts.length === 0) {
      return [];
    }

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
        typical_frequency as "typicalFrequency"
      FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
        AND semantic_concept = ANY($2)
      ORDER BY confidence DESC, assessment_name ASC
    `;

    try {
      const result = await pool.query(query, [this.customerId, concepts]);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeSearcher] Error searching by concept:', error);
      return [];
    }
  }

  /**
   * Search assessment types by category
   *
   * @param categories - Array of categories (clinical, billing, administrative, treatment)
   * @returns Matching assessment types sorted by confidence
   */
  async searchByCategory(
    categories: Array<'clinical' | 'billing' | 'administrative' | 'treatment'>
  ): Promise<AssessmentTypeSearchResult[]> {
    if (categories.length === 0) {
      return [];
    }

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
        typical_frequency as "typicalFrequency"
      FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
        AND semantic_category = ANY($2)
      ORDER BY confidence DESC, assessment_name ASC
    `;

    try {
      const result = await pool.query(query, [this.customerId, categories]);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeSearcher] Error searching by category:', error);
      return [];
    }
  }

  /**
   * Search assessment types by keywords in name
   *
   * Uses full-text search for flexible matching.
   *
   * @param keywords - Search keywords
   * @returns Matching assessment types sorted by relevance
   */
  async searchByKeywords(keywords: string): Promise<AssessmentTypeSearchResult[]> {
    if (!keywords || keywords.trim().length === 0) {
      return [];
    }

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
        typical_frequency as "typicalFrequency"
      FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
        AND (
          assessment_name ILIKE $2
          OR semantic_concept ILIKE $2
        )
      ORDER BY confidence DESC, assessment_name ASC
      LIMIT 20
    `;

    const searchPattern = `%${keywords}%`;

    try {
      const result = await pool.query(query, [this.customerId, searchPattern]);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeSearcher] Error searching by keywords:', error);
      return [];
    }
  }

  /**
   * Get all assessment types for this customer
   *
   * Useful for generating clarifications when user doesn't specify assessment type.
   *
   * @param limit - Maximum number of results (default: 50)
   * @returns All indexed assessment types sorted by category
   */
  async getAll(limit: number = 50): Promise<AssessmentTypeSearchResult[]> {
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
        typical_frequency as "typicalFrequency"
      FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
      ORDER BY semantic_category, confidence DESC, assessment_name ASC
      LIMIT $2
    `;

    try {
      const result = await pool.query(query, [this.customerId, limit]);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeSearcher] Error getting all assessment types:', error);
      return [];
    }
  }

  /**
   * Get assessment types by specific ID
   *
   * @param assessmentTypeIds - Array of assessment type IDs
   * @returns Matching assessment types
   */
  async getByIds(assessmentTypeIds: string[]): Promise<AssessmentTypeSearchResult[]> {
    if (assessmentTypeIds.length === 0) {
      return [];
    }

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
        typical_frequency as "typicalFrequency"
      FROM "SemanticIndexAssessmentType"
      WHERE customer_id = $1
        AND assessment_type_id = ANY($2)
      ORDER BY confidence DESC
    `;

    try {
      const result = await pool.query(query, [this.customerId, assessmentTypeIds]);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeSearcher] Error getting by IDs:', error);
      return [];
    }
  }

  /**
   * Search assessment types using multiple criteria
   *
   * Combines concept, category, and keyword search with OR logic.
   *
   * @param params - Search parameters
   * @returns Matching assessment types sorted by relevance
   */
  async search(params: {
    concepts?: string[];
    categories?: Array<'clinical' | 'billing' | 'administrative' | 'treatment'>;
    keywords?: string;
    limit?: number;
  }): Promise<AssessmentTypeSearchResult[]> {
    const { concepts = [], categories = [], keywords, limit = 20 } = params;

    // If no search criteria provided, return empty
    if (concepts.length === 0 && categories.length === 0 && !keywords) {
      return [];
    }

    const pool = await getInsightGenDbPool();

    // Build WHERE clause dynamically
    const whereClauses: string[] = ['customer_id = $1'];
    const values: any[] = [this.customerId];
    let paramIndex = 2;

    if (concepts.length > 0) {
      whereClauses.push(`semantic_concept = ANY($${paramIndex})`);
      values.push(concepts);
      paramIndex++;
    }

    if (categories.length > 0) {
      whereClauses.push(`semantic_category = ANY($${paramIndex})`);
      values.push(categories);
      paramIndex++;
    }

    if (keywords && keywords.trim().length > 0) {
      whereClauses.push(`(assessment_name ILIKE $${paramIndex} OR semantic_concept ILIKE $${paramIndex})`);
      values.push(`%${keywords}%`);
      paramIndex++;
    }

    // Use OR logic for multiple criteria (any match is good)
    const whereClause = whereClauses.length > 1
      ? `customer_id = $1 AND (${whereClauses.slice(1).join(' OR ')})`
      : whereClauses.join(' AND ');

    const query = `
      SELECT
        assessment_type_id as "assessmentTypeId",
        assessment_name as "assessmentName",
        semantic_concept as "semanticConcept",
        semantic_category as "semanticCategory",
        semantic_subcategory as "semanticSubcategory",
        confidence,
        is_wound_specific as "isWoundSpecific",
        typical_frequency as "typicalFrequency"
      FROM "SemanticIndexAssessmentType"
      WHERE ${whereClause}
      ORDER BY confidence DESC, assessment_name ASC
      LIMIT $${paramIndex}
    `;

    values.push(limit);

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error: any) {
      console.error('[AssessmentTypeSearcher] Error in combined search:', error);
      return [];
    }
  }
}

/**
 * Create an AssessmentTypeSearcher instance
 */
export function createAssessmentTypeSearcher(customerId: string): AssessmentTypeSearcher {
  return new AssessmentTypeSearcher(customerId);
}
