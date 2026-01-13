# Semantic Layer Architecture v2.0: Summary of Changes

**Date:** 2025-10-20  
**Approvers:** Software Architect, Development Team  
**Status:** ✅ Approved

---

## TL;DR

Your team's feedback **dramatically simplified** the architecture while maintaining all core value propositions. We eliminated XML parsing, simplified customer management, and made the system more aligned with operational reality.

**Key Changes:**

1. ✅ Per-customer per-database setup (not multi-tenant in one DB)
2. ✅ Use Silhouette's native form import (eliminate XML parser)
3. ✅ Generate demo data into `dbo` tables (verifiable in Silhouette UI)
4. ✅ Dual-purpose system (SQL validation + release testing)

**Result:** Same value, **5 weeks faster**, operationally simpler.

---

## What Changed and Why

### 1. Per-Customer Database Setup ✅

**OLD Approach (v1.0):**

```
Single Silhouette Demo Database
├─ CustomerA data (tagged with customerCode)
├─ CustomerB data (tagged with customerCode)
└─ CustomerC data (tagged with customerCode)

Problem: Naming conflicts, version conflicts, complex isolation
```

**NEW Approach (v2.0):**

```
CustomerA → Silhouette Demo DB A (separate instance, v5.0)
CustomerB → Silhouette Demo DB B (separate instance, v6.0)
CustomerC → Silhouette Demo DB C (separate instance, v5.0)

Benefits: Clean isolation, version flexibility, production-like setup
```

**Why This is Better:**

- ✅ Zero risk of cross-contamination
- ✅ Different Silhouette versions per customer (realistic)
- ✅ Easy cleanup (drop entire database if needed)
- ✅ Mirrors how production actually works
- ✅ Only 3-5 customers (small scale, easy to maintain)

**Implementation Impact:**

- **Removed:** Multi-tenant isolation logic in demo database
- **Added:** Connection string management per customer
- **Simplified:** Data generation (one customer at a time)

---

### 2. Eliminate XML Parser (Use Silhouette's Native Import) ✅

**OLD Approach (v1.0):**

```
Customer Form XML → InsightGen Parser → Validate → Store in PostgreSQL

Required:
- XML parsing service (1 week)
- Form storage schema (complex)
- Import validation logic
- Error handling for XML variations
```

**NEW Approach (v2.0):**

```
Customer Form XML → Silhouette's Native Import UI → Customer's dbo database
InsightGen → Query dbo.AttributeType directly → Discover forms

Required:
- Simple database query
- Connection to customer database
```

**Why This is Better:**

- ✅ **Silhouette already handles XML parsing** (proven, tested)
- ✅ IT admin familiar with Silhouette's import process
- ✅ No risk of parsing errors or version incompatibilities
- ✅ Forms always match what Silhouette expects
- ✅ One less thing to maintain

**Implementation Impact:**

- **Removed:**
  - `lib/services/form-parser.service.ts` (~500 lines)
  - `CustomerFormDefinition` table (PostgreSQL)
  - Import job queue
  - File upload UI
- **Added:**
  - `lib/services/form-discovery.service.ts` (simple DB query, ~100 lines)
- **Time Saved:** ~2 weeks

---

### 3. Generate Demo Data into `dbo` Schema ✅

**OLD Approach (v1.0):**

```
Generate → rpt.* tables directly
         └─ Add customerCode columns
         └─ Add isGenerated flags
         └─ Query against rpt for validation

Problem: Not verifiable, doesn't test real pipeline
```

**NEW Approach (v2.0):**

```
Generate → dbo.* tables (source of truth)
         ↓
    Hangfire Sync (5 minutes)
         ↓
    rpt.* tables (reporting layer)
         ↓
    SQL Validation

Bonus: View in Silhouette UI!
```

**Why This is Better:**

- ✅ **Can view generated data in Silhouette UI** (visual verification!)
- ✅ Tests actual data pipeline (dbo → Hangfire → rpt)
- ✅ If SQL works here, it works in production
- ✅ **Solves release testing problem** (dual-purpose system)
- ✅ Zero schema modifications to Silhouette

**Implementation Impact:**

- **Changed:** Target schema from `rpt.*` to `dbo.*`
- **Added:** Hangfire sync waiting logic
- **Added:** Silhouette UI verification workflow
- **Benefit:** Higher confidence in delivered SQL

---

### 4. Customer Registry Simplified ✅

**OLD Approach (v1.0):**

```sql
-- Complex customer tracking
Customer table
CustomerFormDefinition table (stores full XML)
CustomerImportJob table (job queue)
CustomerImportJobFile table (file tracking)

Total: 4 tables, complex workflows
```

**NEW Approach (v2.0):**

```sql
-- Simple customer registry
CREATE TABLE "Customer" (
  id UUID PRIMARY KEY,
  code VARCHAR(50) UNIQUE,
  name VARCHAR(255),
  silhouette_db_connection_string TEXT, -- Encrypted
  silhouette_version VARCHAR(20),
  silhouette_web_url TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
);

Total: 1 table, simple CRUD
```

**Why This is Better:**

- ✅ Much simpler data model
- ✅ Connection strings are the only "import" needed
- ✅ Forms live in their natural home (Silhouette DB)
- ✅ Easy to understand and maintain

**Implementation Impact:**

- **Removed:** 3 tables, import job system
- **Added:** Connection string encryption
- **Simplified:** Customer management UI

---

## What Stayed the Same (Core Value)

These components are **unchanged** and still deliver the same value:

### ✅ Clinical Ontology (Universal)

- Still PostgreSQL-based with vector embeddings
- Still 10-15 core wound care concepts
- Still semantic search capability

### ✅ Semantic Indexing

- Still automatic field-to-concept mapping
- Still confidence scoring
- Still manual override capability
- **Only changed:** Source is `dbo.AttributeType` query instead of XML parsing

### ✅ Context Discovery (Agentic)

- Still intent classification
- Still form discovery (via semantic search)
- Still terminology mapping
- Still join path planning

### ✅ SQL Generation & Validation

- Still enhanced with semantic context
- Still customer-specific terminology
- Still validates against demo data
- **Bonus:** Can verify in Silhouette UI

### ✅ Template System Integration

- Still semantic template matching
- Still template adaptation
- Still learning from corrections

---

## Benefits Summary

### Time Savings

| Phase                       | Old Duration | New Duration | Saved        |
| --------------------------- | ------------ | ------------ | ------------ |
| Phase 1 (Foundation)        | 3 weeks      | 2 weeks      | -1 week      |
| Phase 3 (Semantic Indexing) | 3 weeks      | 2 weeks      | -1 week      |
| Phase 4 (Demo Data)         | 4 weeks      | 4 weeks      | 0 weeks      |
| Phase 7 (Integration)       | 2 weeks      | 1 week       | -1 week      |
| **Total**                   | **23 weeks** | **18 weeks** | **-5 weeks** |

**MVP Ready:** 14 weeks instead of 18 weeks (**1 month faster**)

### Operational Simplicity

| Aspect                 | v1.0                     | v2.0                         |
| ---------------------- | ------------------------ | ---------------------------- |
| Customer Setup         | Complex import workflow  | Simple connection string     |
| Form Import            | Custom XML parser        | Use Silhouette's UI          |
| Demo Data Verification | Query rpt tables         | View in Silhouette UI        |
| Maintenance            | 10+ tables               | 3 core tables                |
| Failure Points         | XML parsing, import jobs | Connection string, DB access |

### Quality Improvements

1. **Visual Verification** ✅

   - Can open Silhouette and see generated assessments
   - Immediate feedback on data quality
   - Catches issues before SQL generation

2. **Production Realism** ✅

   - Uses actual dbo tables (not mock rpt structure)
   - Tests Hangfire ETL pipeline
   - Validates FK constraints naturally

3. **Dual Purpose** ✅

   - Primary: SQL validation for consultants
   - Secondary: Release testing data generation for dev team
   - Stronger ROI justification

4. **Simpler Debugging** ✅
   - Fewer moving parts
   - Direct database queries (no file parsing)
   - Standard Silhouette workflows

---

## What You Need to Provide

To proceed with implementation, we need:

### 1. dbo Schema Information

**Why:** Need to understand table structure for data generation

**Options:**

- Export DDL from a customer database
- Provide ER diagram
- Let me connect and explore (connection string)

**Tables we need:**

- `dbo.Patient`
- `dbo.Wound`
- `dbo.Assessment`
- `dbo.Note`
- `dbo.Measurement`
- `dbo.AttributeType`
- `dbo.AssessmentTypeVersion`
- `dbo.Unit` (for FK references)

### 2. Hangfire Job Information

**Why:** Need to sync data from dbo → rpt after generation

**Questions:**

- What's the stored procedure or job name?
- Can we trigger it manually (e.g., `EXEC dbo.SyncReportingTables`)?
- Or should we just wait for auto-sync (5 minutes)?
- How do we know when sync is complete?

### 3. Release Testing Requirements

**Why:** Want to support your team's release testing use case

**Questions:**

- What data volumes do you need? (patients, assessments)
- Any specific scenarios? (healed wounds, infections, diabetic patients)
- Current pain points in test data generation?
- Timeline for adopting this for release testing?

---

## Next Steps

### Immediate (This Week)

1. ✅ Review and approve this architecture change
2. ✅ Provide dbo schema information
3. ✅ Provide Hangfire job details
4. ✅ Update project timeline

### Phase 1 (Weeks 1-2)

1. Implement Customer registry (PostgreSQL)
2. Build Customer management UI
3. Implement connection string encryption
4. Implement form discovery (query `dbo.AttributeType`)
5. Test with 1 real customer database

### Phase 2 (Weeks 3-4)

1. Load Clinical Ontology
2. Implement semantic search
3. Test ontology queries

### Phase 3 (Weeks 5-6)

1. Implement semantic indexing (from dbo queries)
2. Build mapping review UI
3. Test with 2 customers

### Phase 4 (Weeks 7-10)

1. Document dbo schema
2. Implement data generators (dbo tables)
3. Implement Hangfire sync wait logic
4. Build demo data UI
5. **Verify in Silhouette UI**

---

## Risk Mitigation

### Risk: dbo Schema Complexity

**Mitigation:**

- Start with schema documentation phase
- Build generators incrementally
- Test each generator independently
- Validate in Silhouette UI before proceeding

### Risk: Hangfire Sync Timing

**Mitigation:**

- Build polling logic with timeout
- Allow manual trigger if possible
- Document expected sync times
- Add retry logic

### Risk: Connection String Security

**Mitigation:**

- AES-256 encryption
- Environment variable for key
- Audit logging for access
- Admin-only access to management UI

### Risk: FK Constraint Violations

**Mitigation:**

- Query existing Unit IDs before generation
- Use transactions (rollback on error)
- Validate FK references before insert
- Test with small batches first

---

## Questions for Discussion

1. **dbo Schema:** Can you share the DDL or provide a connection string to a demo database?

2. **Hangfire Job:** Name of the sync job? Can we trigger it manually?

3. **Release Testing:** What scenarios should we prioritize?

4. **Timeline:** Target date for MVP (14 weeks from now)?

5. **IT Support:** How much IT admin time is available for database setup?

6. **Security:** Any additional requirements for connection string storage?

---

## Conclusion

Your team's insights have **dramatically improved** the architecture:

**Eliminated Complexity:**

- ❌ XML parser
- ❌ Form storage in PostgreSQL
- ❌ Multi-tenant isolation logic
- ❌ Import job queue

**Added Value:**

- ✅ Silhouette UI verification
- ✅ Release testing support
- ✅ Simpler operations
- ✅ 5 weeks faster delivery

**Maintained Core Value:**

- ✅ Customer-specific SQL generation
- ✅ Automatic terminology mapping
- ✅ SQL validation before delivery
- ✅ Schema version support

This is a **win-win** architecture change. Same goals, better path.

---

**Ready to proceed?** Let's start with Phase 1: Customer Registry and Form Discovery.

**Questions?** See above discussion points.

**Documentation:**

- Full design: `docs/design/semantic_layer/REVISED_ARCHITECTURE.md`
- Implementation plan: `docs/todos/in-progress/semantic_implementation_todos.md`
