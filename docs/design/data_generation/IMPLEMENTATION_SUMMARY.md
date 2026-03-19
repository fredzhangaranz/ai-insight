# Synthetic Data Generation Implementation - Summary

## Implementation Status: ✅ Complete

All 6 stages have been successfully implemented according to the plan.

## What Was Built

### Stage 1: Types + Schema Discovery Service ✅
- **Files Created:**
  - `lib/services/data-gen/generation-spec.types.ts` - Complete TypeScript type definitions
  - `lib/services/data-gen/schema-discovery.service.ts` - Schema introspection functions
  - `app/api/admin/data-gen/schema/patients/route.ts` - Patient schema API
  - `app/api/admin/data-gen/schema/forms/route.ts` - Form list API
  - `app/api/admin/data-gen/schema/forms/[id]/route.ts` - Form field details API
  - `app/api/admin/data-gen/stats/route.ts` - Data generation statistics API
  - `lib/services/data-gen/__tests__/schema-discovery.service.test.ts` - Unit tests (9 tests, all passing)

### Stage 2: Patient Generator ✅
- **Dependencies Installed:**
  - `@faker-js/faker` - Realistic fake data generation
  
- **Files Created:**
  - `lib/services/data-gen/generators/base.generator.ts` - Shared utilities (GUIDs, weighted selection, batch INSERT)
  - `lib/services/data-gen/generators/patient.generator.ts` - Patient data generator with verification
  - `lib/services/data-gen/spec-validator.service.ts` - FK dependency validation
  - `lib/services/data-gen/preview.service.ts` - Preview without DB writes
  - `app/api/admin/data-gen/preview/route.ts` - Preview API endpoint
  - `app/api/admin/data-gen/execute/route.ts` - Execute generation API
  - `lib/services/data-gen/__tests__/spec-validator.service.test.ts` - Unit tests (10 tests, all passing)
  - `lib/services/data-gen/generators/__tests__/patient.generator.test.ts` - Unit tests (7 tests, all passing)

### Stage 3: Assessment Generator ✅
- **Files Created:**
  - `lib/services/data-gen/generators/assessment.generator.ts` - Complete Wound→Series→Note+Measurement chain
  - Progression profiles: healing, stable, deteriorating
  - Form-aware field value generation
  - `lib/services/data-gen/generators/__tests__/assessment.generator.test.ts` - Unit tests (13 tests, all passing)

### Stage 4: Admin UI ✅
- **Files Created:**
  - `app/admin/data-gen/page.tsx` - 4-step generation wizard (simplified version)
  - Entity selection (patients vs assessments)
  - Configuration step
  - Preview & confirm step
  - Execution & verification step
  
- **Files Modified:**
  - `app/admin/page.tsx` - Added "Data Generation" link to Quick Actions

### Stage 5: Data Viewer ✅
- **Files Created:**
  - `app/api/data-viewer/coverage/route.ts` - Coverage statistics API with table allowlist
  - `app/components/show-data-panel.tsx` - Collapsible "Show Data" component with SQL, results table, and coverage warnings
  - `app/api/data-viewer/__tests__/coverage.test.ts` - Unit tests (passing)

### Stage 6: Cleanup Utility ✅
- **Files Created:**
  - `app/api/admin/data-gen/cleanup/route.ts` - Soft-delete all IG-prefixed data in dependency order
  
- **Files Modified:**
  - `app/admin/data-gen/page.tsx` - Added "Cleanup Generated Data" button

## Test Coverage Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| schema-discovery.service.test.ts | 9 | ✅ All passing |
| spec-validator.service.test.ts | 10 | ✅ All passing |
| patient.generator.test.ts | 7 | ✅ All passing |
| assessment.generator.test.ts | 13 | ✅ All passing |
| **Total** | **39** | **✅ 100% passing** |

## Key Features Implemented

### Data Generation
- ✅ Patient generation with Faker.js (realistic names, DOB, demographics)
- ✅ Gender distribution control (e.g., 50% Male, 50% Female)
- ✅ Age range control via date ranges
- ✅ FK dependency validation (checks units exist before generating)
- ✅ Batch INSERT for performance (100 rows per batch)
- ✅ Tagged with `IG` accessCode prefix for cleanup
- ✅ Assessment generation (Wound→Series→Note+Measurement chains)
- ✅ Form-aware field value generation (respects field types and options)
- ✅ Progression profiles (healing, stable, deteriorating wounds)

### Validation & Verification
- ✅ Pre-generation spec validation
- ✅ Post-generation verification checks (count, distribution, FK constraints)
- ✅ Dependency checking (units must exist for patients, patients must exist for assessments)

### Admin UI
- ✅ 4-step wizard workflow
- ✅ Entity selection (patients vs assessments)
- ✅ Configuration (simplified version with pre-configured fields)
- ✅ Preview & confirmation
- ✅ Execution with progress and verification results
- ✅ Cleanup button with confirmation dialog

### Data Viewer (for standard users)
- ✅ "Show Data" toggle on AI results
- ✅ SQL query display
- ✅ Raw result table
- ✅ Coverage warnings (red <50%, yellow 50-90%, none >90%)
- ✅ Table allowlist security (only `rpt.*` and `dbo.*` tables)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/data-gen/schema/patients` | GET | Get patient field schema + coverage |
| `/api/admin/data-gen/schema/forms` | GET | List published assessment forms |
| `/api/admin/data-gen/schema/forms/:id` | GET | Get form field definitions |
| `/api/admin/data-gen/stats` | GET | Data generation statistics |
| `/api/admin/data-gen/preview` | POST | Generate preview (no DB writes) |
| `/api/admin/data-gen/execute` | POST | Execute generation |
| `/api/admin/data-gen/cleanup` | DELETE | Soft-delete all generated data |
| `/api/data-viewer/coverage` | GET | Get column coverage stats |

## Database Tables Modified

### Writes to `dbo` schema (Silhouette source):
- `dbo.Patient` - Generated patient records
- `dbo.Wound` - Generated wound records
- `dbo.Series` - Assessment sessions
- `dbo.Note` - Form field values
- `dbo.Measurement` - Wound measurements (area, depth, perimeter, volume)
- `dbo.WoundState` - Wound state transitions (soft-deleted during cleanup)

### Cleanup Order (dependency-aware):
1. Notes (references Series)
2. Measurements (references Series)
3. WoundState (references Wound and Series)
4. Series (references Patient and Wound)
5. Wounds (references Patient)
6. Patients (root level, tagged with `IG` prefix)

## What Works Now

1. **Admin can generate demo data** through `/admin/data-gen`
2. **Realistic patient demographics** via Faker.js
3. **Form-aware assessment generation** that respects field types and options
4. **Progression timelines** showing healing, stable, or deteriorating wounds
5. **Verification checks** ensure data was created correctly
6. **Cleanup utility** removes all generated data with one click
7. **Standard users can verify AI results** via "Show Data" toggle
8. **Coverage warnings** alert users to data quality issues

## Known Simplifications (as per plan)

The implementation is simplified in Stage 4 (Admin UI):
- Field criteria are pre-configured rather than fully interactive
- No form builder UI for custom field configurations
- Full natural language configuration ("Configure with AI") not implemented
- Preview shows fixed 5 rows rather than dynamic sampling

These simplifications were intentional to focus on core functionality and meet the demo readiness goal faster.

## Stage 2: Enhanced Field Classification & Dropdown Management (Planned)

### Problem Statement

The current system treats all non-FK fields as "editable", but real-world wound assessment data has three distinct field categories:

1. **Pure source-of-truth** (e.g., outline points image blob) — Never settable; requires hardware input
2. **Algorithm output, directly settable** (e.g., `area`, `perimeter`, `volume` in `Outline` table) — Computed by algorithm but stored as simple floats; can be set directly for synthetic data without impacting underlying source (outline points)
3. **Pure data fields** (e.g., `island`, `pointCount`) — No computation; freely editable

Currently, the system doesn't distinguish between categories 2 and 3, and has no way to communicate this distinction to users.

### Goals

- ✅ Classify all settable fields into three categories with clear handling rules
- ✅ Prevent user descriptions from requesting non-settable values
- ✅ Enable fuzzy matching for dropdown values (user says "diabetic ulcer" → suggest "Diabetic Foot Ulcer")
- ✅ Provide clear error messages when user requests values not in valid lookups
- ✅ Support schema expansion (adding new lookup values) as a separate, auditable workflow
- ✅ Add field reference panel in the "Describe" step showing available options before user types

### Acceptance Criteria

#### Field Classification

- [ ] `field-classifier.service.ts` created with functions to classify fields:
  - `classifyField(tableName, columnName): 'source-of-truth' | 'algorithm-output' | 'pure-data'`
  - Hardcoded config for Silhouette tables (e.g., `Outline.area`, `Outline.perimeter`, `Outline.volume` → algorithm-output)
  - All FK fields and image columns → source-of-truth
  - Everything else → pure-data

- [ ] Unit tests verify classification is correct for:
  - `Outline.points` → source-of-truth
  - `Outline.area` → algorithm-output
  - `Outline.island` → pure-data
  - FK fields → source-of-truth
  - Image columns → source-of-truth

#### Dropdown Constraint Handling

- [ ] `dropdown-constraint.service.ts` created with:
  - `getDropdownOptions(tableName, columnName): string[]` - Fetch valid options from `AttributeLookup` (or enum values if applicable)
  - `fuzzyMatchOption(userInput, validOptions): { matched: string, confidence: 0-1, alternatives: string[] }`
  - Confidence > 0.8 = auto-match; 0.5-0.8 = suggest with user confirmation; < 0.5 = reject with "did you mean?" list

- [ ] Unit tests verify:
  - "diabetic ulcer" fuzzy-matches "Diabetic Foot Ulcer" with high confidence
  - "xyz" returns empty alternatives (unknown value)
  - Exact matches have confidence = 1.0

#### Lookup Value Expansion Workflow

- [ ] New API endpoint `/api/admin/data-gen/lookups` (GET/POST):
  - GET: List all form fields and their current dropdown options
  - POST: Add new option to a field (requires admin auth)
  - Inserts into `dbo.AttributeLookup` with proper FK relationships

- [ ] Admin UI "Lookup Values" section added to `/admin/data-gen`:
  - Read-only table showing all form fields and option counts
  - Click a field to expand and see all options
  - "Add new option" button opens modal (field name, new value, description)
  - Pre-selection logic: if user's Describe step mentions a non-existent value, navigation can jump to Lookup section with that field pre-selected

- [ ] Unit tests verify:
  - Can list all form fields and their options
  - Can add new option and it appears in subsequent queries
  - FK relationships are enforced

#### Field Reference Panel in Describe Step

- [ ] Modify `/admin/data-gen` Describe step to include a **side panel**:
  - Left: Free-text "Describe your changes" input (existing)
  - Right: **Field reference panel** (new)
    - Collapsible tree: Entity Type → Form Version (if applicable) → Field Name
    - For each field: data type, field classification, current coverage %, and valid options (if dropdown)
    - Icon indicators: ✓ (pure-data), ⚙️ (algorithm-output), ✗ (source-of-truth)
    - "Add new option" link (if dropdown) jumps to Lookup Values section

- [ ] LLM system prompt updated to say:
  - "User can see all available fields and their valid options in the right panel. Validate the user's description against this list."
  - "If user requests a non-existent value, suggest the closest valid option."
  - "If user requests a source-of-truth field, explain why it can't be changed."

- [ ] UI renders correctly:
  - Panel is scrollable independently
  - Keyword filtering (user types "area" and panel filters to fields matching "area")
  - Responsive: on mobile, switch to tabs (Description tab / Reference tab) rather than side-by-side

### Implementation Details

#### File Structure

```
lib/services/data-gen/
├── field-classifier.service.ts          (new)
├── dropdown-constraint.service.ts       (new)
├── __tests__/
│   ├── field-classifier.service.test.ts (new)
│   └── dropdown-constraint.service.test.ts (new)

app/api/admin/data-gen/
├── lookups/route.ts                     (new, GET/POST)

app/admin/data-gen/
└── components/
    ├── field-reference-panel.tsx        (new)
    └── describe-step.tsx                (refactor existing)
```

#### Key Implementation Patterns

**Field Classification Config** (hardcoded, expandable):

```typescript
const FIELD_CLASSIFICATION: Record<string, Record<string, FieldClass>> = {
  'Outline': {
    'points': 'source-of-truth',
    'area': 'algorithm-output',
    'perimeter': 'algorithm-output',
    'volume': 'algorithm-output',
    'maxDepth': 'algorithm-output',
    'avgDepth': 'algorithm-output',
    'island': 'pure-data',
    'imageCaptureFk': 'source-of-truth',
  },
  // ... other tables
};
```

**Fuzzy Match with Levenshtein distance** (use existing library or simple implementation):

```typescript
function fuzzyMatchOption(input: string, options: string[]) {
  const scored = options.map(opt => ({
    option: opt,
    confidence: calculateSimilarity(input.toLowerCase(), opt.toLowerCase())
  }));
  return scored
    .filter(s => s.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence);
}
```

**Preview Step Validation**:
- After LLM generates SQL preview, check each SET clause against field classifications
- If any source-of-truth field appears in SET, flag with warning: "Cannot modify [field name] — it's a hardware-captured value"
- If any dropdown field has a value not in valid options, highlight with suggestion

### Test Coverage

- [ ] `field-classifier.service.test.ts`: 8 tests (all field types, all classification categories)
- [ ] `dropdown-constraint.service.test.ts`: 10 tests (exact match, fuzzy match, no match, confidence scoring)
- [ ] `/api/admin/data-gen/lookups` route tests: 6 tests (list, add, FK validation, auth)
- [ ] Updated `/admin/data-gen` integration tests: 4 tests (panel rendering, filtering, navigation to lookup section)

**Total new tests:** 28

### Rollout Strategy

1. Implement field classifier and dropdown constraint services (no UI changes yet)
2. Add to schema discovery API response (expose field class on each field)
3. Implement Lookup Values admin section independently
4. Integrate field reference panel into Describe step
5. Update LLM prompt to validate against classifications
6. E2E test: user tries to set area, sees algorithm-output label, sets it, sees warning in preview but proceeds successfully

### Known Constraints

- Outline point blobs are stored as `image` SQL type; reading them requires special handling in queries
- Lookup expansion may have clinical/regulatory approval requirements — no validation added at this stage; admins are trusted
- Fuzzy matching is basic (Levenshtein); for production, consider phonetic matching for medical terms (Soundex, Metaphone)

---

## Next Steps (Future Enhancements)

If needed for production:
1. Full field configuration UI with sliders, dropdowns, and range inputs
2. Natural language interpretation for bulk criteria updates
3. Model routing (use fast models for simple queries)
4. Assessment form selector in the UI
5. Admin data browser page for exploring data
6. UPDATE mode to fill gaps in existing data
7. More sophisticated progression profiles with configurable parameters

## Files Added/Modified Summary

**New Files:** 20
**Modified Files:** 3
**Total Lines of Code:** ~3,500
**Test Coverage:** 39 unit tests, 100% passing
