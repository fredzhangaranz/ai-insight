# Template Authoring Guide

**Last Updated:** 2025-10-06  
**Related:** [Template System Design](./design/templating_system/template_improvement_design.md), [UI Mockups](./design/templating_system/template_system_ui_mockups.md), [Implementation Plan](./todos/template_system_mvp_implementation_plan.md)

## Purpose

This guide explains how to author, validate, and promote SQL templates for the AI funnel. It covers the end-to-end lifecycle (Draft → Approved → Deprecated), required metadata, validation rules, and best practices for keeping templates reliable and backwards compatible.

## Lifecycle Overview

| Stage      | Description                                                              | Allowed actions                                  |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| Draft      | Work-in-progress template visible only to developers.                    | Edit metadata, SQL, placeholders, examples.      |
| Approved   | Active template eligible for runtime selection and prompt injection.     | Read-only except via new Draft version.          |
| Deprecated | Historical template kept for audit/telemetry; excluded from runtime use. | Optionally superseded by new versions; no edits. |

**Versioning model:**

1. Creating a Draft sets `TemplateVersion.version = 1`.
2. Publishing freezes the Draft into an immutable `TemplateVersion` (referenced by `Template.activeVersionId`).
3. Editing an Approved template creates a fresh Draft (next version number).
4. Deprecating an Approved template prevents selection but preserves telemetry.

Always prefer promoting a new version over mutating an Approved one—immutability keeps analytics, usage logs, and rollback strategies clean.

## Required Metadata

Every template must include the following fields:

- **Name**: Descriptive, unique within its intent (example: `Count Assessments by Time Window`).
- **Intent**: One of the canonical families (`aggregation_by_category`, `time_series_trend`, `top_k`, `latest_per_entity`, `as_of_state`, `pivot`, `unpivot`, `note_collection`, `join_analysis`).
- **Description**: Short summary of the query outcome.
- **SQL Pattern**: Parameterized SQL Server statement with `{placeholders}`; limited to `SELECT`/`WITH` queries.
- **Keywords**: 5–10 terms that help the selector match incoming questions.
- **Tags**: Optional descriptors for the Admin UI.
- **Examples**: 3–5 example natural-language questions.
- **placeholdersSpec**: Structured definition of runtime slots (see below).

## `placeholdersSpec` Schema

The `placeholdersSpec` JSONB column stores structured slot definitions. Each slot describes how the Apply Template wizard should render and validate the field.

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
    }
  ]
}
```

### Slot Attributes

| Field        | Type     | Required | Description                                                                              |
| ------------ | -------- | -------- | ---------------------------------------------------------------------------------------- |
| `name`       | string   | ✅       | Placeholder identifier used inside `{}` in `sqlPattern`. No spaces; camelCase preferred. |
| `type`       | string   | ❌       | One of `guid`, `int`, `string`, `date`, `boolean`, `float`, `decimal`.                   |
| `semantic`   | string   | ❌       | Semantic hint for downstream integrations (`patient_id`, `wound_id`, etc.).              |
| `required`   | boolean  | ❌       | Defaults to `true`. If `false`, UI treats the slot as optional.                          |
| `default`    | any      | ❌       | Default value or SQL expression (`GETUTCDATE()`).                                        |
| `validators` | string[] | ❌       | Additional validation rules (`non-empty`, `min:1`, `max:365`, `regex:^A`).               |

**Normalization:** Array or optional placeholders should be declared without suffixes. For example, SQL may use `{variableNames}` while the UI surface uses chips or multi-select; the validator normalizes `{variableNames[]}` / `{variableNames?}` to `variableNames` for integrity checks.

### Common Placeholder Patterns

```json
{
  "slots": [
    {
      "name": "patientId",
      "type": "guid",
      "semantic": "patient_id",
      "validators": ["non-empty"]
    },
    {
      "name": "windowDays",
      "type": "int",
      "default": 180,
      "validators": ["min:1", "max:365"]
    },
    { "name": "endDate", "type": "date", "default": "GETUTCDATE()" },
    {
      "name": "variableNames",
      "type": "string",
      "semantic": "attribute_name",
      "validators": ["non-empty"]
    },
    {
      "name": "topK",
      "type": "int",
      "default": 10,
      "validators": ["min:1", "max:100"]
    }
  ]
}
```

- **ID filter**: `patientId`, `woundId` → `guid` with `non-empty` validator.
- **Time window**: `windowDays` (`int` range) + `endDate` (`date` defaulting to `GETUTCDATE()`).
- **Multi-select**: `variableNames` (`string`) mapped to chips/combobox; declare without `[]`/`?` suffix.
- **Limiter**: `topK` (`int`) with `min/max` guarding prompt bloat.

## Placeholder Linking

1. Ensure every `{placeholder}` referenced in `sqlPattern` appears either in the legacy `placeholders` array (for backwards compatibility) or in `placeholdersSpec.slots`.
2. The consolidated validator (`lib/services/template-validator.service.ts`) flags missing or unused placeholders. Use the warnings to trim superfluous slots before publishing.
3. Prefer defining slots in `placeholdersSpec`; the legacy `placeholders` array exists for prompt fallback and will be derived automatically in future phases.

## SQL Authoring Guidelines

Validation rules are enforced automatically during creation, editing, importing, and runtime selection:

| Rule                                        | Level      | Description                                                              |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| Dangerous keywords (`DROP`, `DELETE`, etc.) | ❌ Error   | Query must remain read-only.                                             |
| Non-`SELECT`/`WITH` prefix                  | ⚠️ Warning | Allowed for fragments but discouraged; ensure safe usage.                |
| Missing `rpt.` schema prefixes              | ⚠️ Warning | Heuristic reminder to reference warehouse tables explicitly.             |
| Missing declaration                         | ❌ Error   | Placeholders must be defined in `placeholdersSpec` or `placeholders`.    |
| Duplicate slot names                        | ❌ Error   | Each slot name must be unique.                                           |
| Unknown slot type                           | ⚠️ Warning | Non-standard types are allowed but should be justified in comments/docs. |
| Non-string validators                       | ⚠️ Warning | Coerce complex validators to string descriptors.                         |

To avoid runtime safety fixes, add `TOP 1000` (or relevant limit) and ensure filters use `rpt.DimDate` and other canonical tables when applicable.

## Writing Clean SQL Patterns

High-quality templates produce SQL that is **reusable, maintainable, and safe**. This section provides guidelines for writing clean patterns and avoiding common pitfalls.

### Good vs. Bad SQL Patterns

#### ❌ Bad: Funnel CTE Chains

```sql
WITH Step1_Results AS (
  SELECT patientFk FROM rpt.Assessment WHERE createdUtc > DATEADD(DAY, -180, GETUTCDATE())
),
Step2_Results AS (
  SELECT * FROM Step1_Results WHERE patientFk = {patientId}
),
Step3_Results AS (
  SELECT COUNT(*) as total FROM Step2_Results
)
SELECT * FROM Step3_Results
```

**Problems:**

- Temporary scaffolding left from multi-step funnel execution
- Overly complex for a simple count
- Not reusable in other contexts

#### ✅ Good: Clean Standalone Query

```sql
SELECT TOP 1000 COUNT(DISTINCT A.id) as assessmentCount
FROM rpt.Assessment A
WHERE A.patientFk = {patientId}
  AND A.createdUtc > DATEADD(DAY, -{windowDays}, {endDate})
```

**Benefits:**

- Direct, single-purpose query
- Parameterized for flexibility
- Includes safety constraint (TOP)
- Schema-prefixed table references

### Guidelines for Simplifying Extracted SQL

When capturing templates from successful funnel queries, follow these steps:

1. **Identify the Core Analytical Intent**

   - What business question does this answer?
   - What is the minimal set of tables and joins required?

2. **Remove Temporary Scaffolding**

   - Delete `Step1_Results`, `Step2_Results`, etc. CTEs
   - Remove intermediate CTEs that exist only for funnel chaining
   - Keep only CTEs that represent reusable analytical logic

3. **Generalize Specific Filters to Placeholders**

   - Replace hard-coded IDs with `{patientId}`, `{woundId}`, etc.
   - Replace date literals with `{startDate}`, `{endDate}`, or dynamic expressions
   - Replace specific values with `{topK}`, `{windowDays}`, etc.

4. **Add Safety Constraints**

   - Add `TOP 1000` (or appropriate limit based on expected result size)
   - Ensure all table references use `rpt.` schema prefix
   - Verify only `SELECT`/`WITH` statements (no mutations)

5. **Preserve Essential CTEs**

   - Keep CTEs that perform complex date calculations
   - Retain CTEs used for multi-purpose aggregations
   - Maintain CTEs that improve readability for complex logic

6. **Convert Simple CTEs to Inline Subqueries**
   - If a CTE is used only once and is simple, inline it
   - Balance readability vs. simplicity

### Example Transformation

**Before (from funnel):**

```sql
WITH Step1_Results AS (
  SELECT
    W.id,
    W.patientFk,
    W.createdUtc
  FROM rpt.Wound W
  WHERE W.patientFk = '12345678-1234-1234-1234-123456789012'
),
Step2_Results AS (
  SELECT
    COUNT(*) as woundCount,
    AVG(DATEDIFF(DAY, createdUtc, GETUTCDATE())) as avgAge
  FROM Step1_Results
)
SELECT * FROM Step2_Results
```

**After (clean template):**

```sql
SELECT TOP 1000
  COUNT(DISTINCT W.id) as woundCount,
  AVG(DATEDIFF(DAY, W.createdUtc, GETUTCDATE())) as avgAgeDays
FROM rpt.Wound W
WHERE W.patientFk = {patientId}
  AND W.createdUtc <= GETUTCDATE()
```

### Common Pitfalls and How to Avoid Them

| Pitfall                   | Example                                | Solution                                                         |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| **Funnel scaffolding**    | `WITH Step1_Results AS (...)`          | Remove multi-step CTEs; extract final SELECT logic               |
| **Missing TOP clause**    | `SELECT * FROM rpt.Wound`              | Add `TOP 1000` or appropriate limit                              |
| **Overly specific joins** | Hardcoded FK values in JOIN conditions | Replace with parameterized placeholders                          |
| **Missing schema prefix** | `FROM Wound W`                         | Use `FROM rpt.Wound W`                                           |
| **Unparameterized dates** | `WHERE date > '2024-01-01'`            | Use `{startDate}` or `DATEADD(DAY, -{windowDays}, GETUTCDATE())` |
| **Unused CTEs**           | CTE defined but never referenced       | Remove or inline if single-use                                   |

### Troubleshooting: "My extracted SQL has Step1_Results"

If the AI extraction produces SQL with funnel scaffolding:

1. **Manually simplify before saving:**

   - Identify the final SELECT that produces results
   - Trace dependencies backward to find essential CTEs
   - Collapse unnecessary intermediate steps

2. **Report extraction quality issues:**

   - Document cases where AI fails to simplify
   - Help improve extraction prompts with feedback

3. **Use validation warnings:**
   - The validator detects `Step\d+_Results` patterns
   - Review and simplify when you see scaffold warnings

## Understanding Query Pattern Intents

Every template must declare an **intent** — the category of analytical pattern it represents. This helps the AI system select appropriate templates for incoming questions.

### Intent Reference Table

| Intent                        | Icon | Category            | Description                                                       | Use Cases                                                                                          | SQL Pattern                                                                      |
| ----------------------------- | ---- | ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Aggregation by Category**   | 📊   | Basic Analysis      | Count, sum, or average values grouped by categorical columns      | • Wound counts by etiology<br>• Average healing time by location<br>• Assessment counts by patient | Uses `GROUP BY` with aggregate functions (`COUNT`, `SUM`, `AVG`)                 |
| **Time Series Trend**         | 📈   | Time-Based          | Track metrics over time with date-based grouping and ordering     | • Weekly assessment trends<br>• Monthly admission patterns<br>• Daily measurement changes          | Date grouping (`DAY`, `WEEK`, `MONTH`) with `ORDER BY date ASC`                  |
| **Top K Ranking**             | 🏆   | Ranking             | Find top N or bottom N records ranked by a metric                 | • Top 10 patients by wound count<br>• 5 largest wounds<br>• Bottom 20 by healing time              | Uses `TOP N` or `ROW_NUMBER()` with `ORDER BY metric DESC/ASC`                   |
| **Latest Per Entity**         | 🔄   | Time-Based          | Get the most recent record for each entity using window functions | • Latest assessment per patient<br>• Current wound states<br>• Most recent measurements            | `ROW_NUMBER() OVER (PARTITION BY entity ORDER BY date DESC)` with `WHERE rn = 1` |
| **As-Of State Snapshot**      | 📅   | Time-Based          | Point-in-time snapshot using date range validity checks           | • Active wounds on Jan 1st<br>• Patient status at month-end<br>• Open assessments on date          | `WHERE startDate <= {asOfDate} AND (endDate IS NULL OR endDate > {asOfDate})`    |
| **Pivot (Rows to Columns)**   | ↔️   | Data Transformation | Transform row values into columns (one column per category)       | • Measurement types as columns<br>• One column per wound state<br>• Attribute pivoting             | `MAX(CASE WHEN category = 'X' THEN value END) AS columnX`                        |
| **Unpivot (Columns to Rows)** | ↕️   | Data Transformation | Transform columns into rows (normalize wide data)                 | • Column-per-metric to rows<br>• Normalize wide tables<br>• Stack metric columns                   | `UNPIVOT` operator or `UNION ALL` pattern                                        |
| **Note Collection**           | 📝   | Basic Analysis      | Gather clinical notes or attributes filtered by type              | • Pain scores for patient<br>• Wound classification notes<br>• Specific attribute types            | Joins `rpt.Note` with `rpt.AttributeType` using `WHERE variableName IN (...)`    |
| **Join Analysis**             | 🔗   | Basic Analysis      | Combine data from multiple related tables with joins              | • Patients with assessments<br>• Wounds with measurements<br>• Demographics with outcomes          | Multiple `JOIN`s across tables (`rpt.Patient`, `rpt.Wound`, `rpt.Assessment`)    |

### Choosing the Right Intent

Use this decision tree to select the appropriate intent:

1. **Does the query track changes over time?**

   - **Trend line or aggregation over dates?** → `time_series_trend`
   - **Latest record per entity?** → `latest_per_entity`
   - **State at specific date?** → `as_of_state`

2. **Does the query rank or limit results?**

   - **Top/bottom N by metric?** → `top_k`

3. **Does the query reshape data?**

   - **Rows to columns?** → `pivot`
   - **Columns to rows?** → `unpivot`

4. **Does the query aggregate by categories?**

   - **GROUP BY with counts/sums/averages?** → `aggregation_by_category`

5. **Does the query focus on notes/attributes?**

   - **Fetching specific attribute types?** → `note_collection`

6. **Does the query join multiple tables?**
   - **Combining patient, wound, assessment data?** → `join_analysis`

### Common Mistakes and How to Avoid Them

| Mistake                                          | Why It's Wrong                                  | Correct Intent                                        |
| ------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------- |
| Using `latest_per_entity` for as-of date queries | Latest means "now," not "at specific date"      | Use `as_of_state` for point-in-time snapshots         |
| Using `join_analysis` for simple GROUP BY        | Join analysis implies complex multi-table logic | Use `aggregation_by_category` for simple aggregations |
| Using `time_series_trend` for a single date      | Trends require multiple time points             | Use `as_of_state` or `aggregation_by_category`        |
| Using `top_k` without ranking                    | Top K implies ordering by a metric              | Use `aggregation_by_category` if no ranking           |

### Examples: Same Question, Different Intents

**Question:** "Show me patient wound data"

- **`aggregation_by_category`**: "Count wounds by etiology for all patients"
- **`time_series_trend`**: "Show monthly wound counts over the past year"
- **`top_k`**: "Top 10 patients with the most wounds"
- **`latest_per_entity`**: "Current wound status for each patient"
- **`join_analysis`**: "Patients with their wound details and assessment history"

Each intent produces a different SQL pattern even though the domain (patient wounds) is the same.

## Avoiding Duplicate Templates

The template system includes **automatic duplicate detection** to prevent template sprawl and maintain a clean catalog. This section explains how it works and best practices for authoring unique templates.

### How Similarity Detection Works

When you create or extract a new template, the system:

1. **Tokenizes** your template's name, description, and keywords into normalized terms
2. **Filters** the catalog to templates with the **same intent** (different intents are not compared)
3. **Calculates Jaccard similarity** (intersection ÷ union of token sets) for each candidate
4. **Warns** if similarity exceeds **70%** threshold

**Example:**

- **New Template**: "Count patient assessments in time window"
  - Keywords: `count`, `assessments`, `patient`, `time`, `window`
- **Existing Template**: "Count assessments by patient and date range"
  - Keywords: `count`, `assessments`, `patient`, `date`, `range`
- **Similarity**: 60% (shared: count, assessments, patient; unique: time/window vs. date/range)
- **Result**: No warning (below 70% threshold)

### What Triggers a Warning

You'll see a duplicate warning when:

- Template name is very similar (e.g., "Count Wounds by Patient" vs. "Count Patient Wounds")
- Keywords overlap significantly within the same intent
- Description uses nearly identical phrasing

**The warning is informational only** — you can still save the template. It's your judgment call whether to:

- Save anyway (if truly distinct despite similarity)
- Edit existing template instead (if it's a refinement)
- Deprecate old and replace with new (if it's a better version)

### Best Practices to Avoid Duplication

#### 1. Search Before Creating

Before authoring a new template:

```
1. Open Template Admin UI
2. Filter by your target intent (e.g., "aggregation_by_category")
3. Search keywords related to your query
4. Review existing templates to see if one already covers your use case
```

#### 2. Consider Editing vs. Creating

Ask yourself:

| Create New Template                 | Edit Existing Template                         |
| ----------------------------------- | ---------------------------------------------- |
| Fundamentally different SQL pattern | Minor improvements (better keywords, examples) |
| Different placeholders or structure | Fixing bugs or adding safety checks            |
| Serves distinct use case            | Clarifying description or naming               |
| Different intent category           | Performance optimization                       |

**Remember:** Editing an Approved template creates a new version (immutable versioning). Both workflows preserve history.

#### 3. Use Distinctive Keywords

- ✅ **Good**: Focus on **domain-specific** terms (`wound`, `etiology`, `assessment`, `patient`, `healing`)
- ❌ **Bad**: Generic SQL terms (`select`, `group`, `join`, `count`, `sum`)

**Example:**

- **Poor keywords**: `select`, `count`, `group by`, `from table`
- **Good keywords**: `wound etiology`, `patient demographics`, `assessment frequency`, `healing rate`

#### 4. Write Clear, Specific Descriptions

Avoid vague descriptions that could apply to many templates:

- ❌ **Bad**: "Get patient data grouped by category"
- ✅ **Good**: "Count unique assessments per patient within a rolling time window, grouped by wound location"

#### 5. Deprecate When Replacing

If you create a better version of an existing template:

```
1. Publish the new template first
2. Deprecate the old template (preserves telemetry and audit trail)
3. Add notes documenting why the new version is preferred
4. Monitor TemplateUsage to confirm migration
```

### Governance Workflow (Phase 2)

In **Phase 2**, we'll add:

- **Merge workflows**: Admin UI to consolidate similar templates
- **Approval gates**: Require review before publishing templates with high similarity
- **Template analytics**: Dashboard showing overlap and usage patterns
- **Cross-environment sync**: Export/import bundles to keep staging/prod aligned

For now, rely on:

- Developer judgment when warnings appear
- Team code reviews for new templates
- Periodic manual audits of the catalog

### Example: Responding to a Duplicate Warning

**Scenario:** You extract a template from a successful query:

```
AI-extracted template:
  Name: "Count assessments by time range"
  Intent: aggregation_by_category
  Keywords: count, assessments, time, range, patient

⚠️ Similar templates detected:
  1. "Count Assessments by Time Window" (82% similar, 95% success rate)
     Keywords: count, assessments, time, window, patient
  2. "Assessment Counts for Date Range" (75% similar, 88% success rate)
     Keywords: count, assessments, date, range
```

**Decision options:**

| Action              | When to Choose                                                                   |
| ------------------- | -------------------------------------------------------------------------------- |
| **Review Existing** | Existing template already covers this use case; use it instead                   |
| **Save Anyway**     | Your template has different placeholders, SQL structure, or serves distinct need |
| **Edit Existing**   | Existing template is close but could be improved with your refinements           |
| **Cancel**          | Need more research to decide; will revisit later                                 |

**Log your decision rationale** in commit messages or template notes for future reference.

## Authoring Workflow

1. **Draft Template**
   - Use the Template Editor (see mockups) or call the upcoming `/api/ai/templates` endpoints.
   - Paste the SQL pattern and configure placeholders via the two-mode wizard (Simple/Advanced).
2. **Validation Pass**
   - The editor runs the consolidated validator. Resolve errors; triage warnings.
   - For CLI imports (`scripts/seed-template-catalog.ts`), rerun if you adjust `lib/prompts/query-templates.json` to seed new patterns.
3. **Approval**
   - Once ready, publish the Draft to create an immutable `TemplateVersion`.
   - Document intent changes, expected result set shape, and any special handling in code review.
4. **Runtime Verification**
   - Enable `AI_TEMPLATES_ENABLED` in dev, trigger a funnel question, and confirm the matched template and warnings in logs (`TemplateUsage`).
5. **Deprecation**
   - When a template is superseded, publish the replacement first, then deprecate the old version to keep telemetry intact.

## Example: "Count Assessments by Time Window"

| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Name              | `Count Assessments by Time Window`                                    |
| Intent            | `aggregation_by_category`                                             |
| SQL Pattern       | `SELECT COUNT(DISTINCT A.id)... WHERE A.patientFk = {patientId}`      |
| Placeholders Spec | `patientId (guid)`, `windowDays (int, default 180)`, `endDate (date)` |
| Validators        | `windowDays` → `min:1`, `max:365`; `patientId` → `non-empty`          |
| Examples          | "How many assessments has this patient had in the last 180 days?"     |
| Keywords          | `count`, `assessments`, `time window`, `patient`                      |
| Warnings to watch | Ensure `TOP` limit present, confirm `rpt.` prefixes everywhere        |

## Troubleshooting & Tips

- **Validation errors on import**: Run `npm run seed-template-catalog` after editing JSON; follow the error message to align placeholders/slots.
- **Warnings only**: Publishing is allowed, but address warnings before promoting high-impact templates. Document any intentional deviations.
- **Array placeholders**: Treat them as comma-delimited lists. The Apply Template wizard renders chips/combobox if `validators` include `non-empty` and `semantic` hints.
- **Testing**: Stage 7 introduces the gold-set parity run. Until then, manually execute the generated SQL in a safe environment before approving.
- **Version rollback**: Disable `AI_TEMPLATES_ENABLED` to fall back to the legacy JSON catalog or restore a previous database snapshot. The rollback SQL (`database/migration/011_rollback_template_catalog.sql`) removes the tables if needed.

## Reference Checklist

- [ ] Name and intent defined.
- [ ] SQL pattern validated (no dangerous keywords, correct schema prefixes).
- [ ] All placeholders declared in `placeholdersSpec` with correct types.
- [ ] Validators and defaults make sense for UI slot filling.
- [ ] Examples cover keywords and expected variants.
- [ ] Template publishes cleanly (errors resolved, warnings acknowledged).
- [ ] Runtime smoke test performed with `AI_TEMPLATES_ENABLED=true` in dev.

---

For questions, ping `@data-insights-team` or open a thread in `#ai-insights`.
