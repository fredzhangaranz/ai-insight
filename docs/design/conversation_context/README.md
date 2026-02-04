# Conversation Context Documentation

**Version:** 2.0 (Production-Ready with AI Optimization)  
**Last Updated:** 2026-01-14

This folder contains the complete design and implementation documentation for the **Conversation-First UI Redesign** feature with production-ready AI optimizations.

## 🆕 What's New in Version 2.0

Version 2.0 adds critical production optimizations that were missing from v1.0:

✅ **90% Token Cost Reduction** - Claude prompt caching & Gemini context caching  
✅ **Compound SQL Approach** - CTE composition (no result storage, privacy-safe)  
✅ **Save Insight Integration** - Final SQL is self-contained and re-runnable  
✅ **Full Audit Trail** - Tracks conversation lineage per auditing requirements  
✅ **Privacy-First** - No patient data stored, only SQL + result summaries  

**Impact:**
- **Cost:** 10-message conversation: $0.11 (was $1.06) - **90% savings**
- **Privacy:** Zero patient data storage (compliance-ready)
- **Auditability:** Full conversation lineage tracking
- **Usability:** Saved insights work without conversation context

---

## 📚 Document Index

### 1. **QUICK_START.md** ⭐ (Start Here)
**Purpose:** Quick overview of v2.1 changes and implementation order

**Contains:**
- What changed in version 2.1 (Phase 0 critical fixes + AI optimization)
- **Phase 0:** Critical pre-implementation fixes (MUST DO FIRST)
- 3-week implementation timeline
- Quick validation checklist
- Common issues & fixes
- Success metrics

**When to read:** Before starting any implementation work

---

### 2. **PHASE_0_FIXES_SUMMARY.md** ⚠️ (Critical Fixes)
**Purpose:** Detailed explanation of 4 critical fixes that MUST be completed before Phase 1

**Contains:**
- Why Phase 0 exists (4 critical flaws identified in review)
- Fix 0.1: PHI Protection (hash entity IDs - HIPAA/GDPR compliance)
- Fix 0.2: Soft-Delete Edit Behavior (clarify cascade deletions)
- Fix 0.3: ExecutionMode Compatibility (conservative flag approach)
- Fix 0.4: Canonical Types Definition (single source of truth)
- Completion checklist (verify before Phase 1)
- Timeline impact (adds 2 days at start)

**When to read:** **BEFORE starting Phase 1** - explains critical design fixes

---

### 3. **CONVERSATION_UI_REDESIGN.md** (Main Design Doc)
**Purpose:** Complete design specification with UX mockups and architecture

**Contains:**
- Executive summary and problem statement
- Visual design mockups (6 detailed wireframes)
- Component architecture and hierarchy
- Data models and types
- API endpoint specifications
- Database schema
- State management patterns
- Smart suggestions system overview
- Migration strategy
- Implementation plan (4-week timeline)
- Success metrics

**When to read:** Before starting implementation or when making design decisions

---

### 3. **CONTEXT_CARRYOVER_DESIGN.md** (AI Optimization)
**Purpose:** Production-ready AI context management and SQL composition

**Contains:**
- Claude prompt caching implementation (90% cost reduction)
- Gemini context caching implementation (80% cost reduction)
- Compound SQL composition strategy (CTE-based, privacy-safe)
- Save Insight integration (self-contained queries)
- Audit trail integration (conversation lineage tracking)
- Token efficiency analysis and metrics

**When to read:** Before implementing Phase 2-3 (AI Providers & SQL Composition)

---

### 4. **IMPLEMENTATION_GUIDE.md** ⭐ (Step-by-Step Guide)
**Purpose:** Detailed implementation instructions for AI agents or developers

**Version:** 2.1 (with Phase 0 Critical Fixes)

**Contains:**
- **Phase 0:** Critical pre-implementation fixes (PHI, soft-delete, compatibility) ⚠️ **MUST DO FIRST**
- **Phases 1-10:** Detailed implementation breakdown
- Complete code examples for every component
- Database migrations (030, 046, 047) - copy-paste ready
- AI provider caching implementations (Claude/Gemini)
- SQL composition service with CTE strategies
- API endpoint implementations (production-ready)
- Audit service integration
- Save Insight service integration
- Testing strategies and test examples (unit/integration/manual)
- Troubleshooting guide with solutions
- Success metrics and deployment checklist

**When to read:** During active implementation (Phase 1-10)

---

### 5. **SMART_SUGGESTIONS_DESIGN.md** (Enhancement Feature)
**Purpose:** Rule-based + AI-enhanced smart suggestion system

**Contains:**
- Three-tier suggestion approach (Rule-based 80%, AI 20%)
- SQL pattern detection logic
- Suggestion generation algorithms
- Caching strategy (memory + Redis)
- Performance metrics and targets
- Implementation phases

**When to read:** After Phase 6 (UI Components) - optional enhancement

---

### 6. **IMPLEMENTATION_TRACKER.md** (Progress Tracking)
**Purpose:** Track implementation progress and bugs

**Contains:**
- Week-by-week task breakdown with checkboxes
- Bug tracking table
- Metrics dashboard template
- Status indicators

**When to read:** Throughout implementation to track progress

---

## 🚀 Quick Start

### For Product/Design Review:
1. Read **Executive Summary** in `CONVERSATION_UI_REDESIGN.md`
2. Review **Visual Design Mockups** (Section 5)
3. Review **User Experience Flow** (Section 4)

### For Development:
1. Read **Prerequisites** in `IMPLEMENTATION_GUIDE.md`
2. Follow **Phase 1: Database & Migrations**
3. Continue phase-by-phase

### For AI Agent Implementation:
1. Provide `IMPLEMENTATION_GUIDE.md` to the AI agent
2. Agent should follow phases sequentially
3. Reference `CONVERSATION_UI_REDESIGN.md` for design decisions

---

## 🎯 Feature Overview

**Goal:** Transform the "Ask Question" page from single-shot queries into ChatGPT-style conversations.

### Key Changes:

| Current | New |
|---------|-----|
| Single question → Single result | Continuous conversation with context |
| "Refine" vs "Follow-up" buttons (confusing) | One input box + smart suggestions |
| No context carryover | Context automatically maintained |
| Each query isolated | Multi-turn conversations saved |

### Benefits:

- ✅ **60%+ increase** in follow-up questions
- ✅ **Natural UX** (familiar ChatGPT model)
- ✅ **Faster workflows** (one-click suggestions)
- ✅ **Context retention** ("Which ones?" works)
- ✅ **Edit any question** (re-run from that point)

---

## 📐 Architecture Summary

### Database Tables

```sql
ConversationThreads
├─ id (UUID)
├─ userId (FK → Users)
├─ customerId (FK → Customer)
├─ title (auto-generated from first question)
├─ contextCache (JSONB - cached entities, filters)
└─ isActive (boolean)

ConversationMessages
├─ id (UUID)
├─ threadId (FK → ConversationThreads)
├─ role ('user' | 'assistant')
├─ content (TEXT)
├─ metadata (JSONB - SQL, timing, result summary)
└─ createdAt (timestamp)
```

### API Endpoints

```
POST   /api/insights/conversation/send          ← Send message
GET    /api/insights/conversation/:threadId     ← Load thread
PATCH  /api/insights/conversation/messages/:id  ← Edit message
POST   /api/insights/conversation/new           ← New thread
GET    /api/insights/conversation/history       ← List threads
```

### Key Components

```
NewInsightPage (Main Container)
├─ ConversationHeader (Customer/Model/New Chat)
├─ ConversationThread (Scrollable)
│  ├─ UserMessage (with Edit)
│  └─ AssistantMessage (with Results & Actions)
├─ SmartSuggestions (Follow-ups + Refinements)
└─ ConversationInput (Sticky Bottom)
```

### State Management

- **Hook:** `useConversation()` manages thread, messages, loading
- **Optimistic Updates:** User message appears immediately
- **Context Building:** Last 5 messages passed to LLM
- **Auto-scroll:** New messages scroll into view

---

## 🔄 Implementation Timeline

### Week 1: Foundation
- Database tables & migrations
- API endpoints (send, load, new)
- Core `useConversation` hook
- Context building logic

### Week 2: UI Components
- Message components (User & Assistant)
- Conversation input
- Results display
- Message actions (Save, Chart, Export)

### Week 3: Smart Suggestions
- Suggestion generator service
- Refinement generator service
- Smart suggestion UI
- Integration with input

### Week 4: Polish & Rollout
- Testing (unit + integration)
- A/B testing setup
- Bug fixes & iteration
- Documentation & rollout

---

## 📊 Success Metrics

### User Engagement
| Metric | Target (3 months) |
|--------|-------------------|
| Questions per session | 3.5+ |
| Follow-up question rate | 60%+ |
| Suggestion click rate | 40%+ |
| Edit usage rate | 15%+ |

### Quality
| Metric | Target |
|--------|--------|
| Query success rate | 90%+ |
| User satisfaction (NPS) | 70+ |
| Context understanding | 85%+ |

---

## 🧪 Testing Strategy

### Unit Tests
- `useConversation` hook (send, edit, load)
- Suggestion generators (SQL parsing logic)
- Message components (render, interactions)

### Integration Tests
- End-to-end conversation flow
- Context carryover between messages
- Edit message → discard subsequent
- Suggestion click → fill input

### Manual Testing
- **Basic Flow:** Ask → Response → Follow-up
- **Edit Flow:** Edit question → Re-run
- **New Chat:** Clear → Start fresh
- **Error Handling:** Network failure, invalid input

---

## 🔗 Related Documents

### Internal
- `docs/design/semantic_layer/semantic_layer_UI_design.md` - Base UI patterns
- `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md` - Clarification system
- `database/migration/` - Existing migration patterns

### External References
- ChatGPT conversation UX (inspiration)
- Claude.ai conversation patterns (edit functionality)
- Perplexity.ai suggestions (smart follow-ups)

---

## ❓ FAQ

### Q: Will this break existing functionality?
**A:** No. New conversation page deployed at `/insights/conversation`. Old page remains at `/insights/new` during migration.

### Q: How is context maintained?
**A:** Last 5 messages are passed to LLM as context. Includes: questions, row counts, columns. LLM understands pronouns like "which ones", "they".

### Q: What if user wants to start fresh?
**A:** "New Chat" button clears conversation but retains Customer/Model selection.

### Q: Can users go back to old conversations?
**A:** Yes. "History" dropdown shows recent threads. Click to load.

### Q: How do smart suggestions work?
**A:** SQL is analyzed (aggregation, time columns, patient IDs, etc). Suggestions generated based on query type. User clicks → fills input (doesn't auto-submit).

### Q: What happens when user edits a message?
**A:** Question re-runs from that point. All subsequent messages are discarded. User is warned before edit.

---

## 🛠️ Development Commands

```bash
# Run database migration
npm run migrate

# Start development server
npm run dev

# Run tests
npm test

# Run specific test
npm test useConversation.test.ts

# Build for production
npm run build

# Check for linter errors
npm run lint
```

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-14 | Initial design documentation |
| 2.0 | 2026-01-14 | Added AI optimization (Claude/Gemini caching), Compound SQL approach, Audit integration, Save Insight integration, QUICK_START.md, CONTEXT_CARRYOVER_DESIGN.md, SMART_SUGGESTIONS_DESIGN.md |
| 2.1 | 2026-01-14 | **Added Phase 0 Critical Fixes**: PHI protection (hashed entity IDs), soft-delete edit behavior, conservative flag approach for SavedInsights, canonical types definition. These fixes address compliance (HIPAA/GDPR), design clarity, backward compatibility, and type safety. |

---

## 👥 Contributors

- Design: InsightGen Team
- Implementation: [To be assigned]
- Review: [To be assigned]

---

## 📞 Support

For questions or clarifications:
1. Check FAQ above
2. Review main design doc (`CONVERSATION_UI_REDESIGN.md`)
3. Check implementation guide (`IMPLEMENTATION_GUIDE.md`)
4. Contact: InsightGen Team

---

**Status:** ✅ Version 2.0 Complete - Production-Ready with AI Optimization  
**Next Steps:** 
1. Read `QUICK_START.md` for overview
2. Review `IMPLEMENTATION_GUIDE.md` for detailed steps
3. Begin Phase 1 (Database Migrations)
4. Track progress in `IMPLEMENTATION_TRACKER.md`

**Estimated Timeline:** 3-4 weeks (1 developer)
