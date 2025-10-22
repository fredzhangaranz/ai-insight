# Semantic Layer Documentation Index

**Last Updated:** 2025-10-22  
**Status:** Design Complete + Phase 3 Extended Scope Defined

---

## 📚 Quick Navigation

### For High-Level Understanding
Start here to understand the big picture:

1. **[README.md](./README.md)** - Overview and quick start guide
2. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - TL;DR answers to common questions
3. **[PHASE3_EXTENDED_SCOPE.md](./PHASE3_EXTENDED_SCOPE.md)** - **NEW**: What Phase 3 now covers

### For Deep Technical Details
Comprehensive documentation for implementation:

1. **[semantic_layer_design.md](./semantic_layer_design.md)** - Complete architectural design
   - §7.4: Cross-domain semantic discovery (NEW)
2. **[database_schema.md](./database_schema.md)** - Database table definitions
   - §1.3.1-1.3.3: Non-form metadata tables (NEW)
3. **[api_specification.md](./api_specification.md)** - REST API endpoints
4. **[workflows_and_ui.md](./workflows_and_ui.md)** - User workflows and UI design

### For Multi-Form Queries
Understanding how complex queries work:

1. **[PHASE3_MULTI_FORM_RESOLUTION.md](./PHASE3_MULTI_FORM_RESOLUTION.md)** - Form-only multi-form resolution
2. **[PHASE3_EXTENDED_SCOPE.md](./PHASE3_EXTENDED_SCOPE.md)** - Form + non-form + relationships

### For Implementation & Execution
Planning and tracking work:

1. **[semantic_implementation_todos.md](../../../todos/in-progress/semantic_implementation_todos.md)** - Implementation plan (link)
   - Phase 3: 12 tasks (extended from 4)
2. **[ONTOLOGY_LOADER_GUIDE.md](./ONTOLOGY_LOADER_GUIDE.md)** - Loading clinical ontology
3. **[SILHOUETTE_VERSION_AUTO_DETECTION.md](./SILHOUETTE_VERSION_AUTO_DETECTION.md)** - Version detection strategy

### Architecture Evolution
Understanding the design evolution:

1. **[ARCHITECTURE_V2_SUMMARY.md](./ARCHITECTURE_V2_SUMMARY.md)** - v2.0 architecture summary
2. **[BEFORE_AFTER_COMPARISON.md](./BEFORE_AFTER_COMPARISON.md)** - v1.0 vs v2.0 comparison
3. **[REVISED_ARCHITECTURE.md](./REVISED_ARCHITECTURE.md)** - Architecture revision details
4. **[V2_UPDATE_SUMMARY.md](./V2_UPDATE_SUMMARY.md)** - v2.0 update summary

### Reference Data
Constants and configuration:

1. **[clinical_ontology.yaml](./clinical_ontology.yaml)** - Universal clinical concepts
2. **[silhouette_dbo_schema.sql](./silhouette_dbo_schema.sql)** - Silhouette reference schema

---

## 🎯 Common Question → Document Mapping

| Question | Document | Section |
|----------|----------|---------|
| "What is the semantic layer?" | README.md | Overview |
| "How do I get started?" | README.md | Quick Start |
| "How does Phase 3 work?" | semantic_layer_design.md | §7.2-7.4 |
| "How do multi-form queries work?" | PHASE3_MULTI_FORM_RESOLUTION.md | All |
| "How do form + non-form queries work?" | PHASE3_EXTENDED_SCOPE.md | All |
| "What are the database tables?" | database_schema.md | §1.3 |
| "What new tables for non-forms?" | database_schema.md | §1.3.1-1.3.3 |
| "What are the API endpoints?" | api_specification.md | All |
| "How do users interact with it?" | workflows_and_ui.md | All |
| "What's the implementation plan?" | semantic_implementation_todos.md | Phase 3 |
| "How do I load the ontology?" | ONTOLOGY_LOADER_GUIDE.md | All |
| "What changed from v1.0?" | BEFORE_AFTER_COMPARISON.md | All |

---

## 🔄 Phase 3 Scope Expansion

### Original Phase 3 (Form-Only)
- Map form fields to clinical concepts
- Store in 3 tables: SemanticIndex, SemanticIndexField, SemanticIndexOption
- Enable form-centric questions

### Extended Phase 3 (Form + Non-Form + Relationships)
- Map form fields (unchanged)
- **Map non-form rpt.* columns to concepts** (NEW)
- **Discover entity relationships** (NEW)
- **Map non-form values to categories** (NEW)
- Store in 6 tables (3 form + 3 non-form)
- Enable ANY question

**See:** `PHASE3_EXTENDED_SCOPE.md` for complete explanation

---

## 📊 Document Relationships

```
┌─────────────────────────────────────────────────────┐
│          semantic_layer_design.md (Main Design)    │
│  • Overall architecture                             │
│  • 8-phase implementation roadmap                   │
│  • All system components                            │
│  • Section 7.4: Cross-domain discovery (NEW)       │
└─────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
  ┌─────────────┐    ┌──────────────┐   ┌──────────────┐
  │ database_   │    │ api_         │   │ workflows_   │
  │ schema.md   │    │ specification│   │ and_ui.md    │
  │ (DB DDL)    │    │ (API routes) │   │ (UX flows)   │
  │ §1.3.1-1.3.3│   │ (all)        │   │ (all)        │
  │ (NEW)       │    │              │   │              │
  └─────────────┘    └──────────────┘   └──────────────┘
        ↓
  ┌─────────────────────────────────────────────────────┐
  │    PHASE3_MULTI_FORM_RESOLUTION.md (Form-Only)     │
  │  • Example: Form-centric multi-form queries         │
  │  • How SemanticIndex enables joins                  │
  └─────────────────────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────────────────────┐
  │    PHASE3_EXTENDED_SCOPE.md (Form+NonForm) (NEW)   │
  │  • Extended Phase 3 requirements                    │
  │  • Non-form + relationship discovery                │
  │  • 4-part discovery process                         │
  │  • Example: Your AML Clinic query                   │
  └─────────────────────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────────────────────┐
  │  semantic_implementation_todos.md (Tasks) (UPDATE)  │
  │  • Phase 3: 12 tasks (was 4)                        │
  │  • Tasks 6-12: Non-form discovery (NEW)             │
  │  • Implementation timeline                          │
  └─────────────────────────────────────────────────────┘
```

---

## ✅ Phase 3 Completion Status

### Tasks 1-5: Form Indexing (COMPLETED ✅)
- [x] Database: ClinicalOntology + pgvector
- [x] Ontology loader job
- [x] Semantic search API
- [x] Admin UI for ontology
- [x] Admin CRUD APIs

### Tasks 6-12: Non-Form Discovery (PENDING ⏳)
- [ ] Non-form metadata tables (database migration)
- [ ] Non-form schema discovery service
- [ ] Entity relationship discovery service
- [ ] Non-form value mapping service
- [ ] Extended discovery API
- [ ] Cross-domain semantic review UI
- [ ] Integration tests

**Progress:** 5 of 12 (42%)

---

## 📖 How to Use This Documentation

### If You're...

**👤 New to the project**
1. Read: README.md (overview)
2. Read: QUICK_REFERENCE.md (concepts)
3. Read: semantic_layer_design.md §1-6 (architecture)

**🏗️ Implementing Phase 3**
1. Read: PHASE3_EXTENDED_SCOPE.md (scope)
2. Read: database_schema.md §1.3.1-1.3.3 (tables)
3. Check: semantic_implementation_todos.md (tasks)

**🔍 Fixing a Phase 3 bug**
1. Find the task in: semantic_implementation_todos.md
2. Reference the design in: semantic_layer_design.md §7.4
3. Check the schema in: database_schema.md §1.3.1-1.3.3

**📝 Writing SQL against semantic indexes**
1. Read: PHASE3_MULTI_FORM_RESOLUTION.md (form examples)
2. Read: PHASE3_EXTENDED_SCOPE.md (non-form examples)
3. Reference: database_schema.md §1.3 (all tables)

---

## 🔗 External References

- Silhouette Schema: `silhouette_dbo_schema.sql`
- Clinical Ontology: `clinical_ontology.yaml`
- Implementation Status: `semantic_implementation_todos.md`

---

## 📝 Recent Updates (2025-10-22)

- ✅ Added Section §7.4 to semantic_layer_design.md (cross-domain discovery)
- ✅ Added Sections §1.3.1-1.3.3 to database_schema.md (non-form tables)
- ✅ Extended semantic_implementation_todos.md (Tasks 6-12)
- ✅ Created PHASE3_EXTENDED_SCOPE.md (comprehensive guide)
- ✅ Created INDEX.md (this file)

---

**For questions or clarifications, refer to the main design document:**  
`semantic_layer_design.md` (§7.4 for cross-domain topics)

