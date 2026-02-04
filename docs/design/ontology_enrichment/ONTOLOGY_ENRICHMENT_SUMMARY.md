# Ontology Enrichment Plan - Executive Summary

**Status**: Ready for Implementation  
**Created**: 2026-02-04  
**Effort**: 3-4 weeks (estimated)  
**Team Size**: 1-2 developers

---

## Quick Overview

Your ontology is getting a major upgrade. We're taking your solid 30-term YAML foundation and enriching it with clinical depth from the nurse's PDF glossary. The result: a powerful semantic engine that understands wound care terminology at a professional level.

---

## What We're Doing (TL;DR)

### Current State

- ✓ 30 core wound care terms in YAML
- ✓ Solid database schema with synonyms, abbreviations, embeddings
- ✓ Working services for synonym lookup and AI integration
- ✗ Limited clinical context
- ✗ Missing treatment/assessment tool mapping
- ✗ No severity scales
- ✗ Image data not integrated

### Future State (Post-Enrichment)

- ✓ 70-90 total terms (30 enriched + 40-60 new)
- ✓ Rich clinical context (epidemiology, risk factors, nursing notes)
- ✓ Treatment options mapped per concept
- ✓ Assessment tools and severity scales
- ✓ AI-generated descriptions of clinical images
- ✓ Regional variant support (US, UK, AUS, etc.)
- ✓ Full test coverage (unit + integration + API)
- ✓ Zero breaking changes to existing code

### Why This Matters

1. **Better AI Responses**: Claude/Gemini gets richer context = better answers
2. **Smarter Filter Mapping**: Can suggest treatments/assessments during queries
3. **Educational Value**: System becomes a learning tool for wound care professionals
4. **Production Ready**: Fully tested, documented, backward compatible

---

## The Plan at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation (Week 1)                                │
├─────────────────────────────────────────────────────────────┤
│ • Database migration (new columns, indexes, validation)      │
│ • TypeScript types (RegionalVariant, SeverityScale, etc.)   │
│ • Loader script updates                                      │
│ Status: DATABASE READY                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Data Enrichment (Week 2-3)                          │
├─────────────────────────────────────────────────────────────┤
│ • Expand 30 existing terms (20-30 hrs)                       │
│ • Add 40-60 new terms from PDF (20-30 hrs)                   │
│ • Extract & describe images (15-20 hrs)                      │
│ Status: YAML & IMAGES READY                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Service & Testing (Week 3-4)                       │
├─────────────────────────────────────────────────────────────┤
│ • Add service methods (getClinicalContext, getTreatments)   │
│ • Update AI prompt builders                                  │
│ • Add 60+ new tests                                          │
│ Status: PRODUCTION READY                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Changes

**Summary**: Adding 8 new JSONB columns (all optional/backward compatible)

```sql
ALTER TABLE "ClinicalOntology" ADD COLUMN IF NOT EXISTS:
  - regional_variants JSONB      (US, UK, AU variants)
  - severity_scale JSONB         (Wagner grades, etc.)
  - assessment_tools JSONB       (Monofilament, ABI, etc.)
  - common_complications JSONB   (infection, amputation, etc.)
  - treatment_options JSONB      (offloading, debridement, etc.)
  - clinical_context JSONB       (epidemiology, risk factors, nursing notes)
  - source_document VARCHAR      (PDF page reference)
  - source_page INTEGER          (PDF page reference)
  - image_references JSONB       (extracted images with descriptions)
```

**Migrations**: 1 new migration file (`050_ontology_enrichment_schema.sql`)  
**Breaking Changes**: None (all columns optional, existing queries unaffected)  
**Rollback**: Simple (DROP columns if needed)

---

## YAML Enrichment

**Current**: 30 terms, ~200 lines YAML  
**Future**: 70-90 terms, ~2000-3000 lines YAML

**Example Enrichment for "Diabetic Foot Ulcer"**:

From:

```yaml
- preferred_term: "diabetic foot ulcer"
  category: "wound_type"
  description: "Ulceration of foot in diabetic patients"
  synonyms: [...]
  abbreviations: [...]
```

To:

```yaml
- preferred_term: "diabetic foot ulcer"
  category: "wound_type"
  description: "Ulceration of foot in diabetic patients"

  # ENRICHED FIELDS
  severity_scale:
    name: "Wagner Grade"
    values: ["Grade 0: Normal", "Grade 1: Superficial", ...]

  assessment_tools:
    - name: "Monofilament Testing"
      purpose: "Evaluate neuropathy"
    - name: "Ankle-Brachial Index"
      purpose: "Assess circulation"

  treatment_options:
    - name: "Offloading"
      description: "Reduce pressure using special shoes"
      frequency: "first-line"
    - name: "Debridement"
      description: "Remove dead tissue"

  common_complications:
    - "infection"
    - "osteomyelitis"
    - "amputation"

  clinical_context:
    epidemiology: "Affects 15-20% of diabetic patients"
    risk_factors: ["poor glycemic control", "neuropathy"]
    nursing_considerations:
      - "Daily foot inspection essential"
      - "Monitor for infection signs"

  image_references:
    - image_id: "dfu-001"
      caption: "Clinical presentation, Wagner Grade 3"
      clinical_description: "Deep tissue involvement with necrotic tissue..."
```

---

## Code Changes

### New Service Methods

```typescript
// OntologyLookupService additions
service.getClinicalContext(term: string)
service.getTreatmentOptions(term: string, filters?: {frequency, maxResults})
service.getAssessmentTools(term: string, options?: {maxResults})
service.getSeverityScale(term: string)
service.getComplicationRisks(term: string, options?: {maxResults})
service.getImageReferences(term: string, options?: {maxResults})
```

### Enhanced AI Prompts

```typescript
// Before: Just term name
"Available concepts: diabetic foot ulcer, pressure injury, ..."

// After: Rich context
"Available concepts:
- diabetic foot ulcer (wound_type)
  Severity: Wagner Grade 0-5
  Treatments: Offloading, Debridement, Wound Dressing, ...
  Assessment: Monofilament Testing, ABI, VPT, ...
  Nursing: Daily foot inspection, Monitor for infection, ..."
```

### API Enhancements

```typescript
// GET /api/ontology/search?q=diabetic+ulcer
// Response now includes:
{
  results: [{
    preferred_term: "diabetic foot ulcer",
    category: "wound_type",
    description: "...",

    // NEW: Enriched fields
    severity_scale: {...},
    assessment_tools: [{...}, {...}],
    treatment_options: [{...}, {...}],
    common_complications: ["infection", "amputation"],
    clinical_context: {...},
    image_references: [{...}]
  }]
}
```

---

## Testing Coverage

**Current**: ~40 tests  
**Target**: ~100+ tests

### New Test Areas

| Category          | Tests | Purpose                      |
| ----------------- | ----- | ---------------------------- |
| Clinical Context  | 8     | Validate context retrieval   |
| Treatment Options | 10    | Verify treatment mapping     |
| Assessment Tools  | 8     | Test assessment availability |
| Severity Scales   | 6     | Validate grading systems     |
| Complications     | 6     | Confirm complication lists   |
| Image References  | 8     | Test image data integrity    |
| Integration       | 15    | End-to-end flows             |
| Cache Performance | 5     | Verify caching works         |
| API Responses     | 15    | Test API enhancements        |
| Backward Compat   | 8     | Ensure no breaking changes   |

---

## Image Handling Strategy

### Phase 1 (MVP - Included in Plan)

- Extract images from PDF (free, using pdf-parse)
- Generate AI descriptions using Gemini (cost: ~$0.10/image)
- Store descriptions in database (negligible storage)
- No image files stored yet

**Benefit**: Immediate searchable clinical descriptions in AI prompts  
**Cost**: ~$1  
**Storage**: Minimal (text only)

### Phase 2 (Optional - Next Sprint)

- Store full resolution images (JPG)
- Create thumbnails for UI
- Build image gallery component
- Integrate into concept pages

**Benefit**: Visual learning materials  
**Cost**: ~$1-2/month for CDN storage  
**Effort**: 10-15 hours

---

## Risk Mitigation

| Risk                    | Impact | Mitigation                                               |
| ----------------------- | ------ | -------------------------------------------------------- |
| Data quality issues     | Medium | Validation triggers, type checking, tests                |
| Performance degradation | Medium | GIN indexes, caching (5-min TTL), testing                |
| Breaking changes        | High   | All columns optional, backward compatible, rollback plan |
| Image extraction fails  | Low    | Phase 2 approach (optional)                              |

---

## Timeline & Effort

### Week 1: Foundation (13 hours)

- Database migration: 4h
- TypeScript types: 3h
- Loader updates: 6h
- **Deliverable**: Database ready, types defined, scripts updated

### Week 2-3: Enrichment (70 hours)

- Expand 30 terms: 25h
- Add 40-60 new terms: 30h
- Extract & describe images: 15h
- **Deliverable**: YAML fully enriched, images extracted

### Week 3-4: Testing & Integration (50 hours)

- Unit tests: 20h
- Integration tests: 15h
- API tests: 10h
- Service enhancements: 5h
- **Deliverable**: Full test coverage, production ready

**Total Effort**: 133 hours (~3-4 weeks at 35 hrs/week)

---

## Resource Requirements

### Skills Needed

- ✓ TypeScript/Node.js (database, services)
- ✓ PostgreSQL/JSONB queries
- ✓ Clinical terminology understanding (for YAML enrichment)
- ✓ Jest/testing frameworks
- ✓ AI API integration (Gemini for image descriptions)

### Team Composition

**Option A (Recommended)**: 1 dev + 1 clinical/nurse consultant

- Dev handles code/database
- Consultant validates clinical accuracy, helps with YAML enrichment

**Option B**: 2 devs with parallel work

- Dev 1: Database, loader, services, tests
- Dev 2: YAML enrichment, image extraction

### Infrastructure

- ✓ Existing PostgreSQL database (already has pgvector)
- ✓ Existing Gemini API (already integrated)
- ✓ Existing development environment
- No new infrastructure needed

---

## Success Criteria

### Phase 1 ✓

- [ ] Migration applies cleanly
- [ ] No data loss
- [ ] All indexes created
- [ ] Validation triggers work

### Phase 2 ✓

- [ ] All 30 terms expanded
- [ ] 40-60 new terms added
- [ ] All entries valid YAML
- [ ] Images extracted with descriptions

### Phase 3 ✓

- [ ] New service methods implemented
- [ ] 95%+ unit test coverage
- [ ] 100% integration test coverage
- [ ] All API tests passing
- [ ] No breaking changes
- [ ] Documentation updated

---

## Deployment Checklist

- [ ] Code review complete (all 3 code example documents provided)
- [ ] Database migration tested locally
- [ ] All tests passing (unit, integration, API)
- [ ] YAML validation complete
- [ ] Image descriptions reviewed for accuracy
- [ ] Performance tested (query times acceptable)
- [ ] Rollback procedure documented
- [ ] Deployment runbook created
- [ ] Stakeholders notified
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Smoke tests passed
- [ ] Deployed to production

---

## Key Documents

1. **`ONTOLOGY_ENRICHMENT_PLAN.md`** (Main Plan)
   - Comprehensive 400+ line implementation plan
   - Detailed phases, timelines, risk mitigation

2. **`PDF_IMAGE_STRATEGY.md`** (Image Handling)
   - Detailed image extraction strategies
   - Phase 1 (AI descriptions) vs Phase 2 (full images)
   - Cost and effort analysis

3. **`CODE_EXAMPLES_AND_TESTS.md`** (Implementation)
   - Database migration SQL
   - TypeScript types
   - Service methods
   - Unit and integration test templates
   - YAML example with full enrichment

---

## Next Steps

### Immediate (This Week)

1. **Review** these three documents with team
2. **Approve** timeline and scope
3. **Resource** team allocation
4. **Schedule** kickoff meeting

### Week 1 (Starting)

1. Create database migration
2. Define TypeScript types
3. Update loader scripts
4. Set up test infrastructure

### Week 2-3 (Parallel)

1. Start YAML enrichment
2. Extract and describe images
3. Implement service methods
4. Build test suite

### Week 4 (Final)

1. Complete testing
2. Documentation review
3. Staging deployment
4. Production release

---

## Questions to Discuss

1. **Team**: Who will do YAML enrichment? (Clinical person needed)
2. **Timeline**: Can we dedicate 3-4 weeks to this?
3. **Scope**: Should we also handle Phase 2 (full images) now or defer?
4. **Storage**: Where should enriched data live? (Database is good for Phase 1)
5. **Validation**: Want formal clinical review of enriched data?

---

## Support

All detailed information is in three comprehensive documents:

1. **`ONTOLOGY_ENRICHMENT_PLAN.md`** - Full implementation plan with phases and architecture
2. **`PDF_IMAGE_STRATEGY.md`** - Image handling with cost/benefit analysis
3. **`CODE_EXAMPLES_AND_TESTS.md`** - Ready-to-use code templates

Each document is self-contained and covers different aspects. You can implement them incrementally.

---

## Contact

Questions? Need clarification? Refer to the detailed documents or ask for guidance on specific phases.

---

**Version**: 1.0  
**Date**: 2026-02-04  
**Status**: ✓ Ready for Implementation  
**Confidence**: High (proven patterns, low risk)
