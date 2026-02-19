# Bug Fix: String Value Corruption in WHERE Clauses

## Problem
Saved insights returned 0 rows even though the same query in DBeaver returned data. The issue was that table names were being replaced **inside string values**, corrupting WHERE clause conditions.

**What you saw:**
```sql
WHERE ATV.name IN ('Home Wound Assessment', 'Wound Assessment')
```

**What was executed:**
```sql
WHERE ATV.name IN ('Home rpt.Wound rpt.Assessment', 'rpt.Wound rpt.Assessment')
```

The corrupted values don't match anything in the database → 0 rows.

---

## Root Cause

The `validateAndFixQuery()` function in **two places** was using a regex that matched table names everywhere, including inside quoted strings:

```typescript
// BUG: Matches everywhere (even in strings!)
const tableRegex = /(?<!rpt\.)(Assessment|Patient|Wound|...)\b/g;
sql = sql.replace(tableRegex, "rpt.$1");
```

---

## The Fix

Changed to only match in FROM/JOIN contexts:

```typescript
// Only matches after FROM or JOIN keywords - never in strings
const fromJoinPattern = new RegExp(
  `(FROM|JOIN)\\s+(?!rpt\\.)${tableName}\\b`,
  "gi"
);
sql = sql.replace(fromJoinPattern, `$1 rpt.${tableName}`);
```

This preserves string values while still prefixing table references.

---

## Files Modified

1. **lib/services/semantic/customer-query.service.ts**
   - Lines 99-162: Fixed `validateAndFixQuery()`
   - Lines 70-86: Enhanced query logging

2. **lib/services/insight.service.ts** (critical for your saved insight!)
   - Lines 79-129: Fixed `validateAndFixQuery()`
   - Lines 303-404: Enhanced `execute()` logging

---

## Test Coverage

✅ 15 tests passing
- Validates string values are preserved
- Validates table names in FROM/JOIN are still prefixed
- Tests your exact WHERE clause scenario

---

## How to Test

1. Server should auto-reload (pnpm dev watching)
2. Execute your saved insight "Wound created between March 24 and August 25"
3. Should return 15 rows now!

**Check logs for:**
```
[InsightService.execute] ✅ Query completed in XXXms, returned 15 rows
```

If still 0 rows, check the logged SQL for string corruption.

---

**Status:** ✅ Fixed and tested. String values are now preserved correctly.
