# Ontology Enrichment: Code Examples & Test Templates

This document provides ready-to-use code snippets and test templates for implementing the enrichment plan.

---

## 1. Database Migration Example

**File**: `database/migration/050_ontology_enrichment_schema.sql`

```sql
-- Ontology Enrichment Schema Extension
-- Purpose: Add clinical context, treatment options, assessment tools, etc.
-- Aligns with: ONTOLOGY_ENRICHMENT_PLAN.md

BEGIN;

-- Step 1: Add new columns to ClinicalOntology table
ALTER TABLE "ClinicalOntology"
  ADD COLUMN IF NOT EXISTS regional_variants JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS severity_scale JSONB,
  ADD COLUMN IF NOT EXISTS assessment_tools JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS common_complications JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS treatment_options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clinical_context JSONB,
  ADD COLUMN IF NOT EXISTS source_document VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_page INTEGER,
  ADD COLUMN IF NOT EXISTS image_references JSONB DEFAULT '[]'::jsonb;

-- Step 2: Add GIN indexes for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_ontology_regional_variants
  ON "ClinicalOntology" USING GIN(regional_variants);

CREATE INDEX IF NOT EXISTS idx_ontology_assessment_tools
  ON "ClinicalOntology" USING GIN(assessment_tools);

CREATE INDEX IF NOT EXISTS idx_ontology_treatment_options
  ON "ClinicalOntology" USING GIN(treatment_options);

CREATE INDEX IF NOT EXISTS idx_ontology_common_complications
  ON "ClinicalOntology" USING GIN(common_complications);

CREATE INDEX IF NOT EXISTS idx_ontology_clinical_context
  ON "ClinicalOntology" USING GIN(clinical_context);

CREATE INDEX IF NOT EXISTS idx_ontology_image_references
  ON "ClinicalOntology" USING GIN(image_references);

-- Step 3: Extend validation function
CREATE OR REPLACE FUNCTION validate_clinical_synonyms()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate existing JSONB fields
  IF NEW.synonyms IS NOT NULL AND jsonb_typeof(NEW.synonyms) != 'array' THEN
    RAISE EXCEPTION 'synonyms must be a JSONB array';
  END IF;

  IF NEW.abbreviations IS NOT NULL AND jsonb_typeof(NEW.abbreviations) != 'array' THEN
    RAISE EXCEPTION 'abbreviations must be a JSONB array';
  END IF;

  IF NEW.related_terms IS NOT NULL AND jsonb_typeof(NEW.related_terms) != 'array' THEN
    RAISE EXCEPTION 'related_terms must be a JSONB array';
  END IF;

  -- Validate new JSONB fields
  IF NEW.regional_variants IS NOT NULL AND jsonb_typeof(NEW.regional_variants) != 'array' THEN
    RAISE EXCEPTION 'regional_variants must be a JSONB array';
  END IF;

  IF NEW.assessment_tools IS NOT NULL AND jsonb_typeof(NEW.assessment_tools) != 'array' THEN
    RAISE EXCEPTION 'assessment_tools must be a JSONB array';
  END IF;

  IF NEW.common_complications IS NOT NULL AND jsonb_typeof(NEW.common_complications) != 'array' THEN
    RAISE EXCEPTION 'common_complications must be a JSONB array';
  END IF;

  IF NEW.treatment_options IS NOT NULL AND jsonb_typeof(NEW.treatment_options) != 'array' THEN
    RAISE EXCEPTION 'treatment_options must be a JSONB array';
  END IF;

  IF NEW.image_references IS NOT NULL AND jsonb_typeof(NEW.image_references) != 'array' THEN
    RAISE EXCEPTION 'image_references must be a JSONB array';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Add column comments for documentation
COMMENT ON COLUMN "ClinicalOntology".regional_variants IS
'Array of regional term variants.
Example: [
  {"region": "US", "term": "diabetic foot ulcer"},
  {"region": "UK", "term": "diabetic foot ulcer"}
]';

COMMENT ON COLUMN "ClinicalOntology".severity_scale IS
'Severity grading scale for the concept.
Example: {
  "name": "Wagner Grade",
  "values": ["Grade 0: Normal", "Grade 1: Superficial", ...]
}';

COMMENT ON COLUMN "ClinicalOntology".assessment_tools IS
'Array of assessment tools used to evaluate this concept.
Example: [
  {"name": "Monofilament Testing", "purpose": "Evaluate neuropathy"},
  {"name": "ABI", "purpose": "Assess circulation"}
]';

COMMENT ON COLUMN "ClinicalOntology".common_complications IS
'Array of common complications associated with this concept.
Example: ["infection", "osteomyelitis", "amputation"]';

COMMENT ON COLUMN "ClinicalOntology".treatment_options IS
'Array of treatment options with descriptions and frequency.
Example: [
  {
    "name": "Offloading",
    "description": "Reducing pressure on ulcer area",
    "frequency": "first-line"
  }
]';

COMMENT ON COLUMN "ClinicalOntology".clinical_context IS
'Extended clinical context including epidemiology, risk factors, nursing considerations.
Example: {
  "epidemiology": "Affects 15-20% of diabetic patients",
  "risk_factors": ["poor glycemic control", "neuropathy"],
  "nursing_considerations": ["Daily foot inspection", ...]
}';

COMMENT ON COLUMN "ClinicalOntology".image_references IS
'Array of image references with AI descriptions.
Example: [
  {
    "image_id": "img-13-001",
    "caption": "Clinical presentation",
    "ai_description": "...",
    "assessment_findings": ["finding1", "finding2"]
  }
]';

-- Step 5: Commit transaction
COMMIT;

-- Verification queries (run after migration)
-- SELECT COUNT(*) FROM "ClinicalOntology" WHERE regional_variants IS NOT NULL;
-- SELECT COUNT(*) FROM "ClinicalOntology" WHERE severity_scale IS NOT NULL;
-- \d "ClinicalOntology" (check new columns exist)
```

---

## 2. TypeScript Types

**File**: `lib/services/ontology/ontology-types.ts` (additions)

```typescript
// New interfaces for enriched ontology

export interface RegionalVariant {
  region: "US" | "UK" | "EU" | "AUS" | "CAN" | string;
  term: string;
  formality?: "formal" | "informal" | "clinical";
}

export interface SeverityScale {
  name: string;
  description?: string;
  values: string[] | SeverityValue[];
  reference?: string;
}

export interface SeverityValue {
  level: number | string;
  description: string;
  key_indicators?: string[];
}

export interface AssessmentTool {
  name: string;
  purpose: string;
  reference?: string;
  scoring_method?: string;
}

export interface TreatmentOption {
  name: string;
  description: string;
  frequency: "first-line" | "routine" | "as-needed" | "adjunctive";
  indications?: string[];
  contraindications?: string[];
  reference?: string;
}

export interface ClinicalContext {
  epidemiology?: string;
  risk_factors?: string[];
  nursing_considerations?: string[];
  pathophysiology?: string;
  complications?: string[];
  [key: string]: any;
}

export interface ImageReference {
  image_id: string;
  caption: string;
  clinical_description?: string;
  assessment_findings?: string[];
  severity_indicators?: string[];
  source_page?: number;
  extracted_at?: Date;
  thumbnail_url?: string;
  original_url?: string;
}

export interface EnrichedClinicalOntologyEntry extends ClinicalOntologyEntry {
  regional_variants?: RegionalVariant[];
  severity_scale?: SeverityScale;
  assessment_tools?: AssessmentTool[];
  common_complications?: string[];
  treatment_options?: TreatmentOption[];
  clinical_context?: ClinicalContext;
  source_document?: string;
  source_page?: number;
  image_references?: ImageReference[];
}
```

---

## 3. Service Extension

**File**: `lib/services/ontology/ontology-lookup.service.ts` (additions)

```typescript
// Add these methods to OntologyLookupService class

/**
 * Get clinical context for a concept
 */
async getClinicalContext(
  term: string,
  options: OntologySynonymOptions = {}
): Promise<ClinicalContext | null> {
  try {
    const pool = await getInsightGenDbPool();
    const lowerTerm = term.toLowerCase();

    const query = `
      SELECT
        concept_name,
        clinical_context
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        OR concept_name IN (
          SELECT jsonb_array_elements(synonyms)->>'value'
          FROM "ClinicalOntology"
          WHERE LOWER(jsonb_array_elements(synonyms)->>'value') = $1
        )
      LIMIT 1
    `;

    const result = await pool.query(query, [lowerTerm]);
    if (result.rows.length === 0) return null;

    return result.rows[0].clinical_context || null;
  } catch (error) {
    console.error('Error getting clinical context:', error);
    return null;
  }
}

/**
 * Get treatment options for a concept
 */
async getTreatmentOptions(
  term: string,
  options: {
    frequency?: 'first-line' | 'routine' | 'as-needed' | 'adjunctive';
    maxResults?: number;
  } = {}
): Promise<TreatmentOption[]> {
  try {
    const pool = await getInsightGenDbPool();
    const lowerTerm = term.toLowerCase();

    const query = `
      SELECT
        concept_name,
        treatment_options
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        OR concept_name IN (
          SELECT jsonb_array_elements(synonyms)->>'value'
          FROM "ClinicalOntology"
          WHERE LOWER(jsonb_array_elements(synonyms)->>'value') = $1
        )
      LIMIT 1
    `;

    const result = await pool.query(query, [lowerTerm]);
    if (result.rows.length === 0) return [];

    let treatments = result.rows[0].treatment_options || [];

    // Filter by frequency if specified
    if (options.frequency) {
      treatments = treatments.filter(
        (t: TreatmentOption) => t.frequency === options.frequency
      );
    }

    // Limit results
    if (options.maxResults) {
      treatments = treatments.slice(0, options.maxResults);
    }

    return treatments;
  } catch (error) {
    console.error('Error getting treatment options:', error);
    return [];
  }
}

/**
 * Get assessment tools for a concept
 */
async getAssessmentTools(
  term: string,
  options: { maxResults?: number } = {}
): Promise<AssessmentTool[]> {
  try {
    const pool = await getInsightGenDbPool();
    const lowerTerm = term.toLowerCase();

    const query = `
      SELECT
        concept_name,
        assessment_tools
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        OR concept_name IN (
          SELECT jsonb_array_elements(synonyms)->>'value'
          FROM "ClinicalOntology"
          WHERE LOWER(jsonb_array_elements(synonyms)->>'value') = $1
        )
      LIMIT 1
    `;

    const result = await pool.query(query, [lowerTerm]);
    if (result.rows.length === 0) return [];

    let tools = result.rows[0].assessment_tools || [];

    if (options.maxResults) {
      tools = tools.slice(0, options.maxResults);
    }

    return tools;
  } catch (error) {
    console.error('Error getting assessment tools:', error);
    return [];
  }
}

/**
 * Get severity scale for a concept
 */
async getSeverityScale(term: string): Promise<SeverityScale | null> {
  try {
    const pool = await getInsightGenDbPool();
    const lowerTerm = term.toLowerCase();

    const query = `
      SELECT
        concept_name,
        severity_scale
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        OR concept_name IN (
          SELECT jsonb_array_elements(synonyms)->>'value'
          FROM "ClinicalOntology"
          WHERE LOWER(jsonb_array_elements(synonyms)->>'value') = $1
        )
      LIMIT 1
    `;

    const result = await pool.query(query, [lowerTerm]);
    if (result.rows.length === 0) return null;

    return result.rows[0].severity_scale || null;
  } catch (error) {
    console.error('Error getting severity scale:', error);
    return null;
  }
}

/**
 * Get complications for a concept
 */
async getComplicationRisks(
  term: string,
  options: { maxResults?: number } = {}
): Promise<string[]> {
  try {
    const pool = await getInsightGenDbPool();
    const lowerTerm = term.toLowerCase();

    const query = `
      SELECT
        concept_name,
        common_complications
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        OR concept_name IN (
          SELECT jsonb_array_elements(synonyms)->>'value'
          FROM "ClinicalOntology"
          WHERE LOWER(jsonb_array_elements(synonyms)->>'value') = $1
        )
      LIMIT 1
    `;

    const result = await pool.query(query, [lowerTerm]);
    if (result.rows.length === 0) return [];

    let complications = result.rows[0].common_complications || [];

    if (options.maxResults) {
      complications = complications.slice(0, options.maxResults);
    }

    return complications;
  } catch (error) {
    console.error('Error getting complications:', error);
    return [];
  }
}

/**
 * Get image references for a concept
 */
async getImageReferences(
  term: string,
  options: { maxResults?: number } = {}
): Promise<ImageReference[]> {
  try {
    const pool = await getInsightGenDbPool();
    const lowerTerm = term.toLowerCase();

    const query = `
      SELECT
        concept_name,
        image_references
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        OR concept_name IN (
          SELECT jsonb_array_elements(synonyms)->>'value'
          FROM "ClinicalOntology"
          WHERE LOWER(jsonb_array_elements(synonyms)->>'value') = $1
        )
      LIMIT 1
    `;

    const result = await pool.query(query, [lowerTerm]);
    if (result.rows.length === 0) return [];

    let images = result.rows[0].image_references || [];

    if (options.maxResults) {
      images = images.slice(0, options.maxResults);
    }

    return images;
  } catch (error) {
    console.error('Error getting image references:', error);
    return [];
  }
}
```

---

## 4. Unit Tests Template

**File**: `lib/services/ontology/__tests__/ontology-enrichment.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { OntologyLookupService } from "../ontology-lookup.service";
import { getInsightGenDbPool } from "@/lib/db";
import type { Pool } from "pg";

describe("OntologyLookupService - Enrichment Fields", () => {
  let service: OntologyLookupService;
  let pool: Pool;

  beforeAll(async () => {
    pool = await getInsightGenDbPool();
    service = new OntologyLookupService();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("getClinicalContext", () => {
    it("should return clinical context for known concept", async () => {
      const context = await service.getClinicalContext("diabetic foot ulcer");

      expect(context).toBeDefined();
      expect(context).toHaveProperty("epidemiology");
      expect(context).toHaveProperty("risk_factors");
      expect(context).toHaveProperty("nursing_considerations");
    });

    it("should return null for unknown concept", async () => {
      const context = await service.getClinicalContext(
        "nonexistent concept xyz",
      );
      expect(context).toBeNull();
    });

    it("should handle empty/whitespace input", async () => {
      const context1 = await service.getClinicalContext("");
      const context2 = await service.getClinicalContext("   ");

      expect(context1).toBeNull();
      expect(context2).toBeNull();
    });

    it("should be case insensitive", async () => {
      const context1 = await service.getClinicalContext("DIABETIC FOOT ULCER");
      const context2 = await service.getClinicalContext("diabetic foot ulcer");

      expect(context1).toEqual(context2);
    });
  });

  describe("getTreatmentOptions", () => {
    it("should return treatment options for known concept", async () => {
      const treatments = await service.getTreatmentOptions(
        "diabetic foot ulcer",
      );

      expect(Array.isArray(treatments)).toBe(true);
      expect(treatments.length).toBeGreaterThan(0);

      // Verify structure
      treatments.forEach((t) => {
        expect(t).toHaveProperty("name");
        expect(t).toHaveProperty("description");
        expect(t).toHaveProperty("frequency");
      });
    });

    it("should filter by frequency", async () => {
      const firstLineTreatments = await service.getTreatmentOptions(
        "diabetic foot ulcer",
        { frequency: "first-line" },
      );

      firstLineTreatments.forEach((t) => {
        expect(t.frequency).toBe("first-line");
      });
    });

    it("should respect maxResults limit", async () => {
      const treatments = await service.getTreatmentOptions(
        "diabetic foot ulcer",
        { maxResults: 2 },
      );

      expect(treatments.length).toBeLessThanOrEqual(2);
    });

    it("should return empty array for unknown concept", async () => {
      const treatments = await service.getTreatmentOptions(
        "unknown concept xyz",
      );
      expect(treatments).toEqual([]);
    });
  });

  describe("getAssessmentTools", () => {
    it("should return assessment tools for known concept", async () => {
      const tools = await service.getAssessmentTools("diabetic foot ulcer");

      expect(Array.isArray(tools)).toBe(true);
      tools.forEach((t) => {
        expect(t).toHaveProperty("name");
        expect(t).toHaveProperty("purpose");
      });
    });

    it("should respect maxResults limit", async () => {
      const tools = await service.getAssessmentTools("diabetic foot ulcer", {
        maxResults: 1,
      });

      expect(tools.length).toBeLessThanOrEqual(1);
    });

    it("should return empty array for unknown concept", async () => {
      const tools = await service.getAssessmentTools("unknown concept xyz");
      expect(tools).toEqual([]);
    });
  });

  describe("getSeverityScale", () => {
    it("should return severity scale for known concept", async () => {
      const scale = await service.getSeverityScale("diabetic foot ulcer");

      expect(scale).toBeDefined();
      expect(scale).toHaveProperty("name");
      expect(scale).toHaveProperty("values");
      expect(Array.isArray(scale.values)).toBe(true);
    });

    it("should return null for concept without severity scale", async () => {
      // Assuming some concepts don't have severity scales
      const scale = await service.getSeverityScale("diabetic foot ulcer");

      // Either has scale or null
      expect(scale === null || scale.name).toBeDefined();
    });
  });

  describe("getComplicationRisks", () => {
    it("should return complications for known concept", async () => {
      const complications = await service.getComplicationRisks(
        "diabetic foot ulcer",
      );

      expect(Array.isArray(complications)).toBe(true);
      complications.forEach((c) => {
        expect(typeof c).toBe("string");
      });
    });

    it("should respect maxResults limit", async () => {
      const complications = await service.getComplicationRisks(
        "diabetic foot ulcer",
        { maxResults: 2 },
      );

      expect(complications.length).toBeLessThanOrEqual(2);
    });

    it("should return empty array for unknown concept", async () => {
      const complications = await service.getComplicationRisks(
        "unknown concept xyz",
      );
      expect(complications).toEqual([]);
    });
  });

  describe("getImageReferences", () => {
    it("should return image references for known concept", async () => {
      const images = await service.getImageReferences("diabetic foot ulcer");

      expect(Array.isArray(images)).toBe(true);
      if (images.length > 0) {
        images.forEach((img) => {
          expect(img).toHaveProperty("image_id");
          expect(img).toHaveProperty("caption");
        });
      }
    });

    it("should respect maxResults limit", async () => {
      const images = await service.getImageReferences("diabetic foot ulcer", {
        maxResults: 1,
      });

      expect(images.length).toBeLessThanOrEqual(1);
    });

    it("should return empty array for unknown concept", async () => {
      const images = await service.getImageReferences("unknown concept xyz");
      expect(images).toEqual([]);
    });
  });
});
```

---

## 5. Integration Test Template

**File**: `lib/services/ontology/__tests__/ontology-enrichment-integration.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "@jest/globals";
import { OntologyLookupService } from "../ontology-lookup.service";
import { OntologyConceptsService } from "../ontology-concepts.service";
import { OntologySearchService } from "../ontology-search.service";
import { getInsightGenDbPool } from "@/lib/db";

describe("Ontology Enrichment Integration", () => {
  let lookupService: OntologyLookupService;
  let conceptsService: OntologyConceptsService;
  let searchService: OntologySearchService;

  beforeAll(async () => {
    lookupService = new OntologyLookupService();
    conceptsService = new OntologyConceptsService();
    searchService = new OntologySearchService();
  });

  describe("Complete Enrichment Data Flow", () => {
    it("should load concept with all enrichment fields", async () => {
      const concept = await conceptsService.getOntologyConcept(
        "diabetic-foot-ulcer",
      );

      expect(concept).toBeDefined();
      expect(concept.preferred_term).toBe("diabetic foot ulcer");
      expect(concept.category).toBe("wound_type");

      // Verify enrichment fields
      expect(concept.regional_variants).toBeDefined();
      expect(concept.severity_scale).toBeDefined();
      expect(concept.assessment_tools).toBeDefined();
      expect(concept.common_complications).toBeDefined();
      expect(concept.treatment_options).toBeDefined();
      expect(concept.clinical_context).toBeDefined();
    });

    it("should get complete enriched context in one call", async () => {
      // New method combining all enrichment data
      const enrichedContext = await lookupService.getEnrichedContext(
        "diabetic foot ulcer",
      );

      expect(enrichedContext).toHaveProperty("concept");
      expect(enrichedContext).toHaveProperty("treatments");
      expect(enrichedContext).toHaveProperty("assessments");
      expect(enrichedContext).toHaveProperty("complications");
      expect(enrichedContext).toHaveProperty("severity");
    });

    it("should maintain consistency across services", async () => {
      // Get concept through different services
      const concept1 = await conceptsService.getOntologyConcept(
        "diabetic-foot-ulcer",
      );
      const concept2 = await searchService.searchOntologyConcepts(
        "diabetic foot ulcer",
        { limit: 1 },
      );

      // Both should have same enrichment
      expect(concept1.severity_scale).toEqual(concept2[0]?.severity_scale);
      expect(concept1.treatment_options).toEqual(
        concept2[0]?.treatment_options,
      );
    });
  });

  describe("Enrichment in Filter Mapping Context", () => {
    it("should provide treatment context for filter mapping", async () => {
      const treatments = await lookupService.getTreatmentOptions(
        "diabetic foot ulcer",
      );

      // Should be usable for mapping
      expect(treatments.length).toBeGreaterThan(0);

      // Each treatment should be distinct and useful
      const treatmentNames = treatments.map((t) => t.name);
      expect(new Set(treatmentNames).size).toBe(treatmentNames.length);
    });

    it("should provide assessment tools for filter generation", async () => {
      const tools = await lookupService.getAssessmentTools(
        "diabetic foot ulcer",
      );

      // Should be usable for filter generation
      if (tools.length > 0) {
        tools.forEach((tool) => {
          expect(tool.name).toBeTruthy();
          expect(tool.purpose).toBeTruthy();
        });
      }
    });
  });

  describe("Cache Performance with Enrichment", () => {
    it("should cache enrichment field queries", async () => {
      const start1 = Date.now();
      await lookupService.getClinicalContext("diabetic foot ulcer");
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      await lookupService.getClinicalContext("diabetic foot ulcer");
      const duration2 = Date.now() - start2;

      // Second call should be significantly faster (cached)
      expect(duration2).toBeLessThan(duration1);
    });

    it("should maintain separate caches for different query types", async () => {
      // Populate multiple caches
      await lookupService.getClinicalContext("diabetic foot ulcer");
      await lookupService.getTreatmentOptions("diabetic foot ulcer");
      await lookupService.getAssessmentTools("diabetic foot ulcer");

      // Cache stats should show multiple entries
      const stats = lookupService.getCacheStats();
      expect(stats.size).toBeGreaterThan(1);
    });
  });

  describe("All Core Concepts Enriched", () => {
    it("should have enrichment data for all base concepts", async () => {
      const allConcepts = await conceptsService.listOntologyConcepts({
        limit: 100,
      });

      // Core wound types should have enrichment
      const woundTypes = allConcepts.filter((c) => c.category === "wound_type");

      woundTypes.forEach((concept) => {
        expect(concept.severity_scale).toBeDefined();
        expect(concept.assessment_tools).toBeDefined();
        expect(concept.common_complications).toBeDefined();
      });
    });

    it("should have treatment options for relevant concepts", async () => {
      const treatments = allConcepts.filter(
        (c) => c.treatment_options && c.treatment_options.length > 0,
      );

      expect(treatments.length).toBeGreaterThan(0);
    });
  });
});
```

---

## 6. Loader Script Update

**File**: `lib/jobs/ontology_loader.ts` (key sections)

```typescript
// Update FlatConcept interface to include enrichment fields
interface FlatConcept {
  concept_name: string;
  canonical_name: string;
  concept_type: string;
  description: string;
  aliases: string[];
  metadata: Record<string, any>;

  // NEW ENRICHMENT FIELDS
  regional_variants?: any[];
  severity_scale?: any;
  assessment_tools?: any[];
  common_complications?: string[];
  treatment_options?: any[];
  clinical_context?: any;
  source_document?: string;
  source_page?: number;
  image_references?: any[];
}

// Update the INSERT query to include new columns
async function upsertConcepts(
  pool: Pool,
  concepts: FlatConcept[],
  embeddings: Record<string, number[]>,
): Promise<OntologyLoaderResult> {
  // ... existing code ...

  const upsertQuery = `
    INSERT INTO "ClinicalOntology" (
      concept_name,
      canonical_name,
      concept_type,
      description,
      aliases,
      metadata,
      embedding,
      preferred_term,
      category,
      synonyms,
      abbreviations,
      related_terms,
      regional_variants,
      severity_scale,
      assessment_tools,
      common_complications,
      treatment_options,
      clinical_context,
      source_document,
      source_page,
      image_references
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )
    ON CONFLICT (concept_name, concept_type)
    DO UPDATE SET
      description = EXCLUDED.description,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      preferred_term = EXCLUDED.preferred_term,
      category = EXCLUDED.category,
      synonyms = EXCLUDED.synonyms,
      abbreviations = EXCLUDED.abbreviations,
      related_terms = EXCLUDED.related_terms,
      regional_variants = EXCLUDED.regional_variants,
      severity_scale = EXCLUDED.severity_scale,
      assessment_tools = EXCLUDED.assessment_tools,
      common_complications = EXCLUDED.common_complications,
      treatment_options = EXCLUDED.treatment_options,
      clinical_context = EXCLUDED.clinical_context,
      source_document = EXCLUDED.source_document,
      source_page = EXCLUDED.source_page,
      image_references = EXCLUDED.image_references,
      updated_at = NOW()
  `;

  for (const concept of concepts) {
    const embedding = embeddings[concept.concept_name];

    await pool.query(upsertQuery, [
      concept.concept_name,
      concept.canonical_name,
      concept.concept_type,
      concept.description,
      concept.aliases,
      JSON.stringify(concept.metadata),
      `[${embedding.join(",")}]`, // pgvector format
      concept.canonical_name, // preferred_term
      concept.concept_type, // category (mapped)
      JSON.stringify(concept.metadata.synonyms || []),
      JSON.stringify(concept.metadata.abbreviations || []),
      JSON.stringify(concept.metadata.related_terms || []),
      JSON.stringify(concept.regional_variants || []),
      JSON.stringify(concept.severity_scale || null),
      JSON.stringify(concept.assessment_tools || []),
      JSON.stringify(concept.common_complications || []),
      JSON.stringify(concept.treatment_options || []),
      JSON.stringify(concept.clinical_context || null),
      concept.source_document || null,
      concept.source_page || null,
      JSON.stringify(concept.image_references || []),
    ]);
  }

  // ... rest of function ...
}
```

---

## 7. API Response Enhancement

**File**: `app/api/ontology/search/route.ts` (additions)

```typescript
// Enhance search response to include enrichment
async function GET(request: NextRequest) {
  // ... existing search logic ...

  const concepts = await searchOntologyConcepts(query, options);

  // Enhance response with enrichment data
  const enrichedConcepts = await Promise.all(
    concepts.map(async (concept) => ({
      ...concept,
      clinical_context: await ontologyService.getClinicalContext(
        concept.preferred_term,
      ),
      treatment_options: await ontologyService.getTreatmentOptions(
        concept.preferred_term,
        { maxResults: 3 },
      ),
      assessment_tools: await ontologyService.getAssessmentTools(
        concept.preferred_term,
        { maxResults: 2 },
      ),
      severity_scale: await ontologyService.getSeverityScale(
        concept.preferred_term,
      ),
      complications: await ontologyService.getComplicationRisks(
        concept.preferred_term,
        { maxResults: 5 },
      ),
    })),
  );

  return NextResponse.json({
    results: enrichedConcepts,
    count: enrichedConcepts.length,
  });
}
```

---

## 8. YAML Example (Enriched Entry)

**File**: `data/ontology/wound-care-terminology.yaml` (example)

```yaml
ontology:
  - preferred_term: "diabetic foot ulcer"
    category: "wound_type"
    description: |
      An open wound or lesion typically affecting the plantar surface of the foot 
      in patients with diabetes mellitus, resulting from neuropathy and/or ischemia. 
      Represents a serious complication of diabetes requiring prompt intervention 
      and multidisciplinary care.

    synonyms:
      - value: "foot ulcer"
        formality: "informal"
        confidence: 0.85
        region: "US"
      - value: "diabetic foot wound"
        formality: "clinical"
        confidence: 0.95
      - value: "neuropathic ulcer"
        formality: "clinical"
        confidence: 0.88
        specialty: "podiatry"
      - value: "diabetic plantar ulcer"
        formality: "clinical"
        confidence: 0.92

    abbreviations:
      - value: "DFU"
        context_keywords:
          ["wound", "ulcer", "foot", "diabetic", "patient", "care"]
        frequency: 0.95
        domain: "wound_care"
      - value: "PUD"
        context_keywords: ["plantar", "ulcer", "diabetic", "foot"]
        frequency: 0.65
        domain: "wound_care"

    related_terms:
      - "diabetic foot infection"
      - "peripheral neuropathy"
      - "peripheral arterial disease"
      - "Wagner grade ulcer"
      - "osteomyelitis"

    regional_variants:
      - region: "US"
        term: "diabetic foot ulcer"
      - region: "UK"
        term: "diabetic foot ulcer"
      - region: "AUS"
        term: "diabetic foot ulcer"

    severity_scale:
      name: "Wagner Ulcer Grade"
      description: "Classification system for diabetic foot ulcers"
      values:
        - "Grade 0: Normal foot, no ulceration (history of ulceration or high risk)"
        - "Grade 1: Superficial ulcer (full-thickness, skin and superficial subcutaneous tissue)"
        - "Grade 2: Ulcer with penetration (extends through subcutaneous tissue into muscle, bone, or joint)"
        - "Grade 3: Osteitis (bone involvement)"
        - "Grade 4: Gangrene of the toe"
        - "Grade 5: Gangrene of the entire foot"
      reference: "Wagner, F.W. (1981). The Diabetic Foot. Orthopedic Clinics of North America."

    assessment_tools:
      - name: "Monofilament Testing"
        purpose: "Evaluate protective sensation and peripheral neuropathy using 10g monofilament"
        reference: "ADA Guidelines for Diabetic Foot Care"
      - name: "Ankle-Brachial Index (ABI)"
        purpose: "Assess arterial circulation and detect peripheral arterial disease"
        scoring_method: "Systolic BP at ankle / Systolic BP at arm"
      - name: "Vibration Perception Threshold (VPT)"
        purpose: "Quantitative assessment of vibration sense using a biothesiometer"
      - name: "PUSH Tool (Pressure Ulcer Scale for Healing)"
        purpose: "Quantify ulcer healing status and wound severity"

    common_complications:
      - "diabetic foot infection"
      - "osteomyelitis"
      - "gangrene"
      - "cellulitis"
      - "amputation"
      - "sepsis"
      - "systemic infection"

    treatment_options:
      - name: "Offloading"
        description: |
          Redistribution of pressure away from the ulcer area using specialized 
          footwear, insoles, casts, or other devices. First-line intervention 
          to prevent progression and promote healing.
        frequency: "first-line"
        indications:
          - "All diabetic foot ulcers"
          - "Pressure redistribution needed"
      - name: "Debridement"
        description: |
          Removal of dead, damaged, necrotic, or infected tissue from the wound 
          bed. Can be sharp, enzymatic, autolytic, or mechanical.
        frequency: "routine"
        indications:
          - "Necrotic tissue present"
          - "Undermined edges"
          - "Non-healing ulcers"
      - name: "Wound Dressing"
        description: |
          Application of appropriate dressing material to maintain moist wound 
          environment, absorb exudate, and protect from contamination.
        frequency: "ongoing"
        indications:
          - "All wounds"
          - "Type depends on exudate level and wound characteristics"
      - name: "Vascular Assessment & Intervention"
        description: |
          Diagnostic angiography, duplex ultrasound, or interventional procedures 
          (angioplasty, bypass) for arterial insufficiency contributing to ulcer.
        frequency: "as-needed"
        indications:
          - "ABI < 0.9"
          - "Clinical signs of ischemia"
          - "Non-healing ulcer despite optimal care"
      - name: "Growth Factor Therapy"
        description: "Topical application of recombinant growth factors to promote healing"
        frequency: "adjunctive"
      - name: "Negative Pressure Wound Therapy (NPWT)"
        description: "Application of controlled negative pressure to promote granulation and healing"
        frequency: "adjunctive"

    clinical_context:
      epidemiology: |
        Diabetic foot ulcers affect approximately 15-20% of diabetic patients 
        during their lifetime. Leading cause of non-traumatic lower-limb 
        amputation in developed countries. Prevalence estimated at 2-5% of 
        diabetic population at any given time.

      risk_factors:
        - "Poor glycemic control (elevated HbA1c)"
        - "Peripheral sensory neuropathy"
        - "Peripheral arterial disease"
        - "Foot deformity (Charcot foot, hammertoes)"
        - "Previous ulceration or amputation"
        - "Limited joint mobility"
        - "Poor vision or inability to inspect feet"
        - "Social factors (homelessness, poor hygiene)"

      pathophysiology: |
        Diabetes causes neuropathy (nerve damage) and angiopathy (blood vessel 
        disease). Neuropathy reduces pain sensation, leading to repeated trauma 
        and abnormal pressure distribution. Ischemia impairs healing response. 
        High glucose environment promotes infection risk.

      nursing_considerations:
        - "Daily foot inspection by patient or caregiver is essential"
        - "Educate on proper foot hygiene and nail care"
        - "Monitor for signs of infection: warmth, erythema, purulent drainage, fever"
        - "Assess pain level and manage appropriately (may be absent due to neuropathy)"
        - "Implement and reinforce pressure relief strategies"
        - "Monitor blood glucose and encourage optimal control"
        - "Assess vascular status regularly (pulses, skin temperature, color)"
        - "Document ulcer characteristics: size, depth, exudate, tissue type"
        - "Coordinate with multidisciplinary team (physician, podiatrist, PT/OT, dietitian)"
        - "Provide emotional support and address psychosocial factors"

      prognosis: |
        With optimal treatment, 50-60% of diabetic foot ulcers heal within 12 weeks. 
        However, 15-20% may progress to amputation. Recurrence rate is 33% within 
        one year and 50% within 5 years. Prevention through patient education and 
        regular foot screening is paramount.

    source_document: "Wound Care Terminology Glossary - Nurse Edition"
    source_page: 12

    image_references:
      - image_id: "img-dfu-001"
        caption: "Diabetic foot ulcer, Wagner Grade 1"
        clinical_description: |
          Superficial ulcer on the plantar surface of the foot showing 
          full-thickness skin involvement with surrounding erythema.
        assessment_findings:
          - "Superficial ulcer, full-thickness"
          - "Surrounding erythema"
          - "No bone involvement"
          - "Minimal drainage"
        severity_indicators:
          - "Wagner Grade: 1"
          - "PUSH Score: 10-14 (estimated)"
        source_page: 13

      - image_id: "img-dfu-003"
        caption: "Diabetic foot ulcer, Wagner Grade 3"
        clinical_description: |
          Deep tissue ulcer with bone involvement showing significant tissue 
          loss, necrotic tissue, and marked surrounding inflammation.
        assessment_findings:
          - "Deep ulcer with bone involvement"
          - "Necrotic tissue present"
          - "Significant erythema and edema"
          - "Purulent drainage"
        severity_indicators:
          - "Wagner Grade: 3"
          - "PUSH Score: 19-22 (estimated)"
        source_page: 15
```

---

## 9. Jest Configuration

**File**: `jest.config.js` (update for ontology tests)

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "lib/services/ontology/**/*.ts",
    "!**/*.test.ts",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};
```

---

## Summary

These code examples provide:

✓ Database migration with new columns  
✓ TypeScript types for enriched data  
✓ Service methods for accessing enrichment fields  
✓ Comprehensive unit and integration tests  
✓ Loader script updates  
✓ API enhancements  
✓ YAML example with full enrichment  
✓ Jest configuration for testing

**Next Steps**:

1. Review and adapt these examples to your codebase style
2. Implement Phase 1 (database + types)
3. Add services and update loader
4. Implement comprehensive tests
5. Deploy and validate
