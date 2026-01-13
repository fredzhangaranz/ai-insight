# Week 3 Quick Reference Guide

**Date:** 2025-11-29
**Purpose:** Quick reference for implementing Week 3 priority templates

---

## Template Implementation Workflow

### For Each Template (4-step process):

1. **Add to JSON** → Edit `lib/prompts/query-templates.json`
2. **Seed to DB** → Run `node scripts/seed-template-catalog.js`
3. **Test** → Use `extractAndFillPlaceholders()` with real queries
4. **Refine** → Update JSON, re-seed, re-test

---

## Semantic Tag Reference

Use these semantic tags to drive placeholder resolution:

| Semantic Tag | Resolver | Example | Notes |
|--------------|----------|---------|-------|
| `time_window` | Time Window Resolver | "4 weeks" → 28 | Handles weeks, months, days, quarters |
| `assessment_type` | Assessment Type Resolver | "wound" → at-wound-123 | Searches SemanticIndexAssessmentType |
| `field_name` | Field Variable Resolver | "coding" → coding_status | Searches form + non-form fields |
| `percentage` | Percentage Resolver | "75%" → 0.75 | Converts to decimal |
| `patient_id` | Generic Extraction | Pattern matching | Falls back to generic |
| `wound_id` | Generic Extraction | Pattern matching | Falls back to generic |
| `date` | Generic Extraction | Pattern matching | Falls back to generic |
| (none) | Generic Extraction | Keyword extraction | Last resort |

---

## Template JSON Format

```json
{
  "name": "Template Name",
  "version": 1,
  "intent": "intent_classification_tag",
  "description": "What this template does",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "tags": ["category1", "category2"],
  "placeholders": ["placeholderName1", "placeholderName2"],   // legacy name list (must match sqlPattern)
  "placeholdersSpec": {
    "slots": [
      {
        "name": "placeholderName1",
        "type": "int|string|float|string[]",
        "semantic": "time_window|assessment_type|field_name|percentage",
        "required": true|false,
        "default": null|value,
        "validators": ["min:1", "max:730"],
        "description": "What this placeholder represents",
        "examples": [28, 56, 84]
      }
    ]
  },
  "questionExamples": [
    "Example question 1?",
    "Example question 2?",
    "Example question 3?"
  ],
  "sqlPattern": "SELECT ... WHERE ... {placeholder}",
  "resultShape": {
    "description": "What the query returns",
    "columns": ["col1", "col2"]
  },
  "notes": "Additional implementation notes"
}
```

---

## Testing Pattern

```typescript
// Import
import { extractAndFillPlaceholders } from '@/lib/services/semantic/template-placeholder.service';

// Load template
const template = /* load from database or JSON */;

// Test with real query
const result = await extractAndFillPlaceholders(
  "Show me healing rate at 4 weeks",
  template,
  customerId
);

// Verify results
expect(result.values.timePointDays).toBe(28);
expect(result.confidence).toBe(1.0);
expect(result.missingPlaceholders).toHaveLength(0);
expect(result.filledSQL).toContain('28');
```

---

## Common Placeholder Patterns

### Time Window (days)
```json
{
  "name": "timePointDays",
  "type": "int",
  "semantic": "time_window",
  "required": true,
  "validators": ["min:1", "max:730"],
  "examples": [28, 56, 84]
}
```
**Handles:** "4 weeks", "3 months", "90 days", "1 quarter"

### Assessment Type
```json
{
  "name": "assessmentType",
  "type": "string",
  "semantic": "assessment_type",
  "required": true
}
```
**Handles:** "wound", "superbill", "appointment" → Searches database

### Field Variable
```json
{
  "name": "statusField",
  "type": "string",
  "semantic": "field_name",
  "required": true
}
```
**Handles:** "coding status", "workflow", "patient status" → Searches database

### Optional with Default
```json
{
  "name": "toleranceDays",
  "type": "int",
  "semantic": "time_window",
  "required": false,
  "default": 7
}
```
**Behavior:** Uses 7 if not mentioned in question

### Value Requiring Clarification
```json
{
  "name": "statusValues",
  "type": "string[]",
  "required": true,
  "description": "Status values to filter by"
}
```
**Behavior:** If not in question, generates clarification with enum options

---

## Seeding Script Details

**Command:** `node scripts/seed-template-catalog.js`

**What it does:**
1. Reads `lib/prompts/query-templates.json`
2. For each template:
   - Checks if exists by `name` AND `intent`
   - If exists: Updates metadata (description, tags, etc.)
   - If not exists: Inserts new template
3. For each version:
   - Checks if version exists
   - Inserts only if new
4. Updates `activeVersionId` to latest version

**Updating existing templates:** bump the `version` number in JSON before reseeding; the seed script will insert the new version and set `activeVersionId` to that latest version. Re-running with the same version number will be skipped by design (duplicates are not re-inserted).

**Safety:**
- ✅ Idempotent - safe to run multiple times
- ✅ Handles duplicates automatically
- ✅ Transactional - rolls back on error
- ✅ Logs all operations

**Output:**
```
Template Catalog Seed Statistics:
  Templates Inserted: 3
  Templates Skipped: 8
  Templates Updated: 0
  Versions Inserted: 3
  Versions Skipped: 0
✅ Seed completed successfully
```

---

## Troubleshooting

### Problem: Placeholder not resolved

**Solution:**
1. Check semantic tag is correct
2. Check question contains relevant keywords
3. Check database has matching data (for assessment_type/field_name)
4. Run with debug logging to see resolution flow

### Problem: Wrong placeholder value

**Solution:**
1. Check keyword extraction pattern
2. Adjust template keywords/tags
3. Test with different phrasings
4. Check validator constraints

### Problem: Clarification not showing enum values

**Solution:**
1. Verify placeholder has `semantic: "field_name"`
2. Check field exists in database
3. Check field has enum values in `SemanticIndexFieldEnumValue`
4. Enum value inclusion implemented in Task 2.24

### Problem: Template not matching

**Solution:**
1. Check intent classifier detects correct intent
2. Add more keywords to template
3. Add more question examples
4. Review template matcher logic

---

## Week 3 Task Checklist

### Template 1: Area Reduction (Day 1-2)
- [ ] Add to `query-templates.json`
- [ ] Run seed script
- [ ] Test with 10 real queries (C1 + C3)
- [ ] Refine keywords/tags

### Template 2: Multi-Assessment Correlation (Day 3)
- [ ] Add to `query-templates.json`
- [ ] Run seed script
- [ ] Test with 5 real queries (C3)
- [ ] Refine keywords/tags

### Template 3: Workflow State Filtering (Day 4)
- [ ] Add to `query-templates.json`
- [ ] Run seed script
- [ ] Test with 5 real queries (C3)
- [ ] Refine keywords/tags

### Testing & Refinement (Day 5)
- [ ] Create golden query test suite (20 queries)
- [ ] Create test runner using Vitest
- [ ] Run tests and calculate accuracy
- [ ] Iterate on failures

---

## File Locations

### Templates
- **JSON:** `lib/prompts/query-templates.json`
- **Seed Script:** `scripts/seed-template-catalog.js` (existing)
- **Database:** `Template` and `TemplateVersion` tables

### Resolution System
- **Main Entry Point:** `lib/services/semantic/template-placeholder.service.ts`
- **Function:** `extractAndFillPlaceholders()`
- **Tests:** `lib/services/semantic/__tests__/template-placeholder.service.test.ts`

### Design Docs
- **Architecture Review:** `docs/design/semantic_layer/template_catalog_architecture_review.md`
- **Simplification Summary:** `docs/design/semantic_layer/week3_simplification_summary.md`
- **This Guide:** `docs/design/semantic_layer/week3_quick_reference.md`

---

## Key Reminders

1. **No template-specific code needed** - Everything driven by semantic tags
2. **Single source of truth** - `lib/prompts/query-templates.json`
3. **Idempotent seeding** - Safe to run multiple times
4. **Generic testing** - All tests use `extractAndFillPlaceholders()`
5. **Fixes in JSON only** - No code changes for template refinement

---

## Success Criteria

### Per-Template
- ✅ Template resolves placeholders correctly
- ✅ >85% accuracy on test queries (Template 1)
- ✅ >70% accuracy on test queries (Templates 2 & 3)
- ✅ Clarifications provide helpful options
- ✅ SQL generates correctly

### Overall Week 3
- ✅ 3 templates implemented
- ✅ 0 new production code files
- ✅ All tests pass
- ✅ Golden query suite validates end-to-end
- ✅ Ready for Week 4 integration

---

## Next Steps (Week 4)

Week 4 will integrate the template system into the main query orchestrator:
1. Template matching based on intent
2. Placeholder resolution in query pipeline
3. SQL execution
4. Result formatting
5. End-to-end testing with real customer queries

All using the generic systems built in Weeks 2-3!
