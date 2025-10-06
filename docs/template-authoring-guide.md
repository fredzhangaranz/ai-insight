# Template Authoring Guide

**Last Updated:** 2025-10-06  
**Related:** [Template System Design](./design/templating_system/template_improvement_design.md), [UI Mockups](./design/templating_system/template_system_ui_mockups.md), [Implementation Plan](./todos/template_system_mvp_implementation_plan.md)

## Purpose

This guide explains how to author, validate, and promote SQL templates for the AI funnel. It covers the end-to-end lifecycle (Draft → Approved → Deprecated), required metadata, validation rules, and best practices for keeping templates reliable and backwards compatible.

## Lifecycle Overview

| Stage      | Description                                                                 | Allowed actions                                   |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------- |
| Draft      | Work-in-progress template visible only to developers.                       | Edit metadata, SQL, placeholders, examples.       |
| Approved   | Active template eligible for runtime selection and prompt injection.        | Read-only except via new Draft version.           |
| Deprecated | Historical template kept for audit/telemetry; excluded from runtime use.    | Optionally superseded by new versions; no edits.  |

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

| Field        | Type     | Required | Description                                                                 |
| ------------ | -------- | -------- | --------------------------------------------------------------------------- |
| `name`       | string   | ✅       | Placeholder identifier used inside `{}` in `sqlPattern`. No spaces; camelCase preferred. |
| `type`       | string   | ❌       | One of `guid`, `int`, `string`, `date`, `boolean`, `float`, `decimal`.       |
| `semantic`   | string   | ❌       | Semantic hint for downstream integrations (`patient_id`, `wound_id`, etc.).  |
| `required`   | boolean  | ❌       | Defaults to `true`. If `false`, UI treats the slot as optional.              |
| `default`    | any      | ❌       | Default value or SQL expression (`GETUTCDATE()`).                            |
| `validators` | string[] | ❌       | Additional validation rules (`non-empty`, `min:1`, `max:365`, `regex:^A`).   |

**Normalization:** Array or optional placeholders should be declared without suffixes. For example, SQL may use `{variableNames}` while the UI surface uses chips or multi-select; the validator normalizes `{variableNames[]}` / `{variableNames?}` to `variableNames` for integrity checks.

### Common Placeholder Patterns

```json
{
  "slots": [
    { "name": "patientId", "type": "guid", "semantic": "patient_id", "validators": ["non-empty"] },
    { "name": "windowDays", "type": "int", "default": 180, "validators": ["min:1", "max:365"] },
    { "name": "endDate", "type": "date", "default": "GETUTCDATE()" },
    { "name": "variableNames", "type": "string", "semantic": "attribute_name", "validators": ["non-empty"] },
    { "name": "topK", "type": "int", "default": 10, "validators": ["min:1", "max:100"] }
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

| Rule                           | Level     | Description                                                                    |
| ------------------------------ | --------- | ------------------------------------------------------------------------------ |
| Dangerous keywords (`DROP`, `DELETE`, etc.) | ❌ Error | Query must remain read-only.                                                   |
| Non-`SELECT`/`WITH` prefix     | ⚠️ Warning | Allowed for fragments but discouraged; ensure safe usage.                      |
| Missing `rpt.` schema prefixes | ⚠️ Warning | Heuristic reminder to reference warehouse tables explicitly.                   |
| Missing declaration            | ❌ Error | Placeholders must be defined in `placeholdersSpec` or `placeholders`.          |
| Duplicate slot names           | ❌ Error | Each slot name must be unique.                                                 |
| Unknown slot type              | ⚠️ Warning | Non-standard types are allowed but should be justified in comments/docs.       |
| Non-string validators          | ⚠️ Warning | Coerce complex validators to string descriptors.                               |

To avoid runtime safety fixes, add `TOP 1000` (or relevant limit) and ensure filters use `rpt.DimDate` and other canonical tables when applicable.

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

| Field               | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Name                | `Count Assessments by Time Window`                                     |
| Intent              | `aggregation_by_category`                                              |
| SQL Pattern         | `SELECT COUNT(DISTINCT A.id)... WHERE A.patientFk = {patientId}`        |
| Placeholders Spec   | `patientId (guid)`, `windowDays (int, default 180)`, `endDate (date)`   |
| Validators          | `windowDays` → `min:1`, `max:365`; `patientId` → `non-empty`            |
| Examples            | "How many assessments has this patient had in the last 180 days?"     |
| Keywords            | `count`, `assessments`, `time window`, `patient`                       |
| Warnings to watch   | Ensure `TOP` limit present, confirm `rpt.` prefixes everywhere         |

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
