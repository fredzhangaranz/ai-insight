# Template System Documentation Guide

**Last Updated:** 2025-10-06

## Documentation Organization

The Template System documentation is organized into **separate, focused documents** to improve maintainability, readability, and ease of navigation for different audiences.

### 📚 Document Structure

```
docs/
├── design/templating_system/
│   ├── template_improvement_design.md         ← Architecture & Data Model
│   ├── template_system_ui_mockups.md          ← UI/UX Specifications (NEW)
│   └── TEMPLATE_SYSTEM_DOCS_README.md         ← This file
│
├── todos/
│   └── template_system_mvp_implementation_plan.md  ← Stage-by-stage development plan
│
└── database/migration/
    └── 011_create_template_catalog.sql        ← Database schema
```

---

## Document Purposes

### 1. [template_improvement_design.md](./template_improvement_design.md)

**Audience:** Backend developers, architects, product managers

**Purpose:** High-level architecture, data model, and system design

**Contents:**

- Architecture overview (Template Registry, Selector, Prompt Integrator)
- Data model & versioning strategy
- API surface (endpoints, request/response)
- Selection & ranking logic
- Validation strategy (consolidated validator)
- Evaluation protocol & metrics
- Security & compatibility considerations
- Phase 1 vs Phase 2 breakdown

**When to Use:**

- Understanding system architecture
- Planning backend implementation
- Reviewing data flow and integration points
- Understanding versioning and governance model

---

### 2. [template_system_ui_mockups.md](./template_system_ui_mockups.md) ⭐ NEW

**Audience:** Frontend developers, UI/UX designers, product managers

**Purpose:** Detailed UI specifications and mockups for all user-facing components

**Contents:**

- **Template Editor Modal** (5 tabs: Basic Info, SQL Pattern, Placeholders, Examples, Preview)
  - Enhanced placeholdersSpec UX with Simple/Advanced modes
  - Quick setup presets (Patient Filter, Time Window, etc.)
  - Schema integration with UI preview
- **Template Admin Page** (Browse/Manage)
  - Grid/List/Table views
  - Search, filter, sort capabilities
  - Template cards with stats
  - Template Detail view (6 tabs)
- **Apply Template Wizard** (Slot-filling)
  - Required vs. optional fields
  - Schema-powered dropdowns
  - Real-time SQL preview
- **Funnel Panel Enhancements**
  - Matched template section
  - Save as template action
- **Field Mapping Reference** (user-entered vs. auto-generated)
- **Component Usage Guidelines** (shadcn/ui mappings)
- **Accessibility & Responsive Design**

**When to Use:**

- Implementing frontend components
- Understanding user workflows
- Designing UI interactions
- Planning component architecture
- Validating UX with stakeholders

---

### 3. [template_system_mvp_implementation_plan.md](../todos/template_system_mvp_implementation_plan.md)

**Audience:** Development team, project managers

**Purpose:** Stage-by-stage implementation plan with tasks, tests, and success criteria

**Contents:**

- 8 stages from DB schema to production release
- Stage 0: Scope & compatibility gates
- Stage 1: DB schema + migration + seed import
- Stage 2: Consolidated validation service
- Stage 2.5: Documentation (authoring guide)
- Stage 3: Template service + selector
- Stage 4: Developer APIs
- Stage 5: UI implementation
- Stage 6: Provider/runtime integration
- Stage 7: Evaluation harness
- Stage 8: Release & telemetry
- Definition of Done criteria per stage
- Test matrix
- Risk management

**When to Use:**

- Planning sprint work
- Tracking implementation progress
- Understanding dependencies between stages
- Writing tests
- Reviewing completion criteria

---

### 4. [011_create_template_catalog.sql](../../database/migration/011_create_template_catalog.sql)

**Audience:** Database developers, backend developers

**Purpose:** PostgreSQL schema definitions for template catalog

**Contents:**

- Table definitions (Template, TemplateVersion, TemplateUsage)
- Indexes and constraints
- Triggers (auto-update updatedAt)
- Versioning strategy documentation in SQL comments
- placeholdersSpec schema documentation

**When to Use:**

- Running database migrations
- Understanding table structure
- Writing queries
- Planning data access patterns

---

## Why Separate Documents?

### ✅ Benefits of Separation

1. **Focused Content**

   - Each document serves a specific purpose and audience
   - No need to scroll through unrelated sections
   - Easier to find relevant information quickly

2. **Better Maintainability**

   - Changes to UI don't require editing architecture doc
   - UI mockups can evolve independently of data model
   - Less risk of merge conflicts when multiple people edit

3. **Audience-Specific**

   - Frontend devs primarily work from UI mockups
   - Backend devs focus on design doc and implementation plan
   - Product managers can review UI mockups without technical details

4. **Easier Navigation**

   - Smaller files load faster
   - Table of contents more manageable
   - Cross-references via links maintain connections

5. **Parallel Work**
   - UI designers can update mockups while backend devs work on API specs
   - Documentation reviews can be scoped to specific concerns

### 🔗 Cross-References

All documents link to each other in the "Related Documentation" sections:

- Design doc → UI mockups, implementation plan, schema
- UI mockups → Design doc, implementation plan, schema
- Implementation plan → Design doc, UI mockups

---

## Reading Paths by Role

### 🎨 Frontend Developer

**Goal:** Implement template editor and admin UI

**Reading Order:**

1. Start with **UI Mockups** → Tab 1-5 of Template Editor
2. Review **Component Usage Guidelines** in UI Mockups
3. Skim **Design Doc** → "UI/UX Changes" and "API Surface" sections
4. Reference **Implementation Plan** → Stage 5 tasks

**Key Sections:**

- UI Mockups: Template Editor Modal (all tabs)
- UI Mockups: Template Admin Page
- UI Mockups: Apply Template Wizard
- UI Mockups: Field Mapping Reference
- UI Mockups: Component Usage Guidelines

---

### ⚙️ Backend Developer

**Goal:** Implement template APIs and services

**Reading Order:**

1. Start with **Design Doc** → "Architecture Overview" and "Data Model"
2. Review **Database Schema** (SQL file)
3. Read **Implementation Plan** → Stages 1-4 and 6
4. Reference **UI Mockups** → "Field Mapping Reference" to understand what UI sends

**Key Sections:**

- Design Doc: Architecture Overview
- Design Doc: Data Model (Conceptual)
- Design Doc: API Surface
- Design Doc: Selection & Ranking
- Schema: Table definitions and indexes
- Implementation Plan: Stages 1-4, 6

---

### 🧪 QA / Testing

**Goal:** Write test cases and validate functionality

**Reading Order:**

1. Read **UI Mockups** → All user workflows
2. Review **Implementation Plan** → Test matrix and success criteria
3. Reference **Design Doc** → "Evaluation Protocol"

**Key Sections:**

- UI Mockups: Complete user flows (Template Editor, Apply Wizard, Admin Page)
- Implementation Plan: Test Matrix
- Implementation Plan: Success Criteria per stage
- Design Doc: Evaluation Protocol

---

### 📊 Product Manager

**Goal:** Validate features and user experience

**Reading Order:**

1. Start with **UI Mockups** → Complete workflows
2. Review **Design Doc** → "Goals", "Phase 1 vs Phase 2"
3. Check **Implementation Plan** → Definition of Done

**Key Sections:**

- UI Mockups: All sections (visual specs)
- Design Doc: Goals (Short term / Medium term)
- Design Doc: Phase 1 vs Phase 2 Breakdown
- Implementation Plan: Definition of Done

---

### 🏗️ System Architect

**Goal:** Review overall system design and integration

**Reading Order:**

1. Read **Design Doc** in full
2. Review **Database Schema**
3. Skim **UI Mockups** → understand user interactions
4. Review **Implementation Plan** → validate stage breakdown

**Key Sections:**

- Design Doc: Architecture Overview
- Design Doc: Data Model & Versioning Strategy
- Design Doc: Prompt Grounding Enhancements
- Design Doc: Compatibility & Rollback
- Schema: Versioning strategy, indexes, triggers

---

## Quick Reference

### Where to Find Specific Information

| Topic                          | Document            | Section                           |
| ------------------------------ | ------------------- | --------------------------------- |
| **UI Designs**                 | UI Mockups          | All sections                      |
| **placeholdersSpec UX**        | UI Mockups          | Tab 3: Placeholders Configuration |
| **Template Admin page layout** | UI Mockups          | Template Admin Page               |
| **Database tables**            | Schema SQL          | Table definitions                 |
| **Versioning strategy**        | Design Doc          | Data Model → Versioning Strategy  |
| **API endpoints**              | Design Doc          | API Surface                       |
| **Validation rules**           | Design Doc          | Clarification & Validation Loop   |
| **Template matching logic**    | Design Doc          | Selection & Ranking               |
| **Implementation stages**      | Implementation Plan | Stages 0-8                        |
| **Success metrics**            | Design Doc          | Evaluation Protocol               |
| **Component library**          | UI Mockups          | Component Usage Guidelines        |
| **Field mappings**             | UI Mockups          | Field Mapping Reference           |
| **Test cases**                 | Implementation Plan | Test Matrix                       |

---

## Document Conventions

### Linking Between Documents

All documents use **relative markdown links**:

- From `design/` to `design/`: `[file.md](./file.md)`
- From `design/` to `todos/`: `[file.md](../todos/file.md)`
- From `design/` to `database/`: `[file.sql](../../database/migration/file.sql)`

### Version Control

Each document has a "Last Updated" date at the top:

- Update this date when making significant changes
- Use ISO date format: YYYY-MM-DD
- Include brief change notes in commit messages

### Style Guide

- **Headers:** Use H2 (`##`) for main sections, H3 (`###`) for subsections
- **Code:** Use backticks for inline code, triple backticks for code blocks
- **Lists:** Use `-` for unordered lists, `1.` for ordered lists
- **Emphasis:** Use **bold** for important terms, _italic_ for emphasis
- **Emojis:** Use sparingly in headings for visual navigation (✅ ❌ ⚠️ 📊 🎯)

---

## Contributing to Documentation

### When to Update Which Document

| Change Type                 | Document to Update                                  |
| --------------------------- | --------------------------------------------------- |
| UI design changes           | UI Mockups                                          |
| New component mockup        | UI Mockups                                          |
| Field mapping change        | UI Mockups (Field Mapping Reference)                |
| Data model change           | Design Doc (Data Model) + Schema SQL                |
| New API endpoint            | Design Doc (API Surface)                            |
| Validation rule change      | Design Doc (Validation Loop) + UI Mockups (Tab 2/3) |
| Implementation stage change | Implementation Plan                                 |
| Success criteria change     | Implementation Plan (per stage)                     |
| Test case addition          | Implementation Plan (Test Matrix)                   |
| Database schema change      | Schema SQL + Design Doc (Data Model)                |

### Review Checklist

Before committing documentation changes:

- [ ] Updated "Last Updated" date
- [ ] Cross-references to other docs still valid
- [ ] No broken internal links
- [ ] Code examples use correct syntax
- [ ] Field names match database schema
- [ ] UI component names match shadcn/ui library
- [ ] Related documents updated if necessary
- [ ] Spell-checked

---

## Feedback & Questions

For questions about documentation organization or content:

- Tag: `@data-insights-team` in PR comments
- Slack: #ai-insights channel
- Email: insights-team@aranz.com

---

**End of Template System Documentation Guide**
