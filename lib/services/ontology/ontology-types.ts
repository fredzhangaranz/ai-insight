/**
 * TypeScript type definitions for Clinical Ontology
 *
 * Corresponds to database schema in:
 * - database/migration/015_clinical_ontology_schema.sql
 * - database/migration/029_ontology_synonyms_schema.sql
 */

/**
 * Synonym entry with regional and formality metadata
 */
export interface ClinicalSynonym {
  value: string;
  region?: string;           // "US", "UK", "AU", etc.
  specialty?: string;        // "wound_care", "vascular", "research"
  formality: 'clinical' | 'informal' | 'deprecated';
  confidence: number;        // 0.0-1.0
}

/**
 * Abbreviation entry with context keywords for disambiguation
 */
export interface ClinicalAbbreviation {
  value: string;
  context_keywords: string[];  // Keywords that help identify this meaning
  frequency: number;           // 0.0-1.0 (how often this meaning is used)
  domain: string;              // "wound_care", "research", "vascular", etc.
}

/**
 * Data source mapping for an ontology concept
 * (introduced in migration 040_ontology_data_sources.sql)
 */
export interface ClinicalDataSource {
  table: string;
  column: string;
  confidence?: number;
  measurement_type?: string;
  unit?: string;
}

/**
 * Complete ontology entry from database
 */
export interface ClinicalOntologyEntry {
  id: string;

  // Original fields (from 015_clinical_ontology_schema.sql)
  concept_name: string;
  canonical_name: string;
  concept_type: string;
  description?: string;
  aliases?: string[];
  embedding?: number[];      // 3072-dimensional vector
  is_deprecated: boolean;

  // New fields (from 029_ontology_synonyms_schema.sql)
  preferred_term: string;
  category: string;
  synonyms: ClinicalSynonym[];
  abbreviations: ClinicalAbbreviation[];
  related_terms: string[];

  // Metadata and data sources
  metadata: Record<string, any>;
  data_sources?: ClinicalDataSource[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Options for ontology synonym lookup
 */
export interface OntologySynonymOptions {
  maxLevels?: number;           // Default: 1 (single-level expansion)
  questionContext?: string;     // For context-aware abbreviation expansion
  preferredRegion?: string;     // "US", "UK", etc. - prioritize regional terms
  includeDeprecated?: boolean;  // Default: false
  includeInformal?: boolean;    // Default: true
  maxResults?: number;          // Default: 20 (prevent explosion)
}

/**
 * Result from ontology lookup with metadata
 */
export interface OntologySynonymResult {
  synonyms: string[];           // Array of synonym values
  source: 'direct' | 'abbreviation' | 'multi_level';
  confidence: number;           // Average confidence of synonyms
  matchedEntry?: {
    preferred_term: string;
    category: string;
  };
}
