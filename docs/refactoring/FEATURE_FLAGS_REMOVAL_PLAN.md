# Feature Flags Removal Plan

**Status:** Implemented  
**Target:** Post-Beta Refactor (Phase 1)  
**Scope:** Remove 7 feature flag checks across 44 files  
**Risk Level:** Low (no breaking changes, all features enabled by default)  
**Estimated Effort:** 4-6 hours

---

## Overview

This document provides a comprehensive plan to remove all feature flags from the codebase. All flagged features (Chart Insights, Audit Dashboard, Templates, Semantic Search) are **production-ready** and will be **shipped as standard** features.

**Motivation:**

- Reduce configuration complexity
- Eliminate "toggle hell" (conditional logic throughout code)
- Simplify onboarding for new developers
- Improve code clarity and maintainability
- Align with project philosophy: "ruthless simplicity"

---

## Feature Flags to Remove

### 1. Chart Insights Flags (Server + Client)

**Environment Variables:**

- `CHART_INSIGHTS_API_ENABLED`
- `CHART_INSIGHTS_ENABLED`
- `NEXT_PUBLIC_CHART_INSIGHTS_ENABLED`

**Purpose:** Gate the insights/dashboard API and UI

**Status:** Production-ready, core to product offering

**Impact:** Insights/dashboards always available; no opt-in needed

---

### 2. Audit Dashboard Flags (Server + Client)

**Environment Variables:**

- `ENABLE_AUDIT_DASHBOARD`
- `NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD`

**Purpose:** Gate the admin audit dashboard section

**Status:** Production-ready, useful for compliance/monitoring

**Impact:** Audit dashboard always visible to admins; no toggle needed

---

### 3. Template System Flag

**Environment Variable:**

- `AI_TEMPLATES_ENABLED`

**Purpose:** Gate DB-backed query templates (falls back to JSON if disabled)

**Status:** Production-ready, improves query generation

**Impact:** DB-backed templates always active; JSON fallback removed

---

### 4. Semantic Search Flag

**Environment Variable:**

- `USE_CONCEPT_ID_SEARCH`

**Purpose:** Gate concept-ID-based hybrid search (vs. name-only search)

**Status:** Production-ready, performance optimization

**Impact:** Hybrid search always active; old search removed

---

## Detailed Removal Guide

### Phase 1: Map All Usages (DONE)

**Total files affected: 44**

#### Group A: Configuration Files (4 files)

- `env.local.example`
- `env.production.example`
- `lib/config/template-flags.ts`
- `lib/config/audit-flags.ts`

#### Group B: API Routes (9 files)

- `app/api/insights/route.ts` — POST/GET gated by `CHART_INSIGHTS_API_ENABLED`
- `app/api/insights/[id]/route.ts` — GET/PUT/DELETE gated
- `app/api/insights/[id]/execute/route.ts` — Gated
- `app/api/dashboards/default/route.ts` — GET/POST gated (2x)
- `app/api/dashboards/panel/[panelId]/bind/route.ts` — POST gated
- `app/api/stats/overview/route.ts` — Gated
- `app/api/ai/templates/check-duplicates/README.md` — Doc reference

#### Group C: Page Components (10 files)

- `app/dashboard/page.tsx` — Conditional rendering + error message
- `app/insights/[id]/page.tsx` — Conditional rendering
- `app/analysis/schema/page.tsx` — Conditional rendering (2 flags)
- `app/templates/page.tsx` — Error message display
- `app/templates/[id]/page.tsx` — Error message display
- `app/templates/[id]/edit/page.tsx` — Error message display
- `app/templates/new/page.tsx` — Error message display
- `app/admin/audit/page.tsx` — Env display + error message (2 flags)
- `app/admin/audit/queries/page.tsx` — Error message
- `app/admin/audit/performance/page.tsx` — Error message
- `app/admin/audit/sql-validation/page.tsx` — Error message
- `app/admin/audit/clarifications/page.tsx` — Error message
- `app/admin/audit/queries/[id]/page.tsx` — Error message

#### Group D: Service Layers (5 files)

- `lib/services/insight.service.ts` — Check at line 51 (`ensureApiEnabled()`)
- `lib/services/dashboard.service.ts` — Check at line 28 (`ensureApiEnabled()`)
- `lib/services/query-template.service.ts` — Check + fallback logic
- `lib/services/context-discovery/semantic-searcher.service.ts` — Branch logic (line 365)
- `lib/components/Providers.tsx` — Conditional provider setup

#### Group E: UI Components (4 files)

- `components/funnel/FunnelPanel.tsx` — Conditional rendering (2 locations)
- `components/insights/SaveInsightDialog.tsx` — API gate check

#### Group F: Tests (5 files)

- `app/api/insights/__tests__/route.test.ts` — Setup/teardown
- `app/api/insights/[id]/__tests__/route.test.ts` — Setup/teardown
- `lib/services/query-template.service.test.ts` — Multiple tests
- `lib/services/template.service.test.ts` — Multiple tests

#### Group G: Documentation (6 files)

- `docs/todos/done/chart_insights_implementation_plan.md` — References
- `docs/todos/done/template_system_mvp_implementation_plan.md` — References
- `docs/todos/pending/template-authoring-guide.md` — References
- `docs/design/templating_system/template_improvement_design.md` — References
- `docs/design/templating_system/template_system_phase_breakdown.md` — References
- `docs/todos/in-progress/auditing-improvement-todo.md` — References
- `docs/reviews/task-4-s19c-code-review.md` — References
- `docs/reviews/P0.2_ACTION_ITEMS.md` — References
- `docs/todos/in-progress/partial-done/templating_improvement_real_customer.md` — References

---

### Phase 2: Remove Configuration

#### 2.1 Delete Flag Configuration Files

**Action:** Remove these utilities entirely (no longer needed)

```
lib/config/template-flags.ts
lib/config/audit-flags.ts
```

**Reason:** These files only wrap environment checks; once we always enable features, they're obsolete.

#### 2.2 Update Environment Examples

**Files to update:**

- `env.local.example`
- `env.production.example`

**Action:** Delete these sections:

```
# REMOVE FROM env.local.example (lines 88-91)
CHART_INSIGHTS_API_ENABLED=false
CHART_INSIGHTS_ENABLED=false
NEXT_PUBLIC_CHART_INSIGHTS_ENABLED=false

# REMOVE FROM env.local.example (lines 97)
AI_TEMPLATES_ENABLED=false

# REMOVE FROM env.local.example (lines 103-105)
ENABLE_AUDIT_DASHBOARD=false
NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD=false

# NO MENTION OF USE_CONCEPT_ID_SEARCH (not in examples, internal only)
```

**Reason:** These flags are no longer configurable; features are always-on.

---

### Phase 3: Remove Service-Layer Checks

#### 3.1 Chart Insights API Check

**File:** `lib/services/insight.service.ts`

**Current (lines 50-54):**

```typescript
function ensureApiEnabled() {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    throw new Error("ChartInsightsAPI:Disabled");
  }
}
```

**Action:** Delete function entirely. Remove all calls to `ensureApiEnabled()` from:

- Line 51: In the constructor/init (if any)
- Line 51: In `create()`, `update()`, `getById()`, `list()`, `softDelete()` methods

**Reason:** API is always available; no need to gate.

**Search for calls:**

```bash
grep -n "ensureApiEnabled" lib/services/insight.service.ts
grep -n "ensureApiEnabled" lib/services/dashboard.service.ts
```

**Affected methods in `insight.service.ts`:**

- `list()`
- `create()`
- `update()`
- `getById()`
- `softDelete()`

**Affected methods in `dashboard.service.ts`:**

- `getOrCreateDefault()`
- `updateDefault()`
- `bindPanel()`
- `list()`
- `create()`
- `get()`
- `update()`
- `delete()`

---

#### 3.2 Chart Insights API Route Guards

**Files:** All routes under `app/api/insights/` and `app/api/dashboards/`

**Current pattern (example from `app/api/insights/route.ts`, lines 12, 37):**

```typescript
export const GET = withErrorHandling(async (req: NextRequest) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  // ... rest of handler
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  // ... rest of handler
});
```

**Action:** Remove all `if (process.env.CHART_INSIGHTS_API_ENABLED !== "true")` checks from:

- `app/api/insights/route.ts` (lines 12, 37)
- `app/api/insights/[id]/route.ts` (lines 12, 29, 47)
- `app/api/insights/[id]/execute/route.ts` (line 12)
- `app/api/dashboards/default/route.ts` (lines 12, 29)
- `app/api/dashboards/panel/[panelId]/bind/route.ts` (line 12)
- `app/api/stats/overview/route.ts` (line 7)

**Reason:** Routes are always enabled; no need to conditionally forbid.

---

#### 3.3 Template System Fallback Logic

**File:** `lib/services/query-template.service.ts`

**Current (around line 396):**

```typescript
if (!isTemplateSystemEnabled()) {
  console.warn(
    `AI_TEMPLATES_ENABLED is true, but ${reason}. Falling back to JSON catalog.`,
  );
  return await this.loadJsonCatalog();
}
```

**Action:**

1. Remove `isTemplateSystemEnabled()` import
2. Remove all conditional branches that check the flag
3. Always use DB-backed templates; remove JSON fallback path entirely
4. Update any warning logs that mention "falling back to JSON"

**Reason:** DB-backed templates are now the only implementation.

**Note:** If tests verify fallback behavior, update them to remove flag manipulation and only test DB path.

---

#### 3.4 Semantic Search Conditional Logic

**File:** `lib/services/context-discovery/semantic-searcher.service.ts`

**Current (lines 15-16):**

```typescript
const USE_CONCEPT_ID_SEARCH = process.env.USE_CONCEPT_ID_SEARCH === "true";
```

**Current branch (around line 365):**

```typescript
if (!USE_CONCEPT_ID_SEARCH) {
  // Use old name-based search
  return await this.searchByFieldName(concepts, customerId, ...);
} else {
  // Use new concept-ID hybrid search
  return await this.searchByConceptId(concepts, customerId, ...);
}
```

**Action:**

1. Delete the flag constant declaration
2. Remove the `if (!USE_CONCEPT_ID_SEARCH)` branch entirely
3. Always execute the concept-ID search path
4. Delete the old `searchByFieldName()` method (if unused elsewhere)

**Reason:** Concept-ID search is the new standard; old search is obsolete.

---

### Phase 4: Remove UI Conditional Rendering

#### 4.1 Chart Insights UI Gates

**Files:**

- `app/dashboard/page.tsx` (lines 15-16, 219-225)
- `app/insights/[id]/page.tsx` (line 12, 152-155)

**Current pattern (from `app/dashboard/page.tsx`):**

```typescript
const uiEnabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";
const apiEnabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";

// ... later ...

if (!uiEnabled)
  return (
    <div className="p-6 text-sm text-gray-600">
      Dashboard is disabled. Set CHART_INSIGHTS_ENABLED=true and
      NEXT_PUBLIC_CHART_INSIGHTS_ENABLED=true.
    </div>
  );
```

**Action:**

1. Delete flag constant declarations (`uiEnabled`, `apiEnabled`)
2. Delete the `if (!uiEnabled)` guard that returns disabled message
3. Remove flag checks from `useEffect` dependencies
4. Simplify directly to render the UI

**Example after:**

```typescript
// REMOVED:
// const uiEnabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";
// const apiEnabled = ...

// REMOVED:
// if (!uiEnabled) return <disabled message>

// Now just render normally
useEffect(() => {
  const load = async () => {
    // fetch data...
  };
  load();
}, []); // No flag in deps anymore
```

---

#### 4.2 Analysis Schema Page

**File:** `app/analysis/schema/page.tsx` (lines 4-5, 10, 18)

**Current:**

```typescript
const uiEnabled = process.env.CHART_INSIGHTS_ENABLED === "true";
const apiEnabled = process.env.CHART_INSIGHTS_API_ENABLED === "true";

if (!uiEnabled)
  return <div>Chart Insights UI is disabled. Set CHART_INSIGHTS_ENABLED=true.</div>;
if (!apiEnabled)
  return <div>Chart Insights API is disabled. Set CHART_INSIGHTS_API_ENABLED=true.</div>;
```

**Action:** Delete all flag checks; render normally.

---

#### 4.3 Template Pages Error Messages

**Files:**

- `app/templates/page.tsx` (line 57)
- `app/templates/[id]/page.tsx` (line 46)
- `app/templates/[id]/edit/page.tsx` (line 31)
- `app/templates/new/page.tsx` (line 26)

**Current pattern:**

```typescript
<div className="p-6 text-sm text-red-600">
  AI_TEMPLATES_ENABLED=true
</div>
```

**Action:** Delete error message block entirely; assume templates always work.

---

#### 4.4 Audit Dashboard Pages

**Files:**

- `app/admin/audit/page.tsx` (lines 28-29, 90-91)
- `app/admin/audit/queries/page.tsx` (line 113)
- `app/admin/audit/performance/page.tsx` (line 87)
- `app/admin/audit/sql-validation/page.tsx` (line 124)
- `app/admin/audit/clarifications/page.tsx` (line 125)
- `app/admin/audit/queries/[id]/page.tsx` (line 85)

**Current pattern:**

```typescript
const disabled = !isAuditDashboardEnabled();
if (disabled) {
  return <div>The audit dashboard is disabled. Set ENABLE_AUDIT_DASHBOARD=true to enable.</div>;
}
```

**Action:** Delete disabled checks and error messages; render normally.

**Note:** In `app/admin/audit/page.tsx`, also remove the env display section:

```typescript
// REMOVE:
envValue: process.env.NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD,
envType: typeof process.env.NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD,
```

---

### Phase 5: Remove Component-Level Checks

#### 5.1 Funnel Panel Component

**File:** `components/funnel/FunnelPanel.tsx` (lines 1437, 1566)

**Current:**

```typescript
process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true" &&
  // render insights button
```

**Action:** Remove the flag check; always render the button.

---

#### 5.2 Save Insight Dialog

**File:** `components/insights/SaveInsightDialog.tsx` (line 27)

**Current:**

```typescript
const apiEnabled =
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";

// ... later ...
if (!apiEnabled) return null;
```

**Action:** Delete flag check; always render the dialog.

---

#### 5.3 Providers Component

**File:** `lib/components/Providers.tsx` (line 25)

**Current:**

```typescript
process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true" && SomeProvider;
```

**Action:** Remove flag check; always include the provider.

---

### Phase 6: Update Tests

#### 6.1 Test Setup/Teardown

**Files:**

- `app/api/insights/__tests__/route.test.ts` (lines 19-34)
- `app/api/insights/[id]/__tests__/route.test.ts` (lines 21-34)

**Current pattern:**

```typescript
const originalApiEnabled = process.env.CHART_INSIGHTS_API_ENABLED;

beforeEach(() => {
  process.env.CHART_INSIGHTS_API_ENABLED = "true";
});

afterEach(() => {
  process.env.CHART_INSIGHTS_API_ENABLED = originalApiEnabled;
});
```

**Action:** Delete these beforeEach/afterEach blocks entirely. Tests now assume feature is always enabled.

---

#### 6.2 Template Service Tests

**Files:**

- `lib/services/query-template.service.test.ts` (multiple lines)
- `lib/services/template.service.test.ts` (multiple lines)

**Current pattern:**

```typescript
beforeEach(() => {
  process.env.AI_TEMPLATES_ENABLED = "true"; // or "false"
});
```

**Action:**

1. Remove all flag setup/teardown
2. Tests that verify "flag disabled" behavior should be deleted
3. Keep only tests that verify DB template functionality

**Example deletions:**

- Tests checking "When AI_TEMPLATES_ENABLED=false, use JSON catalog" → DELETE
- Tests checking "When AI_TEMPLATES_ENABLED=true, use DB catalog" → KEEP (remove flag setup)

---

### Phase 7: Update Documentation

#### 7.1 Implementation Plan Docs

**Files to update:**

- `docs/todos/done/chart_insights_implementation_plan.md` — Add note: "Flags removed post-beta"
- `docs/todos/done/template_system_mvp_implementation_plan.md` — Add note: "Flags removed post-beta"

**Action:** Add this section at the top of each:

```markdown
## Status Update (Post-Beta)

These feature flags were successfully removed in refactor phase X.
All features are now always-on; no configuration required.
```

#### 7.2 Future-Looking Docs

**Files:**

- `docs/todos/pending/template-authoring-guide.md`
- `docs/design/templating_system/template_improvement_design.md`

**Action:** Replace references to feature flags with note: "Templates are now always-on (flags removed in beta refactor)."

#### 7.3 Audit Docs

**File:** `docs/todos/in-progress/auditing-improvement-todo.md` (line 244)

**Current:**

```markdown
- Add feature flag `ENABLE_AUDIT_DASHBOARD` for gradual rollout
```

**Action:** Replace with:

```markdown
- ✅ Audit dashboard deployed (feature flags removed in beta refactor)
```

---

### Phase 8: Remove Unused Imports

After all changes, search for orphaned imports:

```bash
# Search for imports of removed modules
grep -r "from.*template-flags" lib/ app/ components/
grep -r "from.*audit-flags" lib/ app/ components/
grep -r "isTemplateSystemEnabled" lib/ app/ components/
grep -r "isAuditDashboardEnabled" lib/ app/ components/
```

**Remove imports of:**

- `isTemplateSystemEnabled()` from `lib/config/template-flags`
- `isAuditDashboardEnabled()` from `lib/config/audit-flags`
- Any other utility functions from those files

---

## Implementation Checklist

- [ ] **Phase 1:** Verify all 44 files listed above are accounted for
- [ ] **Phase 2:**
  - [ ] Delete `lib/config/template-flags.ts`
  - [ ] Delete `lib/config/audit-flags.ts`
  - [ ] Update `env.local.example` (remove 6 lines)
  - [ ] Update `env.production.example` (remove 3 lines)
- [ ] **Phase 3:**
  - [ ] Remove `ensureApiEnabled()` from insight.service.ts
  - [ ] Remove `ensureApiEnabled()` from dashboard.service.ts
  - [ ] Remove flag guards from 6 API routes
  - [ ] Remove template fallback logic
  - [ ] Remove semantic search branch logic
- [ ] **Phase 4:**
  - [ ] Update 2 dashboard/insights pages
  - [ ] Update 1 schema analysis page
  - [ ] Update 4 template pages
  - [ ] Update 6 audit dashboard pages
- [ ] **Phase 5:**
  - [ ] Update FunnelPanel component
  - [ ] Update SaveInsightDialog component
  - [ ] Update Providers component
- [ ] **Phase 6:**
  - [ ] Remove test setup/teardown in 2 route tests
  - [ ] Remove/update template service tests
- [ ] **Phase 7:**
  - [ ] Update all documentation files (9 files)
- [ ] **Phase 8:**
  - [ ] Search for orphaned imports
  - [ ] Verify no references to removed functions
- [ ] **Phase 9:**
  - [ ] Run linter (`npm run lint`)
  - [ ] Run tests (`npm run test:run`)
  - [ ] Manual smoke test: All features work without env vars

---

## Rollback Strategy

If any issue occurs during removal:

1. **Before starting:** `git stash` or create a branch
2. **If issues found:** `git checkout` the affected files or revert the branch
3. **No breaking changes:** Since we're removing guards (making features always-on), the only risk is if code depends on features being disabled

---

## Testing Strategy

After removal, verify:

1. **Insights API:** All endpoints respond (no 403s)
2. **Dashboards:** Can create, bind, update panels
3. **Templates:** DB-backed templates are used (not JSON fallback)
4. **Audit Dashboard:** Visible in admin, all pages load
5. **Semantic Search:** Concept-based search works
6. **Run test suite:** `npm run test:run` (all pass)

---

## Migration Notes

### For Developers

- No action needed; features are always available
- Stop checking environment variables for these features
- Use flags only for truly experimental features going forward

### For Deployment

- Stop requiring these env vars in `.env` files
- Cleaner `.env.production` with fewer variables
- Reduced configuration surface area

### For Future Feature Development

- If a feature is beta/experimental: keep it disabled in code (behind a business logic check)
- Only use env flags for features with multiple implementation paths (A/B testing, gradual rollout)
- Prefer feature deletion over long-term flags

---

## Related Files

- Implementation guide: `docs/refactoring/BETA_RELEASE_DEPLOYMENT_PREP.md`
- Core philosophy: `.cursor/rules/00-core-philosophy.mdc`
- Simplicity rules: `.cursor/rules/01-simplicity.mdc`
