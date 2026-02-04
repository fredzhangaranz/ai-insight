# Ontology Enrichment - Implementation Checklist

Use this checklist to track progress through all phases of the ontology enrichment project.

---

## PRE-PHASE: Planning & Approval

- [ ] **Team Review**: All three main documents reviewed by engineering team
  - [ ] `ONTOLOGY_ENRICHMENT_PLAN.md`
  - [ ] `PDF_IMAGE_STRATEGY.md`
  - [ ] `CODE_EXAMPLES_AND_TESTS.md`

- [ ] **Approval Gate**: Get sign-off on:
  - [ ] Scope (30 existing + 40-60 new terms)
  - [ ] Timeline (3-4 weeks)
  - [ ] Resource allocation (1-2 devs + clinical consultant)
  - [ ] Risk acceptance

- [ ] **Resource Planning**:
  - [ ] Developer(s) assigned
  - [ ] Clinical consultant/nurse identified for YAML enrichment
  - [ ] Time blocks scheduled
  - [ ] No conflicting priorities

- [ ] **Infrastructure Check**:
  - [ ] PostgreSQL 13+ with pgvector ready
  - [ ] Gemini API credentials available
  - [ ] Development database accessible
  - [ ] Node.js 18+ environment ready

- [ ] **Backup & Safety**:
  - [ ] Full database backup scheduled
  - [ ] Rollback procedure documented
  - [ ] Test database prepared
  - [ ] Git branch created (`feature/ontology-enrichment`)

---

## PHASE 1: Foundation (Week 1)

### Database Migration

- [ ] **Create Migration File**
  - [ ] File: `database/migration/050_ontology_enrichment_schema.sql`
  - [ ] Copy from `CODE_EXAMPLES_AND_TESTS.md` Section 1
  - [ ] Review SQL syntax
  - [ ] Test on local database
  - [ ] Verify no errors
  - [ ] Check columns created: ✓

- [ ] **Verify Migration Results**
  - [ ] Run: `npm run migrate`
  - [ ] Check table structure: `\d "ClinicalOntology"`
  - [ ] Verify new columns exist (8 columns)
  - [ ] Verify indexes created (6 new indexes)
  - [ ] Verify validation triggers work
  - [ ] Test INSERT with new columns
  - [ ] Test UPDATE with new columns

- [ ] **Backup Verification**
  - [ ] Pre-migration backup exists
  - [ ] Backup verified restorable
  - [ ] Document backup location

### TypeScript Types

- [ ] **Update Type Definitions**
  - [ ] File: `lib/services/ontology/ontology-types.ts`
  - [ ] Add interfaces:
    - [ ] `RegionalVariant`
    - [ ] `SeverityScale`
    - [ ] `SeverityValue`
    - [ ] `AssessmentTool`
    - [ ] `TreatmentOption`
    - [ ] `ClinicalContext`
    - [ ] `ImageReference`
    - [ ] `EnrichedClinicalOntologyEntry`
  - [ ] Verify exports
  - [ ] TypeScript compilation: no errors

- [ ] **Type Documentation**
  - [ ] JSDoc comments added
  - [ ] Examples provided for each type
  - [ ] Comments reference database schema

### Loader Script Updates

- [ ] **Update `ontology_loader.ts`**
  - [ ] File: `lib/jobs/ontology_loader.ts`
  - [ ] Update `FlatConcept` interface with new fields
  - [ ] Update `parseOntologyYAML` to extract new fields
  - [ ] Update INSERT query with new columns (21 fields)
  - [ ] Update ON CONFLICT clause
  - [ ] Add error handling for new fields
  - [ ] Add console logging for enrichment fields
  - [ ] Test: `npm run ontology:load` (dry run)

- [ ] **Update `load-ontology-synonyms.js`**
  - [ ] File: `scripts/load-ontology-synonyms.js`
  - [ ] Update to load new fields from YAML
  - [ ] Update INSERT query
  - [ ] Test: `npm run ontology:load-synonyms` (dry run)

- [ ] **Verify Loaders**
  - [ ] No compilation errors
  - [ ] No linting errors
  - [ ] Environment variables documented
  - [ ] Error messages helpful

### Phase 1 Testing

- [ ] **Unit Tests for Types**
  - [ ] File: Create `lib/services/ontology/__tests__/ontology-types.test.ts`
  - [ ] Test type compatibility
  - [ ] Test required vs optional fields
  - [ ] Test JSON serialization

- [ ] **Database Tests**
  - [ ] File: Create `database/__tests__/migration-050.test.ts`
  - [ ] Verify all columns exist
  - [ ] Verify all indexes exist
  - [ ] Verify constraints work
  - [ ] Verify validation triggers work

- [ ] **Run Tests**
  - [ ] Command: `npm test -- Phase1`
  - [ ] All tests passing: ✓

### Phase 1 Deliverables

- [ ] **Deliverable Checklist**
  - [ ] ✓ Database migrated (8 new columns, 6 new indexes)
  - [ ] ✓ All types defined and exported
  - [ ] ✓ Loader scripts updated
  - [ ] ✓ All tests passing
  - [ ] ✓ No TypeScript errors
  - [ ] ✓ No lint errors
  - [ ] ✓ Documentation updated

- [ ] **Phase 1 Sign-off**
  - [ ] Code review completed
  - [ ] Tests reviewed
  - [ ] Ready for Phase 2: ✓

---

## PHASE 2: Data Enrichment (Week 2-3)

### YAML Enrichment - Existing Terms

- [ ] **Prepare YAML Structure**
  - [ ] Backup current: `cp data/ontology/wound-care-terminology.yaml data/ontology/wound-care-terminology.yaml.backup`
  - [ ] Create enrichment template based on `CODE_EXAMPLES_AND_TESTS.md` Section 8
  - [ ] Set up enrichment spreadsheet/tracker

- [ ] **Enrich Each of 30 Existing Terms**

  For each term, add:
  - [ ] `regional_variants` (add US/UK/AUS variants if applicable)
  - [ ] `severity_scale` (if wound type has grading)
  - [ ] `assessment_tools` (list 2-4 relevant assessment methods)
  - [ ] `common_complications` (list 3-6 typical complications)
  - [ ] `treatment_options` (list 3-5 treatment approaches with frequency)
  - [ ] `clinical_context.epidemiology` (prevalence, incidence)
  - [ ] `clinical_context.risk_factors` (list 5-8 risk factors)
  - [ ] `clinical_context.nursing_considerations` (list 5-10 key nursing points)
  - [ ] `source_document` (always "Wound Care Terminology Glossary")
  - [ ] `source_page` (reference PDF page number)

  **Progress Tracker**:
  - [ ] Term 1-5 enriched (diabetic foot ulcer, pressure injury, venous leg ulcer, arterial ulcer, surgical wound)
  - [ ] Term 6-10 enriched (traumatic wound, burn, skin tear, laceration, abrasion)
  - [ ] Term 11-15 enriched (NPWT, compression therapy, debridement, wound dressing, hyperbaric oxygen)
  - [ ] Term 16-20 enriched (skin graft, wound irrigation, topical agents, biological dressings, growth factors)
  - [ ] Term 21-25 enriched (wound measurement, tissue type, exudate assessment, wound bed score, pain assessment)
  - [ ] Term 26-30 enriched (HbA1c, ABI, TcPO2, WBC, CRP)

- [ ] **YAML Validation**
  - [ ] Run: `npm run validate:yaml` (if script exists, or manual check)
  - [ ] All YAML syntax valid
  - [ ] No missing required fields
  - [ ] All field types correct
  - [ ] No duplicate entries

### YAML Enrichment - New Terms

- [ ] **Identify 40-60 New Terms from PDF**
  - [ ] Review PDF glossary
  - [ ] Extract additional wound types
  - [ ] Extract additional treatments
  - [ ] Extract assessment scales (PUSH score, RESVYC, etc.)
  - [ ] Extract outcome metrics
  - [ ] Extract provider roles/responsibilities
  - [ ] Create list with source page references

- [ ] **Add New Terms to YAML**

  For each new term, add:
  - [ ] `preferred_term` (canonical form)
  - [ ] `category` (wound_type, treatment, assessment, outcome, role, etc.)
  - [ ] `description` (clinical definition)
  - [ ] `synonyms` (2-3 variants with confidence)
  - [ ] `abbreviations` (if applicable)
  - [ ] `related_terms` (2-3 related concepts)
  - [ ] `regional_variants` (if applicable)
  - [ ] Full enrichment fields (severity_scale, assessment_tools, etc.)
  - [ ] `source_document` and `source_page`

  **Target Count**:
  - [ ] 10 new wound types added
  - [ ] 10 new treatments added
  - [ ] 5 new assessment scales added
  - [ ] 5 new outcome metrics added
  - [ ] Remaining 10-15 from clinical context

- [ ] **YAML Final Validation**
  - [ ] Total entries: 70-90 ✓
  - [ ] All entries have required fields ✓
  - [ ] No duplicates ✓
  - [ ] No syntax errors ✓

### Image Extraction & Description (Phase 1 Approach)

- [ ] **Extract Images from PDF**
  - [ ] Create script: `scripts/extract-ontology-images.ts`
  - [ ] Use `pdf-parse` to extract images
  - [ ] Store in temporary directory
  - [ ] Log extraction progress
  - [ ] Handle errors gracefully

- [ ] **Generate AI Descriptions**
  - [ ] For each image:
    - [ ] Generate clinical description using Gemini 2.0
    - [ ] Extract assessment findings
    - [ ] Identify severity indicators
    - [ ] Create image metadata record

- [ ] **Create Image Catalog**
  - [ ] File: `data/ontology/image-descriptions.json`
  - [ ] Map image_id to:
    - [ ] Extracted description
    - [ ] Assessment findings
    - [ ] Severity indicators
    - [ ] Source page
    - [ ] Concept mappings

- [ ] **Integrate with YAML**
  - [ ] Add `image_references` to relevant YAML entries
  - [ ] Link images to concepts
  - [ ] Verify all images mapped
  - [ ] Verify descriptions are accurate

- [ ] **Cost Check**
  - [ ] Estimate: ~50 images × $0.002 = ~$0.10
  - [ ] Verify Gemini API cost within budget
  - [ ] Run test extraction on 5 images first

### Phase 2 Testing

- [ ] **YAML Parsing Tests**
  - [ ] Create: `tests/yaml/ontology-yaml.test.ts`
  - [ ] Test YAML loads correctly
  - [ ] Test all fields present
  - [ ] Test field types
  - [ ] Test enrichment structure

- [ ] **Database Load Tests**
  - [ ] Test: `npm run ontology:load` (actual run)
  - [ ] All 70-90 terms load successfully
  - [ ] All enrichment fields stored
  - [ ] No truncation or data loss
  - [ ] Query all new fields: `SELECT * FROM "ClinicalOntology" WHERE severity_scale IS NOT NULL`

- [ ] **Integration Verification**
  - [ ] Query enrichment fields via service
  - [ ] Services return expected data types
  - [ ] No null pointer exceptions
  - [ ] Performance acceptable (<200ms per query)

### Phase 2 Deliverables

- [ ] **Deliverable Checklist**
  - [ ] ✓ All 30 existing terms enriched
  - [ ] ✓ 40-60 new terms added
  - [ ] ✓ YAML valid and loads successfully
  - [ ] ✓ Database has 70-90 terms with enrichment
  - [ ] ✓ Images extracted and described
  - [ ] ✓ Image mappings created
  - [ ] ✓ All tests passing

- [ ] **Phase 2 Sign-off**
  - [ ] Clinical review completed (if needed)
  - [ ] YAML reviewed for accuracy
  - [ ] Database integrity verified
  - [ ] Ready for Phase 3: ✓

---

## PHASE 3: Service & Testing (Week 3-4)

### Service Enhancements

- [ ] **Update `OntologyLookupService`**
  - [ ] Add: `getClinicalContext(term: string): Promise<ClinicalContext | null>`
  - [ ] Add: `getTreatmentOptions(term: string, options?: {frequency, maxResults})`
  - [ ] Add: `getAssessmentTools(term: string, options?: {maxResults})`
  - [ ] Add: `getSeverityScale(term: string): Promise<SeverityScale | null>`
  - [ ] Add: `getComplicationRisks(term: string, options?: {maxResults})`
  - [ ] Add: `getImageReferences(term: string, options?: {maxResults})`
  - [ ] Add caching for new methods
  - [ ] Test each method

- [ ] **Update `OntologyConceptsService`**
  - [ ] Verify CRUD operations handle new fields
  - [ ] Test GET returns enriched data
  - [ ] Test UPDATE preserves enrichment
  - [ ] Test bulk operations

- [ ] **Update AI Prompt Context**
  - [ ] File: `lib/ai/providers/base-provider.ts`
  - [ ] Update `buildOntologyContext()` to include:
    - [ ] Clinical context (epidemiology, nursing notes)
    - [ ] Treatment options
    - [ ] Assessment tools
    - [ ] Severity scales
  - [ ] Test prompt generation
  - [ ] Verify token usage reasonable

- [ ] **Update Filter Mapping**
  - [ ] File: `lib/services/context-discovery/terminology-mapper.service.ts`
  - [ ] Include treatment context in mapping
  - [ ] Include assessment tools in mapping
  - [ ] Verify mapping quality improved

- [ ] **Update Intent Classification**
  - [ ] File: `lib/services/context-discovery/intent-classifier.service.ts`
  - [ ] Use enriched context in classification
  - [ ] Test classification accuracy

### Unit Tests

- [ ] **Create Test File**
  - [ ] File: `lib/services/ontology/__tests__/ontology-enrichment.test.ts`
  - [ ] Copy template from `CODE_EXAMPLES_AND_TESTS.md` Section 4

- [ ] **Implement Test Cases**

  **getClinicalContext Tests** (4 tests):
  - [ ] Returns context for known concept
  - [ ] Returns null for unknown concept
  - [ ] Handles empty/whitespace input
  - [ ] Case insensitive search

  **getTreatmentOptions Tests** (5 tests):
  - [ ] Returns treatments for known concept
  - [ ] Filters by frequency
  - [ ] Respects maxResults limit
  - [ ] Returns empty for unknown concept
  - [ ] Maintains order

  **getAssessmentTools Tests** (4 tests):
  - [ ] Returns tools for known concept
  - [ ] Respects maxResults limit
  - [ ] Returns empty for unknown concept
  - [ ] Correct data structure

  **getSeverityScale Tests** (3 tests):
  - [ ] Returns scale for applicable concept
  - [ ] Returns null for non-applicable concept
  - [ ] Correct scale structure

  **getComplicationRisks Tests** (4 tests):
  - [ ] Returns complications for known concept
  - [ ] Respects maxResults limit
  - [ ] Returns empty for unknown concept
  - [ ] No duplicates

  **getImageReferences Tests** (4 tests):
  - [ ] Returns images for known concept
  - [ ] Respects maxResults limit
  - [ ] Returns empty for unknown concept
  - [ ] Image structure correct

  **Total**: 24+ unit tests

- [ ] **Run Unit Tests**
  - [ ] Command: `npm test -- ontology-enrichment.test.ts`
  - [ ] All tests passing ✓
  - [ ] Coverage >95%

### Integration Tests

- [ ] **Create Integration Test File**
  - [ ] File: `lib/services/ontology/__tests__/ontology-enrichment-integration.test.ts`
  - [ ] Copy template from `CODE_EXAMPLES_AND_TESTS.md` Section 5

- [ ] **Implement Integration Tests**

  **Complete Data Flow Tests** (3 tests):
  - [ ] Load concept with all enrichment fields
  - [ ] Get enriched context in single call
  - [ ] Consistency across services

  **Filter Mapping Integration** (2 tests):
  - [ ] Treatment context for mapping
  - [ ] Assessment tools for generation

  **Cache Performance** (2 tests):
  - [ ] Query caching works
  - [ ] Cache invalidation works

  **Full Ontology Coverage** (2 tests):
  - [ ] All concepts have enrichment
  - [ ] Treatments available for concepts

  **Total**: 9+ integration tests

- [ ] **Run Integration Tests**
  - [ ] Command: `npm test -- ontology-enrichment-integration.test.ts`
  - [ ] All tests passing ✓
  - [ ] Coverage >90%

### API Tests

- [ ] **Create API Test File**
  - [ ] File: `tests/api/ontology-enrichment.test.ts`
  - [ ] ~25 test cases

- [ ] **Implement API Tests**

  **Search Endpoint** (5 tests):
  - [ ] Returns enriched data in response
  - [ ] All enrichment fields included
  - [ ] Correct data types
  - [ ] Pagination works
  - [ ] Filtering works

  **Admin Endpoint** (5 tests):
  - [ ] GET returns enriched data
  - [ ] POST accepts enriched format
  - [ ] PUT updates enrichment
  - [ ] DELETE works correctly
  - [ ] Validation works

  **Export Endpoint** (3 tests):
  - [ ] Exports include enrichment
  - [ ] Export format valid
  - [ ] All concepts included

  **Bulk Operations** (3 tests):
  - [ ] Bulk create preserves enrichment
  - [ ] Bulk update works
  - [ ] Bulk delete works

  **Performance** (3 tests):
  - [ ] Response time <500ms
  - [ ] Large queries handled
  - [ ] No memory leaks

  **Total**: 19+ API tests

- [ ] **Run API Tests**
  - [ ] Command: `npm test -- tests/api/ontology-enrichment.test.ts`
  - [ ] All tests passing ✓

### Backward Compatibility Tests

- [ ] **Verify No Breaking Changes**
  - [ ] Existing queries still work
  - [ ] Existing services unchanged
  - [ ] Existing API responses still compatible
  - [ ] Old code still works with new schema
  - [ ] Rollback possible

- [ ] **Test Backward Compatibility**
  - [ ] Run all existing ontology tests
  - [ ] Command: `npm test -- ontology`
  - [ ] All existing tests passing ✓

### Coverage & Quality

- [ ] **Code Coverage**
  - [ ] Run: `npm test -- --coverage lib/services/ontology`
  - [ ] Overall coverage: >95% ✓
  - [ ] No untested code paths

- [ ] **Linting & Formatting**
  - [ ] Run: `npm run lint lib/services/ontology`
  - [ ] Run: `npm run format lib/services/ontology`
  - [ ] No errors or warnings
  - [ ] All formatting consistent

- [ ] **TypeScript Compilation**
  - [ ] Run: `npm run build`
  - [ ] No compilation errors
  - [ ] No type warnings
  - [ ] Strict mode: ✓

### Phase 3 Testing Deliverables

- [ ] **Deliverable Checklist**
  - [ ] ✓ 24+ unit tests (ontology enrichment)
  - [ ] ✓ 9+ integration tests
  - [ ] ✓ 19+ API tests
  - [ ] ✓ 8+ backward compatibility tests
  - [ ] ✓ >95% code coverage
  - [ ] ✓ No linting errors
  - [ ] ✓ No TypeScript errors
  - [ ] ✓ All tests passing

- [ ] **Phase 3 Sign-off**
  - [ ] Code review completed
  - [ ] Tests reviewed
  - [ ] Performance validated
  - [ ] Ready for deployment: ✓

---

## PHASE 4: Documentation & Deployment (Week 4)

### Documentation

- [ ] **Code Documentation**
  - [ ] Update `README.md` with ontology enrichment
  - [ ] Update API documentation
  - [ ] Add JSDoc comments to all new methods
  - [ ] Create migration guide for devs

- [ ] **Deployment Documentation**
  - [ ] Create: `DEPLOYMENT_ONTOLOGY_ENRICHMENT.md`
  - [ ] Include:
    - [ ] Pre-deployment checks
    - [ ] Migration steps
    - [ ] Rollback procedure
    - [ ] Verification steps
    - [ ] Troubleshooting

- [ ] **User Documentation**
  - [ ] Update `docs/design/semantic_layer/SETUP_ONTOLOGY_LOADER.md`
  - [ ] Add enrichment examples
  - [ ] Document new service methods
  - [ ] Provide usage examples

- [ ] **Architecture Documentation**
  - [ ] Update architecture diagrams
  - [ ] Document data model changes
  - [ ] Create sequence diagrams
  - [ ] Document caching strategy

### Staging Deployment

- [ ] **Pre-Deployment Checklist**
  - [ ] All tests passing locally ✓
  - [ ] Code reviewed and approved ✓
  - [ ] Staging database backup created ✓
  - [ ] Deployment runbook ready ✓
  - [ ] Team notified ✓

- [ ] **Deploy to Staging**
  - [ ] Run migrations
  - [ ] Load enriched ontology
  - [ ] Run smoke tests
  - [ ] Verify all endpoints work
  - [ ] Performance acceptable
  - [ ] No errors in logs

- [ ] **Staging Validation**
  - [ ] Test all main flows
  - [ ] Verify enrichment data accessible
  - [ ] Test AI prompt generation
  - [ ] Test filter mapping
  - [ ] Check performance

- [ ] **Staging Sign-off**
  - [ ] All validations passed
  - [ ] Ready for production: ✓

### Production Deployment

- [ ] **Production Deployment**
  - [ ] Schedule maintenance window (optional)
  - [ ] Database backup created ✓
  - [ ] Migration applied
  - [ ] Load enriched ontology
  - [ ] Verify migration successful
  - [ ] Run smoke tests

- [ ] **Post-Deployment**
  - [ ] Monitor logs for errors
  - [ ] Check database performance
  - [ ] Verify API endpoints working
  - [ ] Confirm enrichment accessible
  - [ ] Check user queries working

- [ ] **Deployment Sign-off**
  - [ ] All systems operational
  - [ ] No errors or issues
  - [ ] Rollback not needed
  - [ ] Deployment complete: ✓

### Release Notes

- [ ] **Create Release Notes**
  - [ ] Summary of changes
  - [ ] New features
  - [ ] Breaking changes (none)
  - [ ] Bug fixes
  - [ ] Performance improvements
  - [ ] Migration instructions
  - [ ] Known issues (if any)

- [ ] **Notify Stakeholders**
  - [ ] Engineering team
  - [ ] Product team
  - [ ] Clinical team
  - [ ] Support team

---

## POST-PHASE: Monitoring & Optimization

### Monitoring (Week 5+)

- [ ] **Database Monitoring**
  - [ ] Query performance tracking
  - [ ] Index efficiency
  - [ ] Disk space usage
  - [ ] Connection pool stats

- [ ] **Application Monitoring**
  - [ ] API response times
  - [ ] Cache hit rates
  - [ ] Error rates
  - [ ] User feedback

- [ ] **Issues Tracking**
  - [ ] Any reported bugs
  - [ ] Performance issues
  - [ ] Data quality issues
  - [ ] User requests

### Optimization (Optional)

- [ ] **Query Optimization**
  - [ ] Review slow queries
  - [ ] Add indexes if needed
  - [ ] Optimize cache strategy
  - [ ] Consider query batching

- [ ] **Phase 2 Planning**
  - [ ] Image storage setup
  - [ ] Image gallery UI
  - [ ] CDN integration
  - [ ] Timeline for Phase 2

---

## Final Sign-Off

- [ ] **Project Complete**
  - [ ] ✓ All phases completed
  - [ ] ✓ All tests passing
  - [ ] ✓ Documentation complete
  - [ ] ✓ Deployed to production
  - [ ] ✓ Monitoring active
  - [ ] ✓ Team trained

- [ ] **Lessons Learned**
  - [ ] Document what went well
  - [ ] Document challenges faced
  - [ ] Document improvements for next project

---

**Checklist Version**: 1.0  
**Last Updated**: 2026-02-04  
**Status**: Ready to Use  
**Print & Track**: Use this for weekly progress meetings
