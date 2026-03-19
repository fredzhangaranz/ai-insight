# Schema Alignment & Validation

## Schema sources

| Source | Purpose |
|-------|---------|
| `docs/design/semantic_layer/silhouette_dbo_schema.sql` | Reference DDL; may lag behind live DB |
| `lib/services/schema-introspection.service.ts` | Live schema discovery (INFORMATION_SCHEMA) |
| `lib/services/data-gen/schema-discovery.service.ts` | Form fields, attribute types for data gen |

**Recommendation:** When adding new tables/columns to generators, prefer schema introspection or verify against the live database. The doc schema can drift.

---

## Validation: patientIds parameter (fixed 2026-03)

### Root cause

`validateInsertedData()` in `execution-helpers.ts` failed with:

```
Validation failed for parameter 'patientIds'. Invalid string.
```

Two issues:

1. **Wrong parameter type:** The mssql driver does not accept arrays for `.input("name", array)`. It expects scalar values. For `IN (@p1, @p2, ...)` you must add each value as a separate parameter.

2. **Wrong IDs:** The execute route passed `result.insertedIds` (Series IDs) to validation. The query filters by `w.patientFk IN (...)`, so it requires **patient IDs**, not Series IDs.

### Fix

- **execution-helpers.ts:** Build the IN clause with individual params (`@pid0`, `@pid1`, …) and `.input(\`pid${i}\`, sql.UniqueIdentifier, id)`.
- **assessment.generator.ts:** Return `insertedPatientIds` (unique patient IDs that received data).
- **execute route:** Pass `result.insertedPatientIds` to `validateInsertedData()` for `assessment_bundle`.

---

## mssql IN-clause pattern

When passing a list of IDs to an `IN` clause:

```ts
const ids = ["uuid-1", "uuid-2"];
const req = db.request();
const placeholders = ids
  .map((_, i) => {
    req.input(`pid${i}`, sql.UniqueIdentifier, ids[i]);
    return `@pid${i}`;
  })
  .join(", ");
await req.query(`SELECT * FROM dbo.Wound WHERE patientFk IN (${placeholders})`);
```

Do **not** use `.input("patientIds", ids)` — the driver rejects arrays.
