# Semantic Layer System Documentation

**Version:** 1.0  
**Status:** Design Complete, Ready for Implementation  
**Last Updated:** 2025-10-12

---

## Overview

This directory contains comprehensive design documentation for the **Semantic Layer System**—a critical enhancement to InsightGen that enables multi-customer analytics with automatic adaptation to customer-specific form configurations.

## Documents

### 1. [Semantic Layer Design](./semantic_layer_design.md) ⭐ **START HERE**

**Main comprehensive design document** covering:

- Executive summary and strategic context (WrenAI analysis)
- Background, motivation, and problem statement
- Goals, principles, and architecture
- All system components in detail
- Implementation roadmap (8 phases)
- MVP scope and success criteria
- Key use cases and risk analysis

**Read this first** for complete understanding of the system.

---

### 2. [Database Schema](./database_schema.md)

Complete database schema reference including:

- PostgreSQL tables (Customer, CustomerFormDefinition, SemanticIndex, ClinicalOntology, SchemaVersionRegistry)
- MS SQL Server demo data extensions
- Complete DDL with indexes
- Example queries for common operations
- Migration strategies

**Use this** when implementing database layer.

---

### 3. [API Specification](./api_specification.md)

REST API documentation covering:

- Customer management endpoints
- Semantic layer operations (context discovery, terminology mapping)
- Demo data management
- Schema version management
- Request/response examples
- Error responses and rate limiting

**Use this** when implementing backend APIs.

---

### 4. [Workflows & UI Design](./workflows_and_ui.md)

User experience documentation including:

- User personas (Developer, Consultant, Admin)
- Customer onboarding workflow (step-by-step)
- SQL generation workflow
- Customer context switching
- Semantic mapping review
- UI wireframes (ASCII/text format)
- CLI command reference

**Use this** when implementing frontend and user workflows.

---

### 5. [Clinical Ontology](./clinical_ontology.yaml)

YAML specification of clinical concepts including:

- Wound classifications (diabetic_ulcer, pressure_injury, venous_ulcer, etc.)
- Treatment interventions (advanced_dressing, negative_pressure, compression, etc.)
- Infection status, wound states, tissue types
- Outcome metrics (healing_rate, time_to_closure, etc.)
- Anatomical locations and exudate characteristics
- Synonyms, aliases, and clinical metadata

**Use this** to load the clinical ontology into PostgreSQL.

---

## Quick Start

### For Implementation Planning:

1. Read [Semantic Layer Design](./semantic_layer_design.md) (Section 11: Implementation Roadmap)
2. Review [Database Schema](./database_schema.md) for Phase 1 tables
3. Check [API Specification](./api_specification.md) for endpoint definitions

### For Backend Development:

1. Implement [Database Schema](./database_schema.md) (PostgreSQL + MS SQL)
2. Load [Clinical Ontology](./clinical_ontology.yaml) into database
3. Build APIs from [API Specification](./api_specification.md)

### For Frontend Development:

1. Review [Workflows & UI Design](./workflows_and_ui.md)
2. Implement UI wireframes
3. Connect to APIs from [API Specification](./api_specification.md)

---

## System Architecture (Quick Reference)

```
┌───────────────────────────────────────────────────────┐
│              InsightGen (Vendor Network)               │
│                                                        │
│  ┌──────────────┐              ┌──────────────────┐   │
│  │  PostgreSQL  │              │  MS SQL Server   │   │
│  │  (Metadata)  │              │  (Demo Data)     │   │
│  │              │              │                  │   │
│  │ • Customers  │              │ • Synthetic Data │   │
│  │ • Forms      │              │ • Per-Customer   │   │
│  │ • Semantics  │              │ • For Validation │   │
│  │ • Ontology   │              │                  │   │
│  └──────────────┘              └──────────────────┘   │
│                                                        │
└───────────────────────────────────────────────────────┘
           ↑ Import Metadata (XML)
           │ NO customer production data access
           │
┌──────────┴────────────────────────────────────────────┐
│          Customer Silhouette Production DB             │
│          (Export XML only, read-only)                  │
└───────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Clinical Ontology (Universal)

Clinical concepts that never change:

- "Diabetic ulcer" as a wound classification
- "Healing rate" as an outcome metric
- Standard terminology across all customers

### Semantic Mapping (Per-Customer)

How each customer implements clinical concepts:

- Customer A: "Etiology" field with "Diabetic Foot Ulcer"
- Customer B: "Wound Cause" field with "DFU"
- Both map to the same concept: `diabetic_ulcer`

### Demo Data (Per-Customer)

Synthetic data matching customer's form structure:

- Generated from imported form configurations
- Realistic distributions and progressions
- Used for SQL validation (never touches production)

### Agentic Discovery

Intelligent system behavior:

- Understands user intent from questions
- Discovers relevant forms automatically
- Maps terminology to customer-specific values
- Generates customer-adapted SQL

---

## Implementation Timeline

| Phase | Duration  | Focus       | Deliverable                       |
| ----- | --------- | ----------- | --------------------------------- |
| 1     | 2-3 weeks | Foundation  | Customer registry + XML import    |
| 2     | 2-3 weeks | Ontology    | Clinical concepts with embeddings |
| 3     | 3-4 weeks | Indexing    | Auto-map forms to concepts        |
| 4     | 3-4 weeks | Demo Data   | Generate synthetic data           |
| 5     | 3-4 weeks | Discovery   | Agentic context discovery         |
| 6     | 2-3 weeks | Validation  | SQL validation against demo       |
| 7     | 2-3 weeks | Integration | Connect to existing systems       |
| 8     | 2-3 weeks | Versioning  | Schema version support            |

**MVP Target:** 8-10 weeks (Phases 1-6)

---

## Success Metrics

### Operational

- Customer onboarding: < 5 minutes
- SQL generation: < 30 seconds
- Validation success: > 90%

### Quality

- Semantic mapping confidence: > 85% avg
- SQL accuracy: > 95%
- Demo data integrity: 100%

### Adoption

- Team usage: > 75% within 3 months
- Consultant satisfaction: > 80%

---

## Related Documentation

- **Existing Systems:**

  - Database schema: `lib/database-schema-context.md`
  - Funnel system: `docs/design/query_enrichment.md`
  - Template system: `docs/design/templating_system/`

- **This Design:**
  - Strategic analysis: Section 1 of main design doc
  - Technical deep dive: Sections 4-9 of main design doc
  - Implementation guide: Section 11 of main design doc

---

## Questions or Feedback?

This design document serves as the source of truth for the Semantic Layer system. If you have questions or suggestions:

1. Review the main design document first
2. Check the specific component documentation
3. Consult with the InsightGen team
4. Update documentation as implementation reveals insights

---

## Document Status

✅ **Design Complete** - Ready for implementation planning  
📝 **Next Step** - Create detailed implementation plan from Section 11 of main design doc  
🚀 **Target** - MVP in 8-10 weeks
