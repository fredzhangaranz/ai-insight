# Ontology Enrichment & Expansion Implementation Plan

**Status**: Planning Phase  
**Created**: 2026-02-04  
**Reference**: Wound Care Terminology Glossary (PDF) + Current wound-care-terminology.yaml

---

## Executive Summary

This plan outlines how to enrich and expand the `wound-care-terminology.yaml` file using data from the nurse-created PDF glossary, while maintaining full alignment with:

- **Database Schema**: `ClinicalOntology` table with JSONB fields for synonyms, abbreviations, related_terms
- **Data Loading**: `ontology_loader.ts` and `load-ontology-synonyms.js` scripts
- **Services**: `OntologyLookupService`, `OntologySearchService`, `OntologyConceptsService`
- **Usage**: Filter mapping, AI prompt context, intent classification
- **Testing**: Unit tests, integration tests, API tests

---

## Part 1: Current State Analysis

### 1.1 Database Schema Alignment

**ClinicalOntology Table** (from migration 029):

```
Core Fields:
- concept_name (VARCHAR) - Primary identifier
- preferred_term (VARCHAR) - Canonical form
- category (VARCHAR) - wound_type, treatment, assessment, laboratory
- description (TEXT) - Clinical description
- aliases (TEXT[]) - Legacy field
- metadata (JSONB) - Flexible metadata
- embedding (VECTOR(3072)) - Google Gemini embedding

Extended Fields (Perfect for PDF enrichment):
- synonyms (JSONB[]) - Array of synonym objects with:
  ✓ value, region, specialty, formality, confidence
- abbreviations (JSONB[]) - Array with:
  ✓ value, context_keywords, frequency, domain
- related_terms (JSONB[]) - Array of related concepts
```

**Why This Schema is Perfect**:

- JSONB allows flexible metadata storage (nursing notes, clinical context, etc.)
- Indexed fields (GIN indexes on synonyms, abbreviations) for fast queries
- Full-text search index on preferred_term
- Validation triggers ensure data integrity

### 1.2 Current YAML Structure

**File**: `data/ontology/wound-care-terminology.yaml`  
**Current Entries**: 30 core terms

**Structure**:

```yaml
ontology:
  - preferred_term: "diabetic foot ulcer"
    category: "wound_type"
    description: "..."
    synonyms:
      - value: "..."
        formality: "clinical"
        confidence: 0.85
    abbreviations:
      - value: "DFU"
        context_keywords: [...]
    related_terms: [...]
```

**Strengths**:
✓ Well-structured with formality levels and confidence scores  
✓ Context keywords for abbreviation disambiguation  
✓ Related terms for concept connectivity

**Gaps**:
✗ Limited coverage (30 terms vs. potential 100+ from PDF)  
✗ Missing clinical context/nursing notes  
✗ No severity scales or assessment tools  
✗ No treatment options or complications  
✗ No image references (PDF has clinical images)

### 1.3 PDF Content Analysis

**File**: `data/ontology/Wound Terminolgy Glossary.pdf`  
**Pages**: 25  
**Source**: Nurse-created clinical resource

**Contains**:

- Clinical terminology definitions
- Regional variations
- Clinical context and severity scales
- Assessment tools and scoring systems
- Treatment protocols
- Nursing considerations
- **Clinical images/diagrams** (see Part 5)

---

## Part 2: Enrichment Strategy

### 2.1 Merge vs. Replace Decision

**Decision: MERGE (Enrich, Don't Replace)**

**Rationale**:

- Current YAML has sophisticated metadata (confidence, formality, specialty)
- PDF has depth and clinical context
- Database schema perfectly supports both
- Preserves existing structure while adding value

**Approach**:

1. **Phase 1**: Expand existing 30 entries with PDF data
2. **Phase 2**: Add new entries from PDF (potentially 40-60 more)
3. **Phase 3**: Add clinical context fields
4. **Phase 4**: Handle images (see Part 5)

### 2.2 New YAML Fields (Database-Aligned)

**Extend the schema to include**:

```yaml
ontology:
  - preferred_term: "diabetic foot ulcer"
    category: "wound_type"
    description: "..."

    # EXISTING FIELDS (keep as is)
    synonyms: [...]
    abbreviations: [...]
    related_terms: [...]

    # NEW FIELDS - Phase 1 (High Priority)
    regional_variants:
      - region: "US"
        term: "diabetic foot ulcer"
      - region: "UK"
        term: "diabetic foot ulcer"

    severity_scale:
      name: "Wagner Grade"
      values: ["Grade 0", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]

    assessment_tools:
      - name: "Monofilament Testing"
        purpose: "Evaluate peripheral neuropathy"
      - name: "Ankle-Brachial Index (ABI)"
        purpose: "Assess vascular circulation"

    common_complications:
      - "infection"
      - "osteomyelitis"
      - "amputation"

    treatment_options:
      - name: "Offloading"
        description: "Reducing pressure on the ulcer area"
        frequency: "first-line"
      - name: "Debridement"
        description: "Removal of dead tissue"

    # NEW FIELDS - Phase 2 (Medium Priority)
    clinical_context:
      epidemiology: "Affects 15-20% of diabetic patients"
      risk_factors: ["poor glycemic control", "neuropathy", "ischemia"]
      nursing_considerations:
        - "Patient education on foot care is critical"
        - "Regular pressure redistribution"
        - "Monitor for signs of infection"

    # NEW FIELDS - Phase 3 (Lower Priority)
    source_document: "Wound Terminology Glossary - Section 3.1"
    source_page: 15
    image_references:
      - image_id: "fig_dfu_001"
        caption: "Clinical presentation of diabetic foot ulcer, Wagner Grade 3"
        description: "Deep tissue involvement with necrotic tissue"
```

**Database Alignment**:

- Store new fields in `metadata` (JSONB) for flexibility
- Alternatively: Add dedicated columns if heavily queried (can be done in Phase 2 migration)

---

## Part 3: Implementation Roadmap

### Phase 1: Schema Extension & Database Migrations (Week 1)

**Goal**: Extend database schema to support enriched ontology data

#### 3.1.1 Database Migration

**File**: `database/migration/050_ontology_enrichment_schema.sql`

```sql
-- Extend ClinicalOntology with enrichment fields
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

-- Add GIN indexes for new JSONB fields
CREATE INDEX IF NOT EXISTS idx_ontology_assessment_tools
  ON "ClinicalOntology" USING GIN(assessment_tools);
CREATE INDEX IF NOT EXISTS idx_ontology_treatment_options
  ON "ClinicalOntology" USING GIN(treatment_options);
CREATE INDEX IF NOT EXISTS idx_ontology_clinical_context
  ON "ClinicalOntology" USING GIN(clinical_context);

-- Update validation function
CREATE OR REPLACE FUNCTION validate_clinical_synonyms()
RETURNS TRIGGER AS $$
BEGIN
  -- ... existing validation ...
  -- Add validation for new fields
  IF NEW.regional_variants IS NOT NULL
    AND jsonb_typeof(NEW.regional_variants) != 'array' THEN
    RAISE EXCEPTION 'regional_variants must be a JSONB array';
  END IF;
  -- ... more validation ...
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Status**: ✓ Ready to implement

#### 3.1.2 TypeScript Type Updates

**File**: `lib/services/ontology/ontology-types.ts`

```typescript
export interface ClinicalOntologyEntry {
  // Existing fields
  id: string;
  concept_name: string;
  preferred_term: string;
  category: string;
  description: string;
  synonyms: ClinicalSynonym[];
  abbreviations: ClinicalAbbreviation[];
  related_terms: string[];
  metadata: Record<string, any>;

  // NEW FIELDS
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

export interface RegionalVariant {
  region: "US" | "UK" | "EU" | "AUS" | "CAN";
  term: string;
}

export interface SeverityScale {
  name: string;
  values: string[];
  reference?: string;
}

export interface AssessmentTool {
  name: string;
  purpose: string;
  reference?: string;
}

export interface ClinicalContext {
  epidemiology?: string;
  risk_factors?: string[];
  nursing_considerations?: string[];
  [key: string]: any;
}

export interface ImageReference {
  image_id: string;
  caption: string;
  description?: string;
  source_page?: number;
}
```

**Status**: ✓ Ready to implement

### Phase 2: YAML Enrichment (Week 2-3)

**Goal**: Expand wound-care-terminology.yaml with PDF content

#### 3.2.1 Expand Existing Entries (30 terms)

**Example - Before**:

```yaml
- preferred_term: "diabetic foot ulcer"
  category: "wound_type"
  description: "Ulceration of the foot in diabetic patients..."
  synonyms: [...]
  abbreviations: [...]
  related_terms: [...]
```

**Example - After**:

```yaml
- preferred_term: "diabetic foot ulcer"
  category: "wound_type"
  description: "Ulceration of the foot in diabetic patients..."

  synonyms:
    - value: "foot ulcer"
      formality: "informal"
      confidence: 0.85
    - value: "diabetic foot wound"
      formality: "clinical"
      confidence: 0.95
    - value: "neuropathic ulcer"
      formality: "clinical"
      confidence: 0.88
      specialty: "podiatry"

  abbreviations:
    - value: "DFU"
      context_keywords: ["wound", "ulcer", "foot", "diabetic"]
      frequency: 0.90
      domain: "wound_care"

  related_terms:
    - "diabetic foot infection"
    - "ischemic foot ulcer"
    - "Wagner grade ulcer"

  # NEW ENRICHMENT
  regional_variants:
    - region: "US"
      term: "diabetic foot ulcer"
    - region: "UK"
      term: "diabetic foot ulcer"

  severity_scale:
    name: "Wagner Grade"
    values:
      - "Grade 0: Normal foot, no ulceration"
      - "Grade 1: Superficial ulcer"
      - "Grade 2: Ulcer with tissue loss"
      - "Grade 3: Deep ulcer with bone involvement"
      - "Grade 4: Gangrene of toes"
      - "Grade 5: Gangrene of foot"

  assessment_tools:
    - name: "Monofilament Testing"
      purpose: "Evaluate peripheral neuropathy"
    - name: "Ankle-Brachial Index (ABI)"
      purpose: "Assess vascular circulation"
    - name: "Vibration Perception Threshold"
      purpose: "Assess vibratory sensation"

  common_complications:
    - "diabetic foot infection"
    - "osteomyelitis"
    - "gangrene"
    - "amputation"
    - "sepsis"

  treatment_options:
    - name: "Offloading"
      description: "Reducing pressure on ulcer area using special shoes, braces, or casting"
      frequency: "first-line"
    - name: "Debridement"
      description: "Removal of dead, damaged, or infected tissue"
      frequency: "routine"
    - name: "Wound Dressing"
      description: "Moist wound environment using appropriate dressing"
      frequency: "ongoing"
    - name: "Vascular Assessment & Intervention"
      description: "Angiography, angioplasty, or bypass for arterial disease"
      frequency: "as-needed"

  clinical_context:
    epidemiology: "Affects 15-20% of diabetic patients; leading cause of non-traumatic amputation"
    risk_factors:
      - "poor glycemic control"
      - "peripheral neuropathy"
      - "peripheral arterial disease"
      - "foot deformity"
      - "previous ulceration"
    nursing_considerations:
      - "Daily foot inspection is essential"
      - "Educate on proper foot hygiene and nail care"
      - "Monitor for signs of infection (warmth, erythema, purulent drainage)"
      - "Assess vascular status regularly"
      - "Implement pressure relief strategies"

  source_document: "Wound Care Terminology Glossary"
  source_page: 12

  image_references:
    - image_id: "fig_dfu_001"
      caption: "Clinical presentation of diabetic foot ulcer, Wagner Grade 3"
      description: "Deep tissue involvement with necrotic tissue visible"
      source_page: 13
```

**Approach**:

- Systematically go through PDF glossary
- Extract clinical context, complications, treatment options
- Add regional variants, severity scales
- Cross-reference assessment tools
- Maintain existing confidence scores
- Document source pages for traceability

**Effort**: ~40-60 hours (1-2 weeks with 5-10 hrs/week)

#### 3.2.2 Add New Entries (40-60 terms)

**From PDF, add**:

- Additional wound types (specific infection types, post-surgical variations)
- Additional treatment modalities (newer/specialized treatments)
- More assessment scales (PUSH score, RESVYC, etc.)
- Outcome measures (healing rate, quality of life metrics)
- Healthcare provider roles and responsibilities
- Patient education topics

**Effort**: ~30 hours (1 week)

### Phase 3: Loader Script Updates (Week 1-2)

**Goal**: Update ontology loader to handle enriched YAML

#### 3.3.1 Update `ontology_loader.ts`

**Changes**:

- Parse new YAML fields (regional_variants, severity_scale, etc.)
- Map to database columns
- Store in `metadata` or dedicated columns
- Maintain embedding generation (only on preferred_term + description)

**File to modify**: `lib/jobs/ontology_loader.ts`

```typescript
// Extract enrichment data from YAML
interface EnrichedConcept {
  // Existing
  concept_name: string;
  preferred_term: string;
  category: string;
  description: string;
  synonyms: any[];
  abbreviations: any[];
  related_terms: string[];

  // NEW
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

// Update INSERT query to include new fields
const insertQuery = `
  INSERT INTO "ClinicalOntology" (
    concept_name, preferred_term, category, description,
    synonyms, abbreviations, related_terms,
    regional_variants, severity_scale, assessment_tools,
    common_complications, treatment_options, clinical_context,
    source_document, source_page, image_references,
    embedding
  ) VALUES (...)
  ON CONFLICT ...
`;
```

**Status**: ✓ Ready to implement

#### 3.3.2 Update `load-ontology-synonyms.js`

**File**: `scripts/load-ontology-synonyms.js`

- Already loads from `data/ontology/wound-care-terminology.yaml`
- Update to load new fields
- Map to database columns

**Status**: ✓ Ready to implement

### Phase 4: Service Updates (Week 2)

**Goal**: Extend services to use enriched ontology

#### 3.4.1 Update `OntologyLookupService`

**Changes**:

- Add methods to fetch clinical context
- Add methods to fetch treatment options
- Add methods to fetch assessment tools
- Add caching for these queries

**File**: `lib/services/ontology/ontology-lookup.service.ts`

```typescript
// New methods
async getClinicalContext(term: string): Promise<ClinicalContext | null>
async getTreatmentOptions(term: string): Promise<TreatmentOption[]>
async getAssessmentTools(term: string): Promise<AssessmentTool[]>
async getSeverityScale(term: string): Promise<SeverityScale | null>
async getComplicationRisks(term: string): Promise<string[]>
```

**Status**: ✓ Ready to implement

#### 3.4.2 Update AI Prompt Context

**File**: `lib/ai/providers/base-provider.ts`

**Function**: `buildOntologyContext()`

**Changes**:

- Include clinical context in prompt
- Add treatment options for relevant concepts
- Include assessment tools where relevant
- Use severity scales in severity-related queries

```typescript
// Enhanced prompt context
const ontologyContext = `
Available ontology concepts:
${concepts
  .map(
    (c) => `
- ${c.preferred_term} (${c.category})
  Description: ${c.description}
  ${c.severity_scale ? `Severity: ${c.severity_scale.name}` : ""}
  ${c.treatment_options?.length ? `Treatments: ${c.treatment_options.map((t) => t.name).join(", ")}` : ""}
  ${c.clinical_context?.nursing_considerations ? `Nursing notes: ${c.clinical_context.nursing_considerations.join("; ")}` : ""}
`,
  )
  .join("\n")}
`;
```

**Status**: ✓ Ready to implement

### Phase 5: Testing (Week 3)

**Goal**: Comprehensive test coverage for enriched ontology

#### 3.5.1 Unit Tests

**File**: `lib/services/ontology/__tests__/ontology-lookup.service.test.ts`

**New Test Cases**:

```typescript
describe('OntologyLookupService - Enriched Fields', () => {
  // Clinical context tests
  test('getClinicalContext returns nursing considerations', () => {...})
  test('getClinicalContext handles missing clinical_context', () => {...})

  // Treatment options tests
  test('getTreatmentOptions returns all available treatments', () => {...})
  test('getTreatmentOptions respects maxResults option', () => {...})

  // Assessment tools tests
  test('getAssessmentTools returns relevant assessment tools', () => {...})

  // Severity scale tests
  test('getSeverityScale returns correct scale structure', () => {...})

  // Complication tests
  test('getComplicationRisks returns list of complications', () => {...})

  // Caching tests
  test('enriched field queries respect cache TTL', () => {...})

  // Integration tests
  test('All enriched fields are queryable for common concepts', () => {...})
})
```

**Effort**: ~20 hours (3-4 days)

#### 3.5.2 Integration Tests

**File**: `lib/services/ontology/__tests__/ontology-integration.test.ts`

```typescript
describe('Ontology Enrichment Integration', () => {
  // Verify all 30+ entries have enriched data
  test('All existing concepts have enriched metadata', () => {...})

  // Verify new entries load correctly
  test('New concepts from PDF load with enrichment', () => {...})

  // Verify filter mapping still works
  test('Filter mapping works with enriched concepts', () => {...})

  // Verify AI prompt context is enhanced
  test('AI provider receives enriched context', () => {...})

  // Verify embedding generation works
  test('Embeddings generated correctly for enriched terms', () => {...})
})
```

**Effort**: ~15 hours (2-3 days)

#### 3.5.3 API Tests

**File**: `tests/api/ontology.test.ts`

```typescript
describe('Ontology API - Enrichment', () => {
  // Search endpoint tests
  test('GET /api/ontology/search returns enriched results', () => {...})

  // Admin endpoint tests
  test('GET /api/admin/ontology/concepts returns enriched data', () => {...})
  test('POST /api/admin/ontology/concepts accepts enriched format', () => {...})

  // Export endpoint tests
  test('GET /api/admin/ontology/export includes enrichment', () => {...})
})
```

**Effort**: ~10 hours (1-2 days)

---

## Part 4: PDF Images & Clinical Diagrams

### 4.1 Current Situation

**PDF Contains**:

- ~40-60 clinical photographs/diagrams
- Shows wound types at different stages
- Assessment scales (visual references)
- Treatment procedures
- Complications

**Challenge**: Images need to be:

1. Extracted from PDF
2. Stored or referenced
3. Linked to ontology concepts
4. Made available to UI/LLM context

### 4.2 Recommended Approach

#### Option A: Extract & Store Images (Recommended for MVP)

**Strategy**:

1. Extract images from PDF using `pdfkit` or `pdf-parse`
2. Store in `public/ontology/images/` or cloud storage (S3)
3. Create image catalog JSON with mappings
4. Reference image IDs in `image_references` field

**Implementation**:

```typescript
// New script: scripts/extract-ontology-images.ts
// - Extract images from PDF
// - Generate thumbnails
// - Create image catalog
// - Map to concepts

// New migration: database/migration/051_ontology_images.sql
// - Create OntologyImage table
// - Store image metadata, URLs, descriptions

// Image reference in ontology:
image_references:
  - image_id: "dfu-001"
    caption: "Diabetic foot ulcer, Wagner Grade 3"
    url: "/ontology/images/dfu-001.jpg"
    thumbnail_url: "/ontology/images/dfu-001-thumb.jpg"
    source_page: 13
```

**Pros**:
✓ Images available for UI display  
✓ Can be embedded in AI prompt context  
✓ Licensed/controlled (with attribution)

**Cons**:
✗ Storage requirements  
✗ CDN needed for scale

**Effort**: ~15-20 hours

#### Option B: Image References Only (Low-effort)

**Strategy**:

1. Keep references in YAML
2. Don't extract images initially
3. Add to Phase 2 if needed

**Pros**:
✓ Minimal effort  
✓ Can defer

**Cons**:
✗ Images not available yet  
✗ Breaks image functionality

#### Option C: OCR + Descriptions

**Strategy**:

1. Use OCR (Tesseract) to extract text from images
2. Use Claude/Gemini to describe images
3. Store descriptions as text
4. Keep original images in PDF reference

**Pros**:
✓ Accessible text descriptions  
✓ AI can use descriptions in reasoning

**Cons**:
✗ Images not displayed  
✗ OCR quality varies

### 4.3 Recommendation

**Implement Option A + Option C**:

**Phase 1**:

- Extract images using `pdf-parse`
- Store with metadata
- Use Gemini to generate alt-text descriptions
- Create image-to-concept mappings

**Phase 2** (Next sprint):

- Build image viewer UI
- Integrate image gallery with concept pages
- Add image context to AI prompts

**Implementation Plan**:

```typescript
// lib/services/ontology/image-extractor.service.ts
interface OntologyImage {
  id: string;
  filename: string;
  concept_name: string;
  page_number: number;
  caption: string;
  description: string; // AI-generated description
  url: string;
  thumbnail_url: string;
  created_at: Date;
}

// scripts/extract-ontology-images.ts
// 1. Extract images from PDF
// 2. Generate descriptions using Claude/Gemini
// 3. Create image catalog
// 4. Store in database
```

**Database Schema**:

```sql
CREATE TABLE "OntologyImage" (
  id UUID PRIMARY KEY,
  concept_id UUID NOT NULL REFERENCES "ClinicalOntology"(id),
  filename VARCHAR(255) NOT NULL,
  page_number INTEGER,
  caption TEXT,
  description TEXT,
  url VARCHAR(512),
  thumbnail_url VARCHAR(512),
  mime_type VARCHAR(50),
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Effort**: ~25-30 hours total

---

## Part 5: Code Integration Points

### 5.1 Usage in Filter Mapping

**File**: `lib/services/context-discovery/terminology-mapper.service.ts`

**Enhancement**:

```typescript
// Use clinical context to improve mapping quality
async mapTerminology(term: string): Promise<MappedFilter> {
  // Existing Level 1-3 search
  // NEW: Leverage treatment options, complications, assessment tools

  const concept = await this.ontologyService.lookupConcept(term);
  if (concept?.treatment_options?.length > 0) {
    // Add treatment context to filter mapping
    filter.context.availableTreatments = concept.treatment_options;
  }

  return filter;
}
```

### 5.2 Usage in AI Prompts

**File**: `lib/ai/providers/base-provider.ts`

**Enhancement**:

```typescript
// Build richer ontology context
buildOntologyContext(concepts: ClinicalOntologyEntry[]): string {
  return concepts.map(c => `
    ${c.preferred_term} (${c.category})
    - ${c.description}
    ${c.severity_scale ? `- Severity levels: ${c.severity_scale.values.map(v => `"${v}"`).join(', ')}` : ''}
    ${c.treatment_options?.length ? `- Treatment options: ${c.treatment_options.map(t => t.name).join(', ')}` : ''}
    ${c.assessment_tools?.length ? `- Assessment: ${c.assessment_tools.map(t => t.name).join(', ')}` : ''}
    ${c.clinical_context?.nursing_considerations?.length ? `- Nursing: ${c.clinical_context.nursing_considerations.join('; ')}` : ''}
  `).join('\n\n');
}
```

### 5.3 Usage in Intent Classification

**File**: `lib/services/context-discovery/intent-classifier.service.ts`

**Enhancement**:

```typescript
// Use enriched ontology for better classification
async classifyIntent(query: string): Promise<IntentClassification> {
  // Existing classification
  // NEW: Consider treatment options, assessment tools, complications

  const context = await this.ontologyService.getEnrichedContext(query);

  const systemPrompt = `
    ${basePrompt}

    Available treatments: ${context.treatmentOptions?.map(t => t.name).join(', ')}
    Key assessments: ${context.assessmentTools?.map(t => t.name).join(', ')}
    Known complications: ${context.complications?.join(', ')}
  `;

  return await this.classifyWithAI(query, systemPrompt);
}
```

---

## Part 6: Database Alignment Summary

### 6.1 Schema Compatibility ✓

**Current ClinicalOntology schema already supports**:

- ✓ Synonyms with metadata (formality, confidence, region)
- ✓ Abbreviations with context keywords
- ✓ Related terms for concept connectivity
- ✓ JSONB metadata for flexible fields
- ✓ Full-text search on preferred_term
- ✓ GIN indexes for fast JSONB queries

**Enhancements align with**:

- ✓ New JSONB columns for regional_variants, severity_scale, etc.
- ✓ Image references as JSONB array
- ✓ Audit logging via existing OntologyAuditLog table
- ✓ No breaking changes to existing schema

### 6.2 Service Compatibility ✓

**Existing services can be extended**:

- ✓ `OntologyLookupService` - Add methods for new fields
- ✓ `OntologySearchService` - Include enriched fields in search results
- ✓ `OntologyConceptsService` - Handle new fields in CRUD operations

**No migration needed** for:

- ✓ API endpoints (will return new fields automatically)
- ✓ Cache system (works with new field types)
- ✓ Embedding generation (only uses preferred_term + description)

### 6.3 Data Load Compatibility ✓

**Existing loaders can be extended**:

- ✓ `ontology_loader.ts` - Parse and store new YAML fields
- ✓ `load-ontology-synonyms.js` - Already loads from wound-care-terminology.yaml
- ✓ Scripts remain backward compatible

---

## Part 7: Testing Strategy

### 7.1 Unit Tests (Phase 3, Week 3)

**Coverage Target**: 95%+

**Test Files**:

1. `lib/services/ontology/__tests__/ontology-lookup.service.test.ts` (+30 new tests)
2. `lib/services/ontology/__tests__/ontology-types.test.ts` (+15 new tests)
3. `lib/services/ontology/__tests__/image-extractor.service.test.ts` (+20 new tests)

**Key Test Scenarios**:

- Enriched field presence validation
- Cache behavior with new fields
- JSONB data structure validation
- Type safety for new interfaces
- Null/undefined handling
- Regional variant prioritization

### 7.2 Integration Tests (Phase 3, Week 3)

**Coverage Target**: 100% of main flows

**Test Files**:

1. `lib/services/ontology/__tests__/ontology-integration.test.ts` (+15 new tests)
2. `lib/services/context-discovery/__tests__/terminology-mapper.test.ts` (+10 new tests)
3. `lib/ai/__tests__/providers/base-provider.test.ts` (+10 new tests)

**Key Test Scenarios**:

- End-to-end YAML load → DB → Service flow
- Filter mapping with enriched context
- AI prompt generation with enriched data
- Image reference resolution
- Cache invalidation

### 7.3 API Tests (Phase 3, Week 3)

**Coverage Target**: 100% of API endpoints

**Test Files**:

1. `tests/api/ontology-enrichment.test.ts` (+25 new tests)

**Key Test Scenarios**:

- Search endpoint returns enriched data
- Admin endpoints handle enriched payloads
- Export endpoint includes enrichment
- Bulk operations preserve enrichment
- Image endpoints return correct URLs

### 7.4 Load Tests (Phase 4, Optional)

**Focus Areas**:

- Query performance with large JSONB fields
- Cache hit rate with enriched queries
- Embedding generation throughput

---

## Part 8: Implementation Timeline

### Week 1 (Parallel)

- **Task 1**: Database migrations (4 hours)
- **Task 2**: TypeScript types (3 hours)
- **Task 3**: Loader script updates (6 hours)

**Deliverable**: Database ready, scripts updated, types defined

### Week 2-3 (Sequential)

- **Task 1**: Expand 30 existing entries (40-50 hours)
- **Task 2**: Add 40-60 new entries (30 hours)
- **Task 3**: Service updates (15 hours)
- **Task 4**: Image extraction (20 hours)

**Deliverable**: YAML fully enriched, services updated, images extracted

### Week 3 (Parallel)

- **Task 1**: Unit tests (25 hours)
- **Task 2**: Integration tests (20 hours)
- **Task 3**: API tests (15 hours)

**Deliverable**: Full test coverage, all tests passing

### Week 4 (Optional)

- **Task 1**: Performance optimization (10-15 hours)
- **Task 2**: Documentation (10 hours)

**Deliverable**: Production-ready, fully documented

---

## Part 9: Success Criteria

### Phase 1: Schema

- [ ] Migration applies successfully
- [ ] No data loss during migration
- [ ] New columns accessible in queries
- [ ] Validation triggers work correctly

### Phase 2: YAML

- [ ] All 30 existing entries enriched
- [ ] 40-60 new entries added
- [ ] All entries valid YAML
- [ ] All entries pass validation

### Phase 3: Services

- [ ] New methods implemented and tested
- [ ] Backward compatibility maintained
- [ ] Performance acceptable (<200ms for lookups)
- [ ] Cache working correctly

### Phase 4: Testing

- [ ] 95%+ unit test coverage
- [ ] 100% integration test coverage
- [ ] All API endpoints tested
- [ ] Load tests pass

### Phase 5: Production

- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Deployment runbook created
- [ ] Rollback plan documented

---

## Part 10: Risk Mitigation

### Risk 1: Data Quality Issues

**Risk**: Enriched data may have inconsistencies or errors

**Mitigation**:

- ✓ Validation triggers in database
- ✓ TypeScript type checking
- ✓ Comprehensive tests
- ✓ Manual review process for new entries

### Risk 2: Performance Degradation

**Risk**: New JSONB fields may slow queries

**Mitigation**:

- ✓ GIN indexes on all JSONB columns
- ✓ Caching strategy (5-minute TTL)
- ✓ Load testing before production
- ✓ Query optimization if needed

### Risk 3: Breaking Changes

**Risk**: Existing code may break with schema changes

**Mitigation**:

- ✓ Backward compatible migration
- ✓ Optional new fields (all NULL-able)
- ✓ Comprehensive test suite
- ✓ Rollback plan available

### Risk 4: Image Storage Issues

**Risk**: Image extraction or storage fails

**Mitigation**:

- ✓ Phase 2 approach (optional)
- ✓ Fallback to image references
- ✓ Error handling and logging
- ✓ Can disable if needed

---

## Part 11: Rollback Plan

If issues arise:

1. **Database Rollback**:

   ```sql
   -- Drop new columns
   ALTER TABLE "ClinicalOntology"
     DROP COLUMN IF EXISTS regional_variants,
     DROP COLUMN IF EXISTS severity_scale,
     -- ... etc

   -- Drop new indexes
   DROP INDEX IF EXISTS idx_ontology_assessment_tools;
   -- ... etc
   ```

2. **Code Rollback**:
   - Revert to previous commit
   - Loader will ignore new fields (backward compatible)
   - Services will continue to work

3. **YAML Rollback**:
   - Keep previous version in git
   - Reload from backup YAML
   - Re-run loader

---

## Part 12: Approval Gate

**Checklist before proceeding**:

- [ ] Team reviews this plan
- [ ] Database schema approved
- [ ] YAML enrichment scope approved
- [ ] Testing strategy approved
- [ ] Timeline is acceptable
- [ ] Resource allocation confirmed

---

## Appendix: Recommended Tools

### A1. PDF Image Extraction

**Recommended**: `pdfkit` or `pdf-parse` + `sharp` (image processing)

```bash
npm install pdf-parse sharp
```

### A2. Image AI Description

**Use existing**: `GoogleGenerativeAI` from Gemini API

```typescript
// Reuse existing embedding service
const generativeModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

const result = await generativeModel.generateContent({
  contents: [
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64,
      },
    },
    {
      text: "Describe this wound care image in clinical detail. What does it show?",
    },
  ],
});
```

### A3. Database Backups

**Recommended Process**:

1. Backup database before migration
2. Test migration on backup first
3. Apply to production
4. Keep backup for 30 days

---

## Appendix: Communication Plan

### Stakeholders

1. **Engineering**: Code review, testing
2. **Nursing/Clinical**: YAML enrichment validation
3. **Product**: Feature prioritization
4. **DevOps**: Deployment, backups

### Timeline

- Week 1: Present plan to team
- Week 1-3: Execution with weekly sync-ups
- Week 4: Release notes and documentation

---

## Next Steps

1. **Review**: Team reviews this plan (feedback in comments)
2. **Approve**: Get sign-off on timeline and scope
3. **Start Phase 1**: Database migrations and type updates
4. **Begin YAML**: Start enrichment work in parallel
5. **Test**: Implement test coverage
6. **Deploy**: Release to production

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-04  
**Status**: Ready for Review  
**Contact**: Architecture Team
