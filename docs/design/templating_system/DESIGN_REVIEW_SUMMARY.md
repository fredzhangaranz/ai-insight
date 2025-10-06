# Template System Design Review — Summary of Changes

**Date:** 2025-10-01  
**Reviewer:** AI Design Review (following project rules from AGENTS.md)  
**Files Updated:**

- `database/migration/011_create_template_catalog.sql`
- `docs/design/template_improvement_design.md`
- `docs/todos/template_system_mvp_implementation_plan.md`
- `docs/design/template_system_phase_breakdown.md` (NEW)

---

## Review Verdict

**Taste:** 🟡 → 🟢 (Mediocre → Good after fixes)  
**Approval Status:** ✅ **APPROVED** (after mandatory changes applied)

**Three-Question Gate:**

1. ✅ Real problem? YES
2. ⚠️ Simpler solution? YES (with simplifications applied)
3. ✅ Any breakage? NO (properly gated)

---

## MUST FIX Items (Applied)

### 1. ✅ Define Versioning Strategy

**Problem:** Versioning model was unclear; risk of orphaned TemplateUsage entries.

**Fix Applied:**

- Documented **immutable versioning strategy** in migration, design doc, and implementation plan
- **Draft → Approved → Deprecated lifecycle**
- Publishing freezes TemplateVersion (no mutation)
- Edits to Approved templates create new version
- `Template.activeVersionId` FK points to current active version
- Added to migration comments and design doc section

**Location:**

- `011_create_template_catalog.sql` line 6: "Versioning strategy: Immutable versions"
- `template_improvement_design.md` lines 98-104: "Versioning Strategy (Immutable Versions)"

---

### 2. ✅ Document placeholdersSpec Schema

**Problem:** JSONB field undefined; devs wouldn't know what to build.

**Fix Applied:**

- Documented full schema in migration SQL comments (lines 48-68)
- Added to design doc with examples (lines 114-136)
- Schema includes: `name`, `type`, `semantic`, `required`, `default`, `validators`
- Examples for guid, int, string, date types

**Example:**

```json
{
  "slots": [
    {
      "name": "patientId",
      "type": "guid",
      "semantic": "patient_id",
      "required": true,
      "default": null,
      "validators": ["non-empty"]
    },
    {
      "name": "windowDays",
      "type": "int",
      "semantic": "time_window",
      "required": false,
      "default": 180,
      "validators": ["min:1", "max:365"]
    }
  ]
}
```

---

### 3. ✅ Move Documentation to Stage 2.5

**Problem:** Authoring guide in Stage 6 (after UI implementation); devs building UI wouldn't know the spec.

**Fix Applied:**

- Created **Stage 2.5: Documentation** (lines 99-123 in implementation plan)
- Inserted AFTER Stage 2 (Validation Service) and BEFORE Stage 3 (Template Service)
- Stage 2.5 now creates authoring guide with:
  - placeholdersSpec schema
  - Validation rules
  - Template lifecycle (Draft → Approved → Deprecated)
  - Worked examples
  - Best practices

**Benefit:** Documentation acts as **spec** for API/UI, not afterthought.

---

### 4. ✅ Fix Migration SQL Issues

**Problems:**

- Missing `updatedAt` trigger
- `UX_Template_Name_Intent` too restrictive (prevents new Drafts)
- `TemplateUsage.chosen` should default TRUE

**Fixes Applied:**

**4a. updatedAt Trigger** (lines 33-45)

```sql
CREATE OR REPLACE FUNCTION update_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_template_updated_at
BEFORE UPDATE ON "Template"
FOR EACH ROW
EXECUTE FUNCTION update_template_updated_at();
```

**4b. Partial Unique Index** (lines 25-29)

```sql
-- Allows historical Deprecated templates to keep their names
CREATE UNIQUE INDEX IF NOT EXISTS "UX_Template_Name_Intent_Active"
  ON "Template" (name, intent)
  WHERE status IN ('Draft', 'Approved');
```

**4c. TemplateUsage.chosen default** (line 114)

```sql
chosen BOOLEAN NOT NULL DEFAULT TRUE,
```

**4d. Added activeVersionId FK** (lines 18, 89-92)

```sql
-- In Template table:
"activeVersionId" INTEGER,

-- After TemplateVersion table created:
ALTER TABLE "Template"
ADD CONSTRAINT "FK_Template_ActiveVersion"
FOREIGN KEY ("activeVersionId") REFERENCES "TemplateVersion"(id) ON DELETE SET NULL;
```

---

### 5. ✅ Clarify Stage 7 Success Criteria

**Problem:** Unrealistic 15%/20% improvement targets without changing selection logic.

**Fix Applied:**

- **Phase 1 (MVP):** Parity check (±5%) + telemetry foundation
- **Phase 2:** Improvement targets (15%/20%/75%)
- Updated Stage 7 in implementation plan (lines 249-285)
- Updated Evaluation Protocol in design doc (lines 296-340)

**Phase 1 Success Criteria:**
| Metric | Target |
|--------|--------|
| Parity | ±5% vs JSON baseline |
| Telemetry | 100% logging |
| Coverage | ≥60% hit rate |
| Foundation | Baseline for Phase 2 |

**Phase 2 Targets (deferred):**
| Metric | Target |
|--------|--------|
| First-pass valid SQL | ≥15% increase |
| Edit deltas | ≥20% reduction |
| Hit rate | ≥75% |

---

## SHOULD FIX Items (Applied)

### 6. ✅ Consolidate Validation Logic

**Problem:** Validation rules duplicated across JSON catalog validator, runtime safety, and authoring.

**Fix Applied:**

- Created **Stage 2: Consolidated Validation Service** (lines 74-97 in implementation plan)
- New file: `lib/services/template-validator.service.ts`
- Reusable validators:
  - `validatePlaceholders()` — declared vs. used
  - `validateSafety()` — SELECT/WITH-only, dangerous keywords
  - `validateSchemaPrefix()` — ensure `rpt.` prefix
  - `validatePlaceholdersSpec()` — JSON schema compliance
  - `validateTemplate()` — orchestrator
- Updated design doc with consolidated validation strategy (lines 176-203)

**Benefit:** Single source of truth; no rule drift.

---

### 7. ✅ Add Service Layer Interface (Stage 1.5 → Stage 2)

**Problem:** Stage 3 (APIs) depends on Stage 2 (Service) but interface unclear.

**Fix Applied:**

- Renamed stages to clarify dependencies:
  - Stage 2: Consolidated Validation Service (new)
  - Stage 2.5: Documentation (moved from Stage 6)
  - Stage 3: Template Service + Selector
  - Stage 4: Developer APIs
  - Stage 5: UI
  - Stage 6: Provider/Runtime Integration
  - Stage 7: Evaluation
  - Stage 8: Release

**Benefit:** Clear dependency flow; validation → docs → service → APIs → UI.

---

### 8. ✅ Improve Selection Heuristic (Minimal Enhancement)

**Problem:** DB migration without selection improvement feels low-value.

**Fix Applied:**

- Added **success-rate weighting** to Stage 3 (lines 125-146 in implementation plan)
- Query `TemplateUsage` for recent success rates
- Boost templates with high success % in scoring
- Minimal code change; measurable improvement
- Updated design doc (lines 150-162)

**Benefit:** Justifies DB migration cost with measurable improvement; builds data foundation for Phase 2 embeddings.

---

## NICE TO HAVE Items (Applied)

### 9. ✅ Defer TemplateTest Table to Phase 2

**Problem:** Test harness adds significant scope; MVP can use external gold set.

**Fix Applied:**

- Commented out `TemplateTest` table in migration (lines 94-106)
- Updated design doc: "TemplateTest (PHASE 2)" (lines 138-140)
- Updated implementation plan Stage 1 (line 45)
- Stage 7 uses external gold set (`scripts/evaluate-templates.ts`)

**Savings:**

- No test harness UI in MVP
- No test orchestration APIs
- Reduces MVP scope by ~2 weeks

**Phase 2:** Add TemplateTest table and UI for automated regression testing.

---

### 10. ✅ Merge /validate Endpoint into Create/Publish

**Problem:** Validation is fast/deterministic; separate endpoint adds complexity.

**Fix Applied:**

- Removed `/validate` endpoint from API surface (design doc lines 232-252)
- Validation now **automatic** in create/edit/publish endpoints
- Returns validation result in response body
- Updated implementation plan Stage 4 (line 172)

**Benefit:** Simpler API; better UX (immediate feedback).

---

### 11. ✅ Combine Apply/Save Template UI

**Problem:** Two wizards with 80% shared logic.

**Fix Applied:**

- Created **unified TemplateEditorModal** (implementation plan lines 198-203)
- Mode prop: `'apply' | 'create'`
- Shared: slot-filling wizard, validation feedback, schema hints
- Updated design doc (lines 258-264)

**Benefit:** Reduces UI code duplication; consistent editing experience.

---

## New Artifacts Created

### 1. Phase Breakdown Document

**File:** `docs/design/template_system_phase_breakdown.md`

**Contents:**

- Phase 1 vs Phase 2 scope comparison
- Success criteria for each phase
- Design decisions rationale
- Migration path (Phase 1 → Phase 2)
- Risks & dependencies
- Decision log (why defer TemplateTest, why remove /validate, etc.)

**Purpose:** Single-page reference for "what's in MVP vs future."

---

## Files Modified

### 1. Migration Script

**File:** `database/migration/011_create_template_catalog.sql`

**Changes:**

- Added versioning strategy comment (line 6)
- Added `Template.activeVersionId` field (line 18)
- Converted unique index to partial (lines 25-29)
- Added `updatedAt` trigger (lines 33-45)
- Documented placeholdersSpec schema (lines 48-68)
- Added FK constraint for activeVersionId (lines 89-92)
- Commented out TemplateTest table (lines 94-106)
- Set `TemplateUsage.chosen` default TRUE (line 114)
- Added success index (line 126)

**Status:** ✅ Ready for review and application

---

### 2. Design Document

**File:** `docs/design/template_improvement_design.md`

**Changes:**

- Added "Versioning Strategy" section (lines 98-104)
- Documented placeholdersSpec schema (lines 114-136)
- Marked TemplateTest as Phase 2 (lines 138-140)
- Updated Selection & Ranking with Phase 1/2 split (lines 148-162)
- Added consolidated validation strategy (lines 176-203)
- Updated Database Schema Changes with Phase 1/2 split (lines 205-224)
- Updated API Surface with Phase 1/2 endpoints (lines 226-252)
- Updated UI/UX with Phase 1/2 split (lines 254-282)
- Updated Evaluation Protocol with Phase 1/2 metrics (lines 296-340)
- Added Phase 1 vs Phase 2 Breakdown section (lines 348-395)

**Status:** ✅ Ready for team review

---

### 3. Implementation Plan

**File:** `docs/todos/template_system_mvp_implementation_plan.md`

**Changes:**

- Updated title to "Phase 1" (line 1)
- Updated DoD with Phase 1 criteria (lines 9-18)
- Added Phase 1 vs Phase 2 overview (lines 20-25)
- Made Stage 0 tests more specific (lines 31-36)
- Updated Stage 1 with migration improvements (lines 40-72)
- **Added Stage 2: Consolidated Validation Service** (lines 74-97)
- **Added Stage 2.5: Documentation** (lines 99-123)
- **Renamed Stage 3: Template Service** with success-rate weighting (lines 125-146)
- **Renamed Stage 4: Developer APIs** (removed /validate) (lines 148-177)
- **Renamed Stage 5: UI** (unified editor) (lines 179-215)
- **Renamed Stage 6: Provider Integration** (lines 217-247)
- **Updated Stage 7: Evaluation** (parity check) (lines 249-285)
- Updated Compatibility section (lines 300-320)
- Updated Test Matrix (lines 322-354)
- Updated Out of Scope with Phase 2 items (lines 361-389)

**Status:** ✅ Ready for implementation

---

## Summary of Benefits

### Complexity Reduction

- **TemplateTest deferred:** ~2 weeks saved
- **Unified Template Editor:** ~40% less UI code
- **/validate removed:** 1 fewer endpoint, simpler client flow

### Quality Improvements

- **Versioning clarity:** Immutable model prevents audit trail issues
- **Validation consolidation:** No rule drift, easier maintenance
- **Documentation first:** Specs written before implementation

### Measurable Goals

- **Phase 1:** Parity (±5%) + coverage (≥60%) + telemetry (100%)
- **Phase 2:** Improvements (15%/20%/75%) on solid data foundation

### Risk Mitigation

- **Feature-flagged:** Safe rollback at any stage
- **JSON fallback:** Always available if DB issues
- **Additive only:** No breaking changes to existing APIs
- **Immutable versions:** TemplateUsage references never break

---

## Next Steps

### Before Implementation

1. **Team review** of updated design doc and implementation plan
2. **Confirm Phase 1 scope** acceptable (no gold-plating pressure)
3. **Assign stages** to developers (suggest pairing for Stage 2-5)

### Stage 0 (Compatibility Gates)

1. Implement feature flag toggle
2. Write baseline SQL generation test suite
3. Verify JSON fallback path

### Stage 1 (DB Schema)

1. Apply migration in dev environment
2. Verify constraints/indexes/triggers
3. Implement seed import utility
4. Test rollback procedure

### Stage 2 (Validation Service)

1. Create `template-validator.service.ts`
2. Write unit tests for validators
3. Refactor existing `query-template.service.ts` to use consolidated validators

### Stage 2.5 (Documentation)

1. Write authoring guide with placeholdersSpec examples
2. Document validation rules and lifecycle
3. Team review and walkthrough

---

## Risk Assessment (Post-Review)

| Risk Category         | Before Review | After Review | Mitigation                     |
| --------------------- | ------------- | ------------ | ------------------------------ |
| Versioning breakage   | 🔴 High       | 🟢 Low       | Immutable model documented     |
| Selection degradation | 🟡 Medium     | 🟢 Low       | Parity check + fallback        |
| Scope creep           | 🔴 High       | 🟢 Low       | Phase 1/2 split clear          |
| Developer confusion   | 🟡 Medium     | 🟢 Low       | Docs written first (Stage 2.5) |
| Validation drift      | 🟡 Medium     | 🟢 Low       | Consolidated service           |

---

## Approval Sign-off

**Design Review Status:** ✅ **APPROVED**

**Mandatory changes:** All applied  
**Should-fix items:** All applied  
**Nice-to-have items:** All applied

**Recommendation:** Proceed to implementation with **Stage 0** (compatibility gates) and **Stage 1** (DB schema).

**Follow-up:** After Stage 2.5 (documentation), conduct design walkthrough with team to ensure shared understanding before Stage 3-5 implementation.

---

**Reviewed by:** AI Design Review (following .cursor/rules)  
**Aligned with:**

- ✅ 00-core-philosophy.mdc (good taste, no userspace breakage, pragmatism)
- ✅ 01-simplicity.mdc (single responsibility, ≤3 indentation, obvious over clever)
- ✅ 20-compatibility.mdc (feature flags, zero breaking changes, rollback strategy)
- ✅ 10-workflow.mdc (staged plan, TDD-ready, DoD clear)
- ✅ 50-design-review.mdc (data structures, state transitions, special cases minimized)
