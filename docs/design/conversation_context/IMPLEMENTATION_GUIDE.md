# Conversation UI Implementation Guide

**Version:** 2.0  
**Last Updated:** 2026-01-14  
**Parent Document:** `CONVERSATION_UI_REDESIGN.md`  
**Related:** `CONTEXT_CARRYOVER_DESIGN.md`, `auditing-improvement-todo.md`  
**Purpose:** Production-ready step-by-step implementation with AI vendor context optimization

---

## Implementation Status

| Area              | Status      | Completed On | Notes                                                                            |
| ----------------- | ----------- | ------------ | -------------------------------------------------------------------------------- |
| Phase 0           | ✅ Complete | 2026-01-14   | PHI protection, soft-delete, compatibility, canonical types, improvements        |
| Phase 1 Step 1.1  | ✅ Complete | 2026-01-15   | Migration already implemented in 046; docs aligned                               |
| Phase 2 Step 2.1  | ✅ Complete | 2026-01-15   | Added conversation-aware provider interface                                      |
| Phase 2 Step 2.2  | ✅ Complete | 2026-01-15   | Claude prompt caching implementation                                             |
| Phase 2 Step 2.3  | ✅ Complete | 2026-01-15   | Gemini context caching implementation                                            |
| Phase 2 Step 2.4  | ✅ Complete | 2026-01-19   | Provider factory updated with conversation support and failover                  |
| Phase 3 Step 3.1  | ✅ Complete | 2026-01-20   | SqlComposerService implemented for composition decisions and validation          |
| Phase 3 Step 3.2  | ✅ Complete | 2026-01-20   | SQL composition prompt examples added                                            |
| Phase 4 Step 4.1  | ✅ Complete | 2026-01-20   | Conversation types defined (canonical types + metadata)                          |
| Phase 4 Step 4.2  | ✅ Complete | 2026-01-20   | Conversation send endpoint with composition, audit, cache update                 |
| Phase 4 Step 4.3  | ✅ Complete | 2026-01-20   | Conversation thread fetch endpoint with normalized metadata                      |
| Phase 4 Step 4.4  | ✅ Complete | 2026-01-20   | Conversation thread creation endpoint                                            |
| Phase 4 Step 4.5  | ✅ Complete | 2026-01-20   | Conversation history endpoint with pagination and previews                       |
| Phase 5 Step 5.1  | ✅ Complete | 2026-01-23   | useConversation hook for send/edit/load flows                                    |
| Phase 5 Step 5.2  | ✅ Complete | 2026-01-23   | Refinement generator service                                                     |
| Phase 6 Step 6.1  | ✅ Complete | 2026-01-23   | Conversation input component                                                     |
| Phase 6 Step 6.2  | ✅ Complete | 2026-01-23   | User message component                                                           |
| Phase 6 Step 6.3  | ✅ Complete | 2026-01-23   | Assistant message component                                                      |
| Phase 6 Step 6.4  | ✅ Complete | 2026-01-23   | Results table component                                                          |
| Phase 6 Step 6.5  | ✅ Complete | 2026-01-23   | Message actions component                                                        |
| Phase 6 Step 6.6  | ✅ Complete | 2026-01-26   | Loading & thinking state for follow-ups, progressive display                     |
| Phase 6 Step 6.7  | ✅ Complete | 2026-01-26   | Expandable "How I got this" context section for follow-ups                       |
| Phase 6 Step 6.8  | ✅ Complete | 2026-01-26   | Context awareness badge showing "Based on X answers"                             |
| Phase 6 Step 6.9  | ✅ Complete | 2026-01-26   | Loading status in input area during AI processing                                |
| Phase 6 Step 6.10 | ✅ Complete | 2026-01-26   | Smart scroll & message grouping for long conversations                           |
| Phase 6 Step 6.11 | ✅ Complete | 2026-01-26   | Query composition strategy indicator (CTE/fresh/optimized)                       |
| Phase 6 Step 6.12 | ✅ Complete | 2026-01-26   | SQL preview in thinking details with syntax highlighting                         |
| Phase 7 Step 7.1  | ✅ Complete | 2026-01-26   | Rule-based suggestion generator service                                          |
| Phase 7 Step 7.2  | ✅ Complete | 2026-01-26   | Refinement generator service                                                     |
| Phase 7 Step 7.3  | ✅ Complete | 2026-01-26   | SmartSuggestions UI + ConversationPanel wiring (rule-based)                      |
| Phase 7 Step 7.4  | ⏳ Pending  | —            | Background AI suggestion prompt + generator (post-release)                       |
| Phase 7 Step 7.5  | ⏳ Pending  | —            | Suggestions API endpoint (non-blocking, post-release)                            |
| Phase 7 Step 7.6  | ⏳ Pending  | —            | SmartSuggestion type update (reasoning optional, post-release)                   |
| Phase 7 Step 7.7  | ⏳ Pending  | —            | SmartSuggestions UI for AI reasoning (post-release)                              |
| Phase 7 Step 7.8  | ⏳ Pending  | —            | ConversationPanel background fetch (post-release)                                |
| Phase 7 Step 7.9  | ⏳ Pending  | —            | Tests for AI suggestion parsing + UI (post-release)                              |
| Phase 8 Step 8.1  | ✅ Complete | 2026-02-02   | Migration 048: QueryHistory conversation columns + ConversationQueryHistory view |
| Phase 8 Step 8.2  | ✅ Complete | 2026-02-02   | Migration run (manual)                                                           |
| Phase 8 Step 8.3  | ✅ Complete | 2026-02-02   | ConversationAuditService (log/lineage/metrics/breakdown, view-only reads)        |
| Phase 8 Step 8.4  | ✅ Complete | 2026-02-02   | Admin audit conversations API (feature guard, cache, requireAdmin)               |
| Phase 8 Step 8.5  | ✅ Complete | 2026-02-02   | ConversationMetricsCard on audit dashboard (LoadingDots, error state)            |

---

## Table of Contents

1. [Implementation Status](#implementation-status)
2. [Prerequisites](#prerequisites)
3. [Phase 0: Critical Pre-Implementation Fixes](#phase-0-critical-pre-implementation-fixes) ⚠️ **MUST DO FIRST**
4. [Phase 1: Database & Migrations](#phase-1-database--migrations)
5. [Phase 2: AI Provider Context Integration](#phase-2-ai-provider-context-integration)
6. [Phase 3: SQL Composition Service](#phase-3-sql-composition-service)
7. [Phase 4: API Endpoints](#phase-4-api-endpoints)
8. [Phase 5: Conversation Hook](#phase-5-conversation-hook)
9. [Phase 6: UI Components](#phase-6-ui-components)
10. [Phase 7: Smart Suggestions](#phase-7-smart-suggestions)
11. [Phase 8: Audit Integration](#phase-8-audit-integration)
12. [Phase 9: Save Insight Integration](#phase-9-save-insight-integration)
13. [Phase 10: Integration & Testing](#phase-10-integration--testing)
14. [Phase 11: Migration & Rollout](#phase-11-migration--rollout)
15. [Testing Checklist](#testing-checklist)
16. [Troubleshooting](#troubleshooting)

---

## Overview: Key Improvements

### Version 2.1 Changes

This guide now includes production-ready improvements:

1. **✅ AI Vendor Native Context** - Use Claude prompt caching & Gemini context caching (90% token cost reduction)
2. **✅ Compound SQL Approach** - Build on previous queries via CTEs (no result storage, privacy-safe)
3. **✅ AI-Driven Composition Decision** - Let AI semantically determine query relationships (no regex patterns)
4. **✅ Save Insight Integration** - Save final composed SQL that's self-contained
5. **✅ Full Audit Trail** - Track conversation lineage per `auditing-improvement-todo.md`
6. **✅ Token Efficiency** - Optimized for long conversations (10+ messages)
7. **✅ Phase 0 Critical Fixes** - PHI protection, soft-delete, compatibility (MUST DO FIRST)

### Version 2.1 Design Philosophy

**AI-First Approach:** Instead of hardcoding keyword patterns (regex) to detect question relationships, we leverage AI to semantically understand whether questions build on previous results or are independent. This:

- Eliminates brittle regex maintenance
- Handles implicit references naturally ("Tell me about the older ones")
- Works in any language
- Aligns with our project's AI-first philosophy (same as ambiguity detection, intent classification, etc.)

### Architecture Diagram

```
User Question
     ↓
[Conversation Context]
     ↓
[Claude/Gemini Cached System Prompt] ← Schema, Ontology, SQL Rules (cached)
     ↓
[SQL Composer] ← CTE composition or fresh query
     ↓
[Execute SQL] ← Always fresh data
     ↓
[Audit Logger] ← Track lineage
     ↓
[Save Insight] ← Store final composed SQL
```

---

## Prerequisites

### Files to Read First

Before starting implementation, read and understand these existing files:

```
✅ Must Read:
- app/insights/new/page.tsx - Current insights page structure
- lib/hooks/useInsights.ts - Current state management pattern
- app/insights/new/components/ConversationalRefinement.tsx - Existing refinement UI
- lib/services/semantic/three-mode-orchestrator.service.ts - Query orchestration
- app/api/insights/ask/route.ts - Current API endpoint

📖 Reference:
- docs/design/conversation_context/CONVERSATION_UI_REDESIGN.md - Main design doc
- database/migration/ - Existing migration patterns
```

### Dependencies to Install

No new dependencies needed! All features use existing libraries:

- React 18 (already installed)
- Next.js 14 (already installed)
- Existing UI components from `@/components/ui/`

---

## Design Decisions Summary

| Decision                                | Rationale                              | Impact                                      |
| --------------------------------------- | -------------------------------------- | ------------------------------------------- |
| **Hash Entity IDs (Phase 0.1)**         | HIPAA/GDPR compliance - no PHI storage | Patient IDs → SHA-256 hashes (one-way)      |
| **Soft-Delete Edit (Phase 0.2)**        | Simpler than branching, clear lineage  | Edit cascades deletion to later messages    |
| **isFromConversation Flag (Phase 0.3)** | Backward compatible with existing code | Boolean flag vs new enum value              |
| **Canonical Types (Phase 0.4)**         | Single source of truth prevents bugs   | All imports use `lib/types/conversation.ts` |
| **Claude Prompt Caching**               | 90% cost reduction on repeated context | 10-message conversation: $0.11 vs $1.06     |
| **Gemini Context Caching**              | Similar savings, Gemini 2.0+ support   | Alternative to Claude for same benefits     |
| **AI-Driven Composition Decision**      | Semantic understanding vs regex        | Handles "female→male" as independent        |
| **CTE Composition**                     | No temp tables, no result storage      | Privacy-safe, always fresh data             |
| **Save Last SQL Only**                  | User intent = final query              | Saved insights are self-contained           |
| **Extend QueryHistory**                 | Track conversation lineage             | Full audit trail for analysis               |

---

## Phase 0: Critical Pre-Implementation Fixes

⚠️ **STOP: These fixes MUST be completed before starting Phase 1**

This phase addresses critical design flaws identified during review that would cause compliance violations and implementation bugs if not fixed first.

### Fix 0.1: PHI Storage Protection (CRITICAL - HIPAA/GDPR Compliance)

**Problem:** Current design allows PHI (patient IDs, names) to leak into `ConversationMessages.metadata`.

**Solution:** Hash all entity IDs using SHA-256 before storing.

#### Implementation

**File:** `lib/services/phi-protection.service.ts` (NEW)

```typescript
import crypto from "crypto";

export class PHIProtectionService {
  /**
   * Hash an entity ID (patient ID, wound ID, etc.) for storage
   * One-way hash - cannot be reversed
   */
  hashEntityId(entityId: string | number): string {
    const salt = process.env.ENTITY_HASH_SALT || "default-salt-change-in-prod";
    const hash = crypto
      .createHash("sha256")
      .update(`${entityId}${salt}`)
      .digest("hex");
    return hash.substring(0, 16); // First 16 chars for brevity
  }

  /**
   * Hash multiple entity IDs
   */
  hashEntityIds(entityIds: (string | number)[]): string[] {
    return entityIds.map((id) => this.hashEntityId(id));
  }

  /**
   * Create safe result summary (NO PHI)
   */
  createSafeResultSummary(
    rows: any[],
    columns: string[],
  ): {
    rowCount: number;
    columns: string[];
    entityHashes?: string[];
  } {
    // Extract patient/wound IDs if they exist in results
    const entityIds: (string | number)[] = [];

    for (const row of rows) {
      if (row.patientId) entityIds.push(row.patientId);
      if (row.patient_id) entityIds.push(row.patient_id);
      if (row.woundId) entityIds.push(row.woundId);
      if (row.wound_id) entityIds.push(row.wound_id);
    }

    return {
      rowCount: rows.length,
      columns, // Column names are OK (they're metadata)
      // Store hashed IDs for deduplication tracking (optional)
      entityHashes:
        entityIds.length > 0
          ? this.hashEntityIds(Array.from(new Set(entityIds)))
          : undefined,
    };
  }

  /**
   * Validate that metadata contains NO PHI
   * Throws error if PHI detected
   */
  validateNoPHI(metadata: any): void {
    const phiFields = [
      "patientName",
      "patient_name",
      "firstName",
      "lastName",
      "dateOfBirth",
      "ssn",
      "mrn",
      "phoneNumber",
      "email",
      "address",
    ];

    const detectPHI = (obj: any, path = ""): string[] => {
      const found: string[] = [];

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check if key itself is PHI
        if (phiFields.some((field) => key.toLowerCase().includes(field))) {
          found.push(currentPath);
        }

        // Recursively check nested objects
        if (value && typeof value === "object" && !Array.isArray(value)) {
          found.push(...detectPHI(value, currentPath));
        }
      }

      return found;
    };

    const phiFound = detectPHI(metadata);

    if (phiFound.length > 0) {
      throw new Error(
        `PHI detected in metadata at: ${phiFound.join(", ")}. ` +
          `HIPAA violation prevented. Remove PHI before storing.`,
      );
    }
  }
}
```

#### Update MessageMetadata Type

**File:** `lib/types/conversation.ts` (UPDATE)

```typescript
/**
 * Metadata stored with assistant messages
 * ⚠️ CRITICAL: NO PHI ALLOWED IN THIS OBJECT
 */
export interface MessageMetadata {
  // For user messages
  originalQuestion?: string;
  wasEdited?: boolean;
  editedAt?: Date;

  // For assistant messages
  modelUsed?: string;
  executionTimeMs?: number;
  sql?: string; // SQL query text is OK (no patient data)
  mode?: "template" | "direct" | "funnel" | "clarification";
  compositionStrategy?: "cte" | "merged_where" | "fresh";
  queryHistoryId?: number;

  // SAFE result summary (NO PHI)
  resultSummary?: {
    rowCount: number;
    columns: string[]; // Column names only
    entityHashes?: string[]; // SHA-256 hashed entity IDs (optional, for tracking)
  };

  // ❌ FORBIDDEN FIELDS (will cause validation error):
  // patientIds, patientNames, patientData, results, rows, etc.
}
```

#### Usage in API Endpoints

**File:** `app/api/insights/conversation/send/route.ts` (UPDATE Step 5)

```typescript
// Step 5: Save assistant message
const phiProtection = new PHIProtectionService();

// Create SAFE result summary (no PHI)
const safeResultSummary = phiProtection.createSafeResultSummary(
  result.results?.rows || [],
  result.results?.columns || [],
);

const assistantMetadata = {
  modelUsed: modelId,
  sql: result.sql,
  mode: result.mode,
  compositionStrategy,
  resultSummary: safeResultSummary, // ← Safe, no PHI
  executionTimeMs: executionTime,
};

// Validate NO PHI leaked
phiProtection.validateNoPHI(assistantMetadata);

// Now safe to store
const assistantMsgResult = await pool.query(
  `INSERT INTO "ConversationMessages" 
   ("threadId", "role", "content", "metadata") 
   VALUES ($1, 'assistant', $2, $3) 
   RETURNING id, "createdAt"`,
  [
    currentThreadId,
    generateResponseText(result),
    JSON.stringify(assistantMetadata),
  ],
);
```

#### Unit Test for PHI Protection

**File:** `lib/services/__tests__/phi-protection.test.ts` (NEW)

```typescript
import { PHIProtectionService } from "../phi-protection.service";

describe("PHIProtectionService", () => {
  const service = new PHIProtectionService();

  it("should hash entity IDs consistently", () => {
    const hash1 = service.hashEntityId(12345);
    const hash2 = service.hashEntityId(12345);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it("should create safe result summary without PHI", () => {
    const rows = [
      { patientId: 123, age: 45, name: "John Doe" },
      { patientId: 456, age: 60, name: "Jane Smith" },
    ];
    const columns = ["patientId", "age", "name"];

    const summary = service.createSafeResultSummary(rows, columns);

    expect(summary.rowCount).toBe(2);
    expect(summary.columns).toEqual(columns);
    expect(summary.entityHashes).toHaveLength(2);
    // Verify no actual patient data
    expect(JSON.stringify(summary)).not.toContain("John");
    expect(JSON.stringify(summary)).not.toContain("Jane");
  });

  it("should detect PHI in metadata and throw error", () => {
    const badMetadata = {
      sql: "SELECT * FROM Patient",
      patientName: "John Doe", // ← PHI!
    };

    expect(() => service.validateNoPHI(badMetadata)).toThrow(/PHI detected/);
  });

  it("should allow safe metadata", () => {
    const safeMetadata = {
      sql: "SELECT * FROM Patient",
      resultSummary: {
        rowCount: 10,
        columns: ["id", "age"],
        entityHashes: ["abc123", "def456"],
      },
    };

    expect(() => service.validateNoPHI(safeMetadata)).not.toThrow();
  });
});
```

---

### Fix 0.2: Edit Behavior - Soft Delete with Cascade

**Problem:** Design docs mention "branching" but schema doesn't support it. This will confuse implementers.

**Solution:** Implement soft-delete with cascading deletions (simpler, clearer).

#### Update Migration 030

**File:** `database/migration/030_create_conversation_tables.sql` (UPDATE)

```sql
-- Add to ConversationMessages table:
ALTER TABLE "ConversationMessages"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "supersededByMessageId" UUID REFERENCES "ConversationMessages"(id);

-- Index for active messages only
CREATE INDEX IF NOT EXISTS idx_conversation_messages_active
ON "ConversationMessages" ("threadId", "createdAt" ASC)
WHERE "deletedAt" IS NULL;

-- Comments
COMMENT ON COLUMN "ConversationMessages"."deletedAt"
IS 'Soft delete timestamp. NULL = active, set = deleted';

COMMENT ON COLUMN "ConversationMessages"."supersededByMessageId"
IS 'If this message was edited, points to the new version';
```

#### Edit Message API

**File:** `app/api/insights/conversation/messages/[messageId]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { pool } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { messageId: string } },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { messageId } = params;
    const body = await req.json();
    const { newContent } = body;

    if (!newContent?.trim()) {
      return NextResponse.json(
        { error: "newContent is required" },
        { status: 400 },
      );
    }

    // 1. Load original message
    const originalMsg = await pool.query(
      `SELECT * FROM "ConversationMessages" WHERE id = $1`,
      [messageId],
    );

    if (originalMsg.rows.length === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const original = originalMsg.rows[0];

    // 2. Soft-delete original message
    await pool.query(
      `UPDATE "ConversationMessages" 
       SET "deletedAt" = NOW() 
       WHERE id = $1`,
      [messageId],
    );

    // 3. Soft-delete all subsequent messages in this thread
    await pool.query(
      `UPDATE "ConversationMessages" 
       SET "deletedAt" = NOW() 
       WHERE "threadId" = $1 
         AND "createdAt" > $2
         AND "deletedAt" IS NULL`,
      [original.threadId, original.createdAt],
    );

    // 4. Create new user message
    const newUserMsg = await pool.query(
      `INSERT INTO "ConversationMessages" 
       ("threadId", "role", "content", "metadata") 
       VALUES ($1, 'user', $2, $3) 
       RETURNING *`,
      [
        original.threadId,
        newContent,
        JSON.stringify({ wasEdited: true, editedAt: new Date() }),
      ],
    );

    // 5. Link old message to new one
    await pool.query(
      `UPDATE "ConversationMessages" 
       SET "supersededByMessageId" = $1 
       WHERE id = $2`,
      [newUserMsg.rows[0].id, messageId],
    );

    // 6. Re-run query with new content
    // (Call the /send endpoint internally or duplicate logic here)
    // For simplicity, return the new message and let frontend call /send

    return NextResponse.json({
      success: true,
      newMessage: newUserMsg.rows[0],
      deletedMessageIds: [messageId], // Plus any subsequent ones
    });
  } catch (error) {
    console.error("[PATCH /messages/:id] Error:", error);
    return NextResponse.json(
      { error: "Failed to edit message" },
      { status: 500 },
    );
  }
}
```

#### Update Conversation Loading

**File:** `app/api/insights/conversation/[threadId]/route.ts` (UPDATE)

```typescript
// When loading messages, filter out soft-deleted ones
const messagesResult = await pool.query(
  `SELECT * FROM "ConversationMessages" 
   WHERE "threadId" = $1 
     AND "deletedAt" IS NULL  -- ← Only active messages
   ORDER BY "createdAt" ASC`,
  [threadId],
);
```

---

### Fix 0.3: ExecutionMode Compatibility - Conservative Flag Approach

**Problem:** New `executionMode: "contextual"` might break downstream consumers.

**Solution:** Use conservative flag approach instead (`isFromConversation` boolean).

#### Update Migration 047

**File:** `database/migration/047_save_insight_conversation_link.sql` (UPDATE)

```sql
-- Instead of executionMode enum, use boolean flag
ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "isFromConversation" BOOLEAN DEFAULT false;  -- ← Safe flag

-- Index
CREATE INDEX IF NOT EXISTS idx_saved_insights_conversation
ON "SavedInsights" ("conversationThreadId")
WHERE "conversationThreadId" IS NOT NULL;

-- Comments
COMMENT ON COLUMN "SavedInsights"."isFromConversation"
IS 'True if this insight was saved from a conversation (may have composed SQL with CTEs)';

-- NOTE: Existing executionMode column remains unchanged for backward compatibility
```

#### Update SaveInsightService

**File:** `lib/services/save-insight.service.ts` (UPDATE)

```typescript
export class SaveInsightService {
  async saveFromConversation(
    threadId: string,
    messageId: string,
    customerId: string,
    userId: number,
    userTitle?: string,
  ): Promise<SavedInsight> {
    // ... existing code ...

    // Save with conversation flag (backward compatible)
    const result = await pool.query(
      `
      INSERT INTO "SavedInsights" 
      (title, sql, customerId, userId, isFromConversation, conversationThreadId, conversationMessageId)
      VALUES ($1, $2, $3, $4, true, $5, $6)
      RETURNING *
    `,
      [title, finalSql, customerId, userId, threadId, messageId],
    );

    return result.rows[0];
  }
}
```

#### Dashboard Compatibility Check

**File:** `app/dashboard/page.tsx` (VERIFY - NO CHANGES NEEDED)

```typescript
// Existing code that filters insights:
const insights = await pool.query(`
  SELECT * FROM "SavedInsights"
  WHERE customerId = $1
  -- No executionMode filter = all insights returned (compatible!)
`);

// If some code does filter by executionMode, add this:
// WHERE (executionMode IS NULL OR executionMode IN ('standard', 'template'))
// becomes:
// WHERE (executionMode IS NULL OR executionMode IN ('standard', 'template') OR isFromConversation = true)
```

---

### Fix 0.4: Canonical Types Definition

**Problem:** `resultSummary` and other types are referenced but not defined consistently.

**Solution:** Create single source of truth for all conversation types.

#### Create Canonical Types File

**File:** `lib/types/conversation.ts` (UPDATE - Make definitive)

```typescript
import type { InsightResult } from "@/lib/hooks/useInsights";

// ============================================================================
// CANONICAL TYPES - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Summary of query results
 * ⚠️ CRITICAL: NO PHI - Only aggregates and hashed IDs
 */
export interface ResultSummary {
  rowCount: number;
  columns: string[]; // Column names only (metadata, not data)
  entityHashes?: string[]; // SHA-256 hashed entity IDs (optional)
  executionTimeMs?: number;
  // ❌ FORBIDDEN: patientIds, patientNames, rows, results, etc.
}

/**
 * Metadata stored with conversation messages
 * ⚠️ CRITICAL: NO PHI ALLOWED
 */
export interface MessageMetadata {
  // User message metadata
  originalQuestion?: string;
  wasEdited?: boolean;
  editedAt?: Date;

  // Assistant message metadata
  modelUsed?: string;
  sql?: string; // SQL text is OK (query template, not data)
  mode?: "template" | "direct" | "funnel" | "clarification" | "conversation";
  compositionStrategy?: "cte" | "merged_where" | "fresh";
  queryHistoryId?: number;
  resultSummary?: ResultSummary; // ← Canonical type
  executionTimeMs?: number;
}

/**
 * Smart suggestion categories
 */
export type SuggestionCategory =
  | "follow_up" // "Show me the top 10"
  | "aggregation" // "What's the average?"
  | "time_shift" // "Show last 6 months"
  | "filter" // "Only active patients"
  | "drill_down"; // "Show details for patient X"

/**
 * Smart suggestion
 */
export interface SmartSuggestion {
  text: string;
  icon?: string;
  category: SuggestionCategory; // ← Canonical type
  reasoning?: string;
  confidence?: number;
}

/**
 * Conversation thread
 */
export interface ConversationThread {
  id: string;
  userId: number;
  customerId: string;
  title?: string;
  contextCache: ConversationContext;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  result?: InsightResult;
  metadata: MessageMetadata; // ← Canonical type
  createdAt: Date;
  deletedAt?: Date | null; // Soft delete
  supersededByMessageId?: string | null; // Edit tracking
}

/**
 * Conversation context (non-PHI summary)
 */
export interface ConversationContext {
  customerId: string;
  referencedResultSets?: Array<{
    messageId: string;
    rowCount: number;
    columns: string[];
    entityHashes?: string[]; // Hashed IDs only
  }>;
  activeFilters?: any[];
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}
```

#### Add Type Validation

**File:** `lib/types/__tests__/conversation.test.ts` (NEW)

```typescript
import type {
  MessageMetadata,
  ResultSummary,
  SuggestionCategory,
} from "../conversation";

describe("Conversation Types", () => {
  it("ResultSummary should not allow PHI", () => {
    const validSummary: ResultSummary = {
      rowCount: 10,
      columns: ["id", "age"],
      entityHashes: ["abc123"],
    };

    // TypeScript should prevent this (compile error):
    // const invalidSummary: ResultSummary = {
    //   rowCount: 10,
    //   patientIds: [1, 2, 3]  // ← Compile error
    // };

    expect(validSummary).toBeDefined();
  });

  it("SuggestionCategory should be one of 5 types", () => {
    const validCategories: SuggestionCategory[] = [
      "follow_up",
      "aggregation",
      "time_shift",
      "filter",
      "drill_down",
    ];

    expect(validCategories).toHaveLength(5);
  });
});
```

---

### Phase 0 Completion Checklist

Before proceeding to Phase 1, verify:

**Fix 0.1: PHI Protection**

- [x] Created `phi-protection.service.ts`
- [x] Updated `MessageMetadata` type with NO PHI allowed
- [x] Added `validateNoPHI()` validation in API endpoints
- [x] Added unit tests for PHI protection
- [x] Verified no patient IDs/names in metadata

**Fix 0.2: Soft Delete**

- [x] Updated migration 030 with `deletedAt` and `supersededByMessageId`
- [x] Created edit message API endpoint
- [x] Updated conversation loading to filter `deletedAt IS NULL`
- [x] Tested edit flow (original + subsequent messages soft-deleted)

**Fix 0.3: Conservative Flag**

- [x] Updated migration 047 with `isFromConversation` boolean
- [x] Updated SaveInsightService to use flag
- [x] Verified dashboard queries don't filter out conversation insights
- [x] Tested saved insights from conversations

**Fix 0.4: Canonical Types**

- [x] Updated `lib/types/conversation.ts` with canonical types
- [x] Updated all imports to use canonical types
- [x] Added type validation tests
- [x] Verified TypeScript compilation with no type errors

---

## Phase 1: Database & Migrations

### Step 1.1: Review Existing Migration File

**File:** `database/migration/046_create_conversation_tables.sql`

```sql
-- Migration 046: Create conversation threading tables
-- Purpose: Support ChatGPT-style multi-turn conversations
-- Dependencies: 014_semantic_foundation.sql (Customer), 012_create_users_table.sql (Users)

BEGIN;

-- ============================================================================
-- TABLE: ConversationThreads
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "title" TEXT,
  "contextCache" JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_active
ON "ConversationThreads" ("isActive", "updatedAt" DESC)
WHERE "isActive" = true;

-- Comments
COMMENT ON TABLE "ConversationThreads" IS 'Conversation threads for multi-turn Q&A (ChatGPT-style)';
COMMENT ON COLUMN "ConversationThreads"."userId" IS 'User who owns this conversation';
COMMENT ON COLUMN "ConversationThreads"."customerId" IS 'Customer scope for this conversation';
COMMENT ON COLUMN "ConversationThreads"."title" IS 'Auto-generated or user-provided title (first question)';
COMMENT ON COLUMN "ConversationThreads"."contextCache" IS 'Cached context: non-PHI entities, filters, last result summary';
COMMENT ON COLUMN "ConversationThreads"."isActive" IS 'False if conversation is archived/deleted';

-- ============================================================================
-- TABLE: ConversationMessages
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ DEFAULT NULL,
  "supersededByMessageId" UUID REFERENCES "ConversationMessages"("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
ON "ConversationMessages" ("threadId", "createdAt" ASC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_active
ON "ConversationMessages" ("threadId", "createdAt" ASC)
WHERE "deletedAt" IS NULL;

-- Index for edit chain traversal
CREATE INDEX IF NOT EXISTS idx_conversation_messages_superseded
ON "ConversationMessages" ("supersededByMessageId")
WHERE "supersededByMessageId" IS NOT NULL;

-- Comments
COMMENT ON TABLE "ConversationMessages" IS 'Individual messages within conversation threads';
COMMENT ON COLUMN "ConversationMessages"."role" IS 'user or assistant';
COMMENT ON COLUMN "ConversationMessages"."content" IS 'Question text (user) or response text (assistant)';
COMMENT ON COLUMN "ConversationMessages"."metadata" IS 'SQL, model, timing, result summary for assistant messages';
COMMENT ON COLUMN "ConversationMessages"."deletedAt" IS 'Soft delete timestamp. NULL = active, set = deleted';
COMMENT ON COLUMN "ConversationMessages"."supersededByMessageId" IS 'If this message was edited, points to the new version';

-- ============================================================================
-- TRIGGER: Auto-update thread timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_conversation_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "ConversationThreads"
  SET "updatedAt" = NOW()
  WHERE "id" = NEW."threadId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_timestamp
AFTER INSERT OR UPDATE ON "ConversationMessages"
FOR EACH ROW
WHEN (
  TG_OP = 'INSERT' OR
  (TG_OP = 'UPDATE' AND (
    NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" OR
    NEW."supersededByMessageId" IS DISTINCT FROM OLD."supersededByMessageId"
  ))
)
EXECUTE FUNCTION update_conversation_thread_timestamp();

-- ============================================================================
-- TRIGGER: Validate supersededByMessageId is in same thread
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_superseded_same_thread()
RETURNS TRIGGER AS $$
DECLARE
  superseded_thread_id UUID;
BEGIN
  IF NEW."supersededByMessageId" IS NOT NULL THEN
    SELECT "threadId" INTO superseded_thread_id
    FROM "ConversationMessages"
    WHERE id = NEW."supersededByMessageId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'supersededByMessageId % does not exist', NEW."supersededByMessageId";
    END IF;

    IF superseded_thread_id != NEW."threadId" THEN
      RAISE EXCEPTION 'supersededByMessageId must reference a message in the same thread';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_superseded_same_thread
BEFORE INSERT OR UPDATE ON "ConversationMessages"
FOR EACH ROW
WHEN (NEW."supersededByMessageId" IS NOT NULL)
EXECUTE FUNCTION validate_superseded_same_thread();

COMMIT;
```

### Step 1.2: Run Migration

```bash
npm run migrate
```

**Expected Output:**

```
Running migration: 046_create_conversation_tables.sql
✓ Created table ConversationThreads
✓ Created table ConversationMessages
✓ Created indexes
✓ Created trigger
Migration completed successfully
```

### Step 1.3: Verify Tables

```sql
-- Run this query to verify
SELECT tablename, schemaname
FROM pg_tables
WHERE tablename IN ('ConversationThreads', 'ConversationMessages');

-- Should return:
--   tablename              | schemaname
-- -------------------------+------------
--  ConversationThreads     | public
--  ConversationMessages    | public
```

---

## Phase 2: AI Provider Context Integration

### Overview

This phase implements AI vendor-native context caching to achieve 90% token cost reduction for conversations. Instead of manually rebuilding context each time, we use:

- **Claude**: Prompt caching via `cache_control`
- **Gemini**: Context caching via `cachedContent` API

### Step 2.1: Update BaseProvider Interface

**File:** `lib/ai/base-provider.interface.ts`

```typescript
import type { ConversationMessage } from "@/lib/types/conversation";

export interface ConversationCompletionParams {
  conversationHistory: ConversationMessage[];
  currentQuestion: string;
  customerId: string;
  temperature?: number;
  maxTokens?: number;
}

export interface BaseProvider {
  // Existing methods...
  complete(params: CompletionParams): Promise<string>;

  // NEW: Conversation-aware completion with caching
  completeWithConversation(
    params: ConversationCompletionParams,
  ): Promise<string>;

  // NEW: Build conversation history prompt
  buildConversationHistory(messages: ConversationMessage[]): string;
}
```

### Step 2.2: Implement Claude Provider with Prompt Caching

**File:** `lib/ai/providers/claude-provider.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type {
  BaseProvider,
  ConversationCompletionParams,
} from "../base-provider.interface";
import type { ConversationMessage } from "@/lib/types/conversation";

export class ClaudeProvider implements BaseProvider {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Conversation-aware completion with prompt caching
   * Caches: schema, ontology, SQL instructions (90% savings)
   */
  async completeWithConversation(
    params: ConversationCompletionParams,
  ): Promise<string> {
    // Build system prompt with caching
    const systemPrompt = [
      {
        type: "text" as const,
        text: await this.buildSchemaContext(params.customerId),
        cache_control: { type: "ephemeral" as const }, // ← Cache database schema
      },
      {
        type: "text" as const,
        text: await this.buildOntologyContext(params.customerId),
        cache_control: { type: "ephemeral" as const }, // ← Cache ontology
      },
      {
        type: "text" as const,
        text: this.buildSQLInstructions(),
        cache_control: { type: "ephemeral" as const }, // ← Cache SQL rules
      },
    ];

    // Build conversation history (NOT cached - changes each message)
    const conversationPrompt = this.buildConversationHistory(
      params.conversationHistory,
    );

    const fullPrompt =
      conversationPrompt + "\n\nCurrent question: " + params.currentQuestion;

    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature || 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: fullPrompt,
        },
      ],
    });

    return response.content[0].text;
  }

  /**
   * Build conversation history from messages
   * Only includes SQL and result summaries (not actual data!)
   */
  buildConversationHistory(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return "This is the first question in the conversation.";
    }

    let history = "Previous conversation:\n\n";

    // Only include last 5 messages to control token usage
    const recent = messages.slice(-5);

    for (const msg of recent) {
      if (msg.role === "user") {
        history += `User asked: "${msg.content}"\n`;
      } else if (msg.role === "assistant") {
        const meta = msg.metadata;

        // Include SQL query (not results!)
        if (meta.sql) {
          history += `Assistant generated SQL:\n`;
          history += `\`\`\`sql\n${meta.sql}\n\`\`\`\n`;
          history += `Result: ${meta.resultSummary?.rowCount || 0} records`;

          if (meta.resultSummary?.columns) {
            history += `, columns: ${meta.resultSummary.columns.join(", ")}`;
          }

          history += "\n\n";
        }
      }
    }

    history += "\nInstructions:\n";
    history +=
      "- If the current question references previous results (uses 'which ones', 'those', 'they'), ";
    history += "build on the most recent SQL using CTE composition.\n";
    history +=
      "- If the current question is unrelated, generate a fresh query.\n";

    return history;
  }

  /**
   * Token usage with caching:
   * - First message: 5000 tokens (schema) + 200 tokens (conversation) = 5200 tokens
   * - Second message: 500 tokens (cached read) + 400 tokens (conversation) = 900 tokens
   * - Subsequent: ~600 tokens each (90% cached)
   *
   * 10-message conversation:
   * - Without caching: ~52,000 tokens ($1.06)
   * - With caching: ~9,700 tokens ($0.11)
   * - Savings: 81%
   */
}
```

### Step 2.3: Implement Gemini Provider with Context Caching

**File:** `lib/ai/providers/gemini-provider.ts`

> **⚠️ SINGLE-INSTANCE DEPLOYMENT NOTE:**  
> The reference implementation below uses Redis for cache storage to support multi-instance deployments.  
> For single-instance deployments, an in-memory Map can be used instead (see actual implementation).  
> Trade-off: In-memory cache won't survive server restarts, but eliminates Redis dependency.

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  BaseProvider,
  ConversationCompletionParams,
} from "../base-provider.interface";
import type { ConversationMessage } from "@/lib/types/conversation";
import { redis } from "@/lib/db";

export class GeminiProvider implements BaseProvider {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  }

  async completeWithConversation(
    params: ConversationCompletionParams,
  ): Promise<string> {
    // Get or create cached content
    const cacheKey = await this.getCacheKey(params.customerId);
    let cachedContent = await this.getCachedContent(cacheKey);

    if (!cachedContent) {
      // First time: Create cached content
      cachedContent = await this.createCachedContent(
        cacheKey,
        params.customerId,
      );
    }

    // Use cached content as base
    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      cachedContent: cachedContent.name,
    });

    // Build conversation prompt
    const conversationPrompt = this.buildConversationHistory(
      params.conversationHistory,
    );

    const fullPrompt =
      conversationPrompt + "\n\nCurrent question: " + params.currentQuestion;

    const result = await model.generateContent(fullPrompt);
    return result.response.text();
  }

  buildConversationHistory(messages: ConversationMessage[]): string {
    // Same implementation as Claude
    // ... (copy from ClaudeProvider)
  }

  /**
   * Create cached content with schema, ontology, and instructions
   */
  private async createCachedContent(cacheKey: string, customerId: string) {
    const cachedContent = await this.genAI.cacheManager.create({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: await this.buildSchemaContext(customerId) },
            { text: await this.buildOntologyContext(customerId) },
            { text: this.buildSQLInstructions() },
          ],
        },
      ],
      ttlSeconds: 3600, // Cache for 1 hour
      displayName: `schema-${cacheKey}`,
    });

    // Store reference in Redis (or in-memory Map for single-instance)
    await redis.set(
      `gemini:cache:${cacheKey}`,
      cachedContent.name,
      "EX",
      3600, // 1 hour TTL
    );

    return cachedContent;
  }

  /**
   * Get cached content from Gemini API
   */
  private async getCachedContent(cacheKey: string) {
    const cacheName = await redis.get(`gemini:cache:${cacheKey}`);
    if (!cacheName) return null;

    try {
      return await this.genAI.cacheManager.get(cacheName);
    } catch (error) {
      // Cache expired or invalid
      await redis.del(`gemini:cache:${cacheKey}`);
      return null;
    }
  }

  /**
   * Cache key based on schema version and customer
   */
  private async getCacheKey(customerId: string): string {
    const schemaVersion = process.env.SCHEMA_VERSION || "v1";
    const ontologyVersion = process.env.ONTOLOGY_VERSION || "v1";
    return `${customerId}_${schemaVersion}_${ontologyVersion}`;
  }
}
```

### Step 2.4: Update Provider Factory ✅ **COMPLETE**

**Status:** Already implemented with production-grade enhancements

**Actual Implementation:** `lib/ai/providers/provider-factory.ts`

The actual implementation exceeds the reference design with:

- ✅ Model-based provider selection (not just string matching)
- ✅ Provider health checks and automatic failover
- ✅ Graceful degradation when primary provider unavailable
- ✅ Supports Claude, Gemini, and OpenWebUI providers
- ✅ Both `completeWithConversation()` and `buildConversationHistory()` implemented in providers

**Reference Design (Simple Version):**

**File:** `lib/ai/get-provider.ts`

```typescript
import { ClaudeProvider } from "./providers/claude-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import type { BaseProvider } from "./base-provider.interface";

export async function getAIProvider(modelId?: string): Promise<BaseProvider> {
  const provider = modelId || process.env.DEFAULT_AI_PROVIDER || "claude";

  if (provider.includes("claude")) {
    return new ClaudeProvider();
  } else if (provider.includes("gemini")) {
    return new GeminiProvider();
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

**Note:** The production implementation in `provider-factory.ts` is more robust and should be used as the source of truth.

### Step 2.5: Performance Testing

```bash
# Test token usage with caching

# First message (cache write)
curl -X POST http://localhost:3000/api/insights/conversation/send \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test-customer",
    "question": "Show female patients",
    "modelId": "claude-3-5-sonnet-20241022"
  }'

# Expected: ~5200 tokens (full context)

# Second message (cache read)
curl -X POST http://localhost:3000/api/insights/conversation/send \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "from-first-response",
    "customerId": "test-customer",
    "question": "Which ones are older than 40?",
    "modelId": "claude-3-5-sonnet-20241022"
  }'

# Expected: ~600 tokens (90% cached)
```

### Phase 2 Completion Summary

**Status:** ✅ **COMPLETE** (2026-01-19)

All Phase 2 steps have been implemented:

- [x] **Step 2.1:** Updated BaseProvider Interface with conversation-aware methods ✅
- [x] **Step 2.2:** Claude Provider with prompt caching (`cache_control`) ✅
- [x] **Step 2.3:** Gemini Provider with context caching (`cachedContent` API) ✅
- [x] **Step 2.4:** Provider factory updated with conversation support ✅
- [ ] **Step 2.5:** Performance testing (pending integration testing)

**Key Achievements:**

- ✅ Both Claude and Gemini providers support `completeWithConversation()` with native caching
- ✅ Token usage logging with cache efficiency metrics implemented
- ✅ Provider factory includes health checks and automatic failover
- ✅ Conversation history building limits to last 5 messages (~1000 tokens)
- ✅ Interface definitions in `IQueryFunnelProvider` complete

**Next Step:** Phase 3 - SQL Composition Service

---

## Phase 3: SQL Composition Service

### Overview

This phase implements the Compound SQL Approach using CTEs to build on previous queries without storing result data.

**Key Design Decision:** Instead of using brittle regex patterns to detect question relationships, we leverage AI to semantically understand whether the current question builds on previous results. This aligns with our AI-first philosophy and mirrors how ChatGPT handles conversation context.

### Step 3.1: Create SQL Composer Service

**File:** `lib/services/sql-composer.service.ts`

```typescript
import type { BaseProvider } from "@/lib/ai/base-provider.interface";

export interface ComposedQuery {
  sql: string;
  strategy: "cte" | "merged_where" | "fresh";
  isBuildingOnPrevious: boolean;
  reasoning?: string;
}

export interface CompositionDecision {
  shouldCompose: boolean;
  reasoning: string;
  confidence: number;
}

export class SqlComposerService {
  /**
   * Use AI to determine if current question builds on previous query.
   * This replaces brittle regex patterns with semantic understanding.
   *
   * Examples:
   * - "Show female patients" → "Which ones are older than 40?" = COMPOSE (filtering previous)
   * - "Show female patients" → "Show male patients" = FRESH (different subset)
   * - "Show patients with wounds" → "What's their average age?" = COMPOSE (aggregating previous)
   * - "How many patients?" → "How many clinics?" = FRESH (different entity)
   */
  async shouldComposeQuery(
    currentQuestion: string,
    previousQuestion: string,
    previousSql: string,
    provider: BaseProvider,
  ): Promise<CompositionDecision> {
    const prompt = this.buildCompositionDecisionPrompt(
      previousQuestion,
      currentQuestion,
      previousSql,
    );

    try {
      const response = await provider.complete({
        system: this.getCompositionDecisionSystemPrompt(),
        userMessage: prompt,
        temperature: 0.0, // Deterministic for consistent decisions
      });

      const parsed = this.parseCompositionDecision(response);
      return parsed;
    } catch (error) {
      console.error(
        "[SqlComposerService] Failed to determine composition:",
        error,
      );
      // Fallback: assume fresh query on error
      return {
        shouldCompose: false,
        reasoning:
          "Error determining relationship; generating fresh query for safety",
        confidence: 0.0,
      };
    }
  }

  /**
   * Build prompt for composition decision
   */
  private buildCompositionDecisionPrompt(
    previousQuestion: string,
    currentQuestion: string,
    previousSql: string,
  ): string {
    return `
You are analyzing a conversation about healthcare data to determine query relationships.

**Previous question:** "${previousQuestion}"

**Previous SQL:**
\`\`\`sql
${previousSql}
\`\`\`

**Current question:** "${currentQuestion}"

**Task:** Determine if the current question BUILDS ON the previous question's results, or is an INDEPENDENT question.

**BUILDS ON (shouldCompose: true):**
- Filtering previous results: "Show female patients" → "Which ones are older than 40?"
- Aggregating previous results: "Show patients with wounds" → "What's their average age?"
- Refining previous query: "List all assessments" → "Only show from last month"
- Using pronouns referencing previous: "Show patients" → "Which ones have diabetes?"

**INDEPENDENT (shouldCompose: false):**
- Different subset of same entity: "Show female patients" → "Show male patients"
- Completely different entity: "How many patients?" → "How many clinics?"
- Different time period (new analysis): "Show Q1 data" → "Show Q2 data"
- Parallel question (not building): "Count active wounds" → "Count healed wounds"

Return JSON with your analysis:
{
  "shouldCompose": boolean,
  "reasoning": "brief explanation of why you chose this",
  "confidence": number between 0.0 and 1.0
}
`;
  }

  /**
   * System prompt for composition decisions
   */
  private getCompositionDecisionSystemPrompt(): string {
    return `You are a SQL query relationship analyzer for healthcare data conversations.

Your task is to determine if a current question builds upon (filters/aggregates/refines) previous query results, 
or is an independent question requiring fresh data retrieval.

Key principles:
- Questions with pronouns (which ones, those, they) almost always build on previous
- Questions with vague aggregations (what's the average?, how many?) without entity names likely build on previous
- Questions with explicit entity names (show male patients, count clinics) are usually independent
- Time period shifts without pronouns are usually independent (Q1 → Q2)

Return ONLY a valid JSON object. No markdown, no explanations outside JSON.`;
  }

  /**
   * Parse AI response for composition decision
   */
  private parseCompositionDecision(response: string): CompositionDecision {
    // Extract JSON from response (handle markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in composition decision response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate response structure
    if (typeof parsed.shouldCompose !== "boolean") {
      throw new Error(
        "Invalid composition decision: missing shouldCompose boolean",
      );
    }

    return {
      shouldCompose: parsed.shouldCompose,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: parsed.confidence || 1.0,
    };
  }

  /**
   * Compose SQL that builds on previous query.
   * Called after shouldComposeQuery() returns true.
   */
  async composeQuery(
    previousSql: string,
    previousQuestion: string,
    currentQuestion: string,
    provider: BaseProvider,
  ): Promise<ComposedQuery> {
    const prompt = this.buildCompositionPrompt(
      previousSql,
      previousQuestion,
      currentQuestion,
    );

    const response = await provider.complete({
      system: this.getCompositionSystemPrompt(),
      userMessage: prompt,
      temperature: 0.1, // Low for deterministic SQL
    });

    return this.parseCompositionResponse(response);
  }

  /**
   * Build composition prompt
   */
  private buildCompositionPrompt(
    previousSql: string,
    previousQuestion: string,
    currentQuestion: string,
  ): string {
    return `
Previous question: "${previousQuestion}"
Previous SQL:
\`\`\`sql
${previousSql}
\`\`\`

Current question: "${currentQuestion}"

Task: Generate SQL that builds on the previous query.

**Composition Strategies:**

1. **CTE Composition** (preferred): Wrap previous query in CTE
   Example:
   WITH previous_result AS (
     ${previousSql}
   )
   SELECT * FROM previous_result WHERE <additional_filters>

2. **Merged WHERE**: Add to existing WHERE clause
   Use when previous query can be extended simply

3. **Fresh Query**: Generate new SQL if unrelated

Return JSON:
{
  "strategy": "cte" | "merged_where" | "fresh",
  "sql": "...",
  "reasoning": "why this strategy was chosen"
}
`;
  }

  /**
   * System prompt for composition
   */
  private getCompositionSystemPrompt(): string {
    return `You are a SQL query composer for healthcare data analysis.

Your task is to generate SQL that builds upon previous queries in a conversation.

**Context Carryover Rules:**

1. When user says "which ones", "those", "they":
   → Build on previous query using CTE
   
2. When user asks aggregation on previous results:
   → Wrap previous query, then aggregate
   
3. When user asks completely different question:
   → Generate fresh SQL (ignore previous)

4. Efficiency rules:
   → Don't nest CTEs more than 3 levels
   → If composition gets complex, merge WHERE clauses instead
   → Never use temp tables or result storage

**Privacy Requirements:**
- NEVER suggest storing query results
- NEVER suggest CREATE TEMP TABLE
- Always use CTEs for composition

**Output Format:**
Return ONLY the JSON object. No markdown, no explanation outside the JSON.
`;
  }

  /**
   * Parse LLM response
   */
  private parseCompositionResponse(response: string): ComposedQuery {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid composition response: no JSON found");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      sql: parsed.sql,
      strategy: parsed.strategy,
      isBuildingOnPrevious: parsed.strategy !== "fresh",
      reasoning: parsed.reasoning,
    };
  }

  /**
   * Validate composed SQL
   */
  validateComposedSql(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for forbidden patterns
    if (/CREATE\s+TEMP/i.test(sql)) {
      errors.push("Temporary tables are not allowed");
    }

    if (/INTO\s+TEMP/i.test(sql)) {
      errors.push("Cannot insert into temporary tables");
    }

    // Check CTE depth
    const cteCount = (sql.match(/WITH\s+\w+\s+AS/gi) || []).length;
    if (cteCount > 3) {
      errors.push(`Too many nested CTEs (${cteCount}, max 3)`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

### Benefits of AI-Driven Composition Decision

| Aspect                     | Old Regex Approach                   | New AI Approach                           |
| -------------------------- | ------------------------------------ | ----------------------------------------- |
| **Semantic understanding** | ❌ Keyword matching only             | ✅ True intent recognition                |
| **Edge cases**             | ❌ Must hardcode each pattern        | ✅ Handles naturally                      |
| **Maintainability**        | ❌ Update regex patterns             | ✅ Self-adapting                          |
| **Language support**       | ❌ English-specific patterns         | ✅ Language-agnostic                      |
| **Consistency**            | ❌ Different from other AI decisions | ✅ Aligned with project AI-first approach |

**Example Decisions:**

```typescript
// Scenario 1: Clear composition
Q1: "Show female patients"
Q2: "Which ones are older than 40?"
Decision: { shouldCompose: true, reasoning: "Uses pronoun 'which ones' referencing previous female patients", confidence: 0.95 }

// Scenario 2: Independent queries
Q1: "How many female patients?"
Q2: "How many male patients?"
Decision: { shouldCompose: false, reasoning: "Different subset (male vs female), parallel independent queries", confidence: 0.9 }

// Scenario 3: Implicit reference
Q1: "Show patients with active wounds"
Q2: "Tell me about the older ones"
Decision: { shouldCompose: true, reasoning: "'older ones' implicitly references patients from previous query", confidence: 0.85 }

// Scenario 4: Different entity
Q1: "Show all assessments in Q1"
Q2: "How many clinics do we have?"
Decision: { shouldCompose: false, reasoning: "Completely different entity (assessments vs clinics)", confidence: 1.0 }
```

### Step 3.2: Add SQL Composition Prompt

**File:** `lib/prompts/sql-composition.prompt.ts`

```typescript
export const SQL_COMPOSITION_EXAMPLES = `
**Example 1 - Filter refinement:**
Previous Q: "Show patients with wounds"
Previous SQL: SELECT * FROM Patient WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = Patient.id)
Current Q: "Which ones have infections?"
Strategy: CTE
Output SQL:
WITH previous_result AS (
  SELECT * FROM Patient WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = Patient.id)
)
SELECT * FROM previous_result
WHERE EXISTS (SELECT 1 FROM Wound WHERE patientId = previous_result.id AND infected = 1)

**Example 2 - Aggregation on previous:**
Previous Q: "Show female patients"
Previous SQL: SELECT * FROM Patient WHERE gender = 'Female'
Current Q: "What's their average age?"
Strategy: CTE
Output SQL:
WITH previous_result AS (
  SELECT * FROM Patient WHERE gender = 'Female'
)
SELECT AVG(age) as average_age FROM previous_result

**Example 3 - Fresh query:**
Previous Q: "Show patients older than 60"
Previous SQL: SELECT * FROM Patient WHERE age > 60
Current Q: "How many clinics are there?"
Strategy: Fresh
Output SQL:
SELECT COUNT(*) as clinic_count FROM Clinic
`;
```

---

## Phase 4: API Endpoints

### Step 4.1: Create Conversation Types

**File:** `lib/types/conversation.ts`

```typescript
import type { InsightResult } from "@/lib/hooks/useInsights";

export interface ConversationThread {
  id: string;
  userId: number;
  customerId: string;
  title?: string;
  contextCache: ConversationContext;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  result?: InsightResult;
  metadata: MessageMetadata;
  createdAt: Date;
}

export interface MessageMetadata {
  // For user messages
  originalQuestion?: string;
  wasEdited?: boolean;
  editedAt?: Date;

  // For assistant messages
  modelUsed?: string;
  executionTimeMs?: number;
  sql?: string;
  mode?: "template" | "direct" | "funnel" | "clarification";
  resultSummary?: {
    rowCount: number;
    columns: string[];
  };
}

export interface ConversationContext {
  customerId: string;
  referencedResultSets?: Array<{
    messageId: string;
    rowCount: number;
    columns: string[];
  }>;
  activeFilters?: any[];
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}

export interface SmartSuggestion {
  text: string;
  icon?: string;
  category: "drill-down" | "comparison" | "trend" | "related";
  confidence?: number;
}
```

### Step 4.2: POST /api/insights/conversation/send

**File:** `app/api/insights/conversation/send/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { pool } from "@/lib/db";
import { getAIProvider } from "@/lib/ai/get-provider";
import { SqlComposerService } from "@/lib/services/sql-composer.service";
import { ConversationAuditService } from "@/lib/services/conversation-audit.service";
import { ThreeModeOrchestrator } from "@/lib/services/semantic/three-mode-orchestrator.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { threadId, customerId, question, modelId } = body;

    // Validate inputs
    if (!customerId || !question?.trim()) {
      return NextResponse.json(
        { error: "customerId and question are required" },
        { status: 400 },
      );
    }

    const userId = parseInt(session.user.id, 10);
    let currentThreadId = threadId;

    // Step 1: Create or load thread
    if (!currentThreadId) {
      const result = await pool.query(
        `INSERT INTO "ConversationThreads" 
         ("userId", "customerId", "title", "contextCache") 
         VALUES ($1, $2, $3, $4) 
         RETURNING id`,
        [userId, customerId, question.slice(0, 100), JSON.stringify({})],
      );
      currentThreadId = result.rows[0].id;
    } else {
      // Verify thread belongs to user
      const result = await pool.query(
        `SELECT id FROM "ConversationThreads" 
         WHERE id = $1 AND "userId" = $2`,
        [currentThreadId, userId],
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "Thread not found or access denied" },
          { status: 404 },
        );
      }
    }

    // Step 2: Save user message
    const userMsgResult = await pool.query(
      `INSERT INTO "ConversationMessages" 
       ("threadId", "role", "content", "metadata") 
       VALUES ($1, 'user', $2, $3) 
       RETURNING id, "createdAt"`,
      [currentThreadId, question, JSON.stringify({})],
    );

    const userMessageId = userMsgResult.rows[0].id;

    // Step 3: Load conversation history
    const conversationHistory = await loadConversationHistory(currentThreadId);

    // Step 4: Use AI to determine if we should compose on previous query
    const sqlComposer = new SqlComposerService();
    const provider = await getAIProvider(modelId);
    const lastMessage = conversationHistory[conversationHistory.length - 1];

    let compositionDecision = {
      shouldCompose: false,
      reasoning: "No previous query",
      confidence: 1.0,
    };

    if (lastMessage?.metadata?.sql) {
      compositionDecision = await sqlComposer.shouldComposeQuery(
        question,
        lastMessage.content,
        lastMessage.metadata.sql,
        provider,
      );

      console.log(
        `[Composition Decision] ${
          compositionDecision.shouldCompose ? "COMPOSE" : "FRESH"
        } ` +
          `(confidence: ${compositionDecision.confidence}): ${compositionDecision.reasoning}`,
      );
    }

    let result;
    let compositionStrategy: "cte" | "merged_where" | "fresh" = "fresh";
    let parentQueryHistoryId: number | undefined;

    if (compositionDecision.shouldCompose && lastMessage?.metadata?.sql) {
      // Compose on previous SQL using AI-determined strategy
      const composed = await sqlComposer.composeQuery(
        lastMessage.metadata.sql,
        lastMessage.content,
        question,
        provider,
      );

      compositionStrategy = composed.strategy;

      // Execute composed SQL
      const orchestrator = new ThreeModeOrchestrator();
      result = await orchestrator.executeComposedSQL(composed.sql, customerId, {
        originalQuestion: question,
        previousQuestion: lastMessage.content,
        compositionStrategy: composed.strategy,
        compositionReasoning: compositionDecision.reasoning,
        reasoning: composed.reasoning,
      });

      // Track parent query for audit
      parentQueryHistoryId = lastMessage.metadata?.queryHistoryId;
    } else {
      // Fresh query (normal flow with conversation context)
      // Note: Conversation context still helps AI understand domain,
      // but we're not building on previous SQL results

      // Use AI vendor context caching
      const sqlResponse = await provider.completeWithConversation({
        conversationHistory,
        currentQuestion: question,
        customerId,
      });

      // Execute the SQL
      const orchestrator = new ThreeModeOrchestrator();
      result = await orchestrator.executeSQLFromLLM(
        sqlResponse,
        customerId,
        question,
      );
    }

    const executionTime = Date.now() - startTime;

    // Step 5: Save assistant message
    const assistantMetadata = {
      modelUsed: modelId,
      sql: result.sql,
      mode: result.mode,
      compositionStrategy,
      resultSummary: {
        rowCount: result.results?.rows.length || 0,
        columns: result.results?.columns || [],
      },
      executionTimeMs: executionTime,
    };

    const assistantMsgResult = await pool.query(
      `INSERT INTO "ConversationMessages" 
       ("threadId", "role", "content", "metadata") 
       VALUES ($1, 'assistant', $2, $3) 
       RETURNING id, "createdAt"`,
      [
        currentThreadId,
        generateResponseText(result),
        JSON.stringify(assistantMetadata),
      ],
    );

    // Step 6: Log to audit trail
    const auditService = new ConversationAuditService();
    const queryHistoryId = await auditService.logConversationQuery({
      threadId: currentThreadId,
      messageId: assistantMsgResult.rows[0].id,
      question,
      sql: result.sql || "",
      customerId,
      userId,
      parentQueryHistoryId,
      compositionStrategy,
      resultCount: result.results?.rows.length || 0,
      executionTimeMs: executionTime,
    });

    // Update assistant metadata with query history ID
    assistantMetadata.queryHistoryId = queryHistoryId;
    await pool.query(
      `UPDATE "ConversationMessages" 
       SET metadata = $1 
       WHERE id = $2`,
      [JSON.stringify(assistantMetadata), assistantMsgResult.rows[0].id],
    );

    // Step 7: Update context cache
    await updateContextCache(currentThreadId, result);

    // Step 8: Return response
    return NextResponse.json({
      threadId: currentThreadId,
      userMessageId,
      message: {
        id: assistantMsgResult.rows[0].id,
        role: "assistant",
        content: generateResponseText(result),
        result,
        metadata: assistantMetadata,
        createdAt: assistantMsgResult.rows[0].createdAt,
      },
      compositionStrategy,
      executionTimeMs: executionTime,
    });
  } catch (error) {
    console.error("[/api/insights/conversation/send] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to send message",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Load conversation history from database
 */
async function loadConversationHistory(
  threadId: string,
): Promise<ConversationMessage[]> {
  const result = await pool.query(
    `SELECT id, role, content, metadata, "createdAt"
     FROM "ConversationMessages" 
     WHERE "threadId" = $1 
     ORDER BY "createdAt" ASC`,
    [threadId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    threadId,
    role: row.role,
    content: row.content,
    metadata: row.metadata || {},
    createdAt: row.createdAt,
  }));
}

/**
 * Update thread context cache
 */
async function updateContextCache(threadId: string, result: any) {
  const contextCache = {
    lastResultSet: {
      rowCount: result.results?.rows.length || 0,
      columns: result.results?.columns || [],
    },
    lastSQL: result.sql,
    updatedAt: new Date(),
  };

  await pool.query(
    `UPDATE "ConversationThreads" 
     SET "contextCache" = $1 
     WHERE id = $2`,
    [JSON.stringify(contextCache), threadId],
  );
}

/**
 * Generate human-readable response text
 */
function generateResponseText(result: any): string {
  const rowCount = result.results?.rows.length || 0;

  if (result.mode === "clarification") {
    return "I need some clarification before I can answer that question.";
  }

  if (result.error) {
    return `I encountered an error: ${result.error.message}`;
  }

  if (rowCount === 0) {
    return "I didn't find any matching records.";
  }

  if (rowCount === 1) {
    return "Found 1 record matching your criteria.";
  }

  return `Found ${rowCount} records matching your criteria.`;
}
```

### Step 4.3: GET /api/insights/conversation/:threadId

**File:** `app/api/insights/conversation/[threadId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { pool } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { threadId } = params;
    const userId = parseInt(session.user.id, 10);

    // Load thread
    const threadResult = await pool.query(
      `SELECT * FROM "ConversationThreads" 
       WHERE id = $1 AND "userId" = $2`,
      [threadId, userId],
    );

    if (threadResult.rows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const thread = threadResult.rows[0];

    // Load messages
    const messagesResult = await pool.query(
      `SELECT * FROM "ConversationMessages" 
       WHERE "threadId" = $1 
       ORDER BY "createdAt" ASC`,
      [threadId],
    );

    const messages = messagesResult.rows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      role: row.role,
      content: row.content,
      metadata: row.metadata || {},
      createdAt: row.createdAt,
    }));

    return NextResponse.json({
      thread: {
        id: thread.id,
        userId: thread.userId,
        customerId: thread.customerId,
        title: thread.title,
        contextCache: thread.contextCache || {},
        isActive: thread.isActive,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      messages,
    });
  } catch (error) {
    console.error("[/api/insights/conversation/:threadId] Error:", error);
    return NextResponse.json(
      { error: "Failed to load conversation" },
      { status: 500 },
    );
  }
}
```

### Step 4.4: POST /api/insights/conversation/new

**File:** `app/api/insights/conversation/new/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { customerId, title } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }

    const userId = parseInt(session.user.id, 10);

    const result = await pool.query(
      `INSERT INTO "ConversationThreads" 
       ("userId", "customerId", "title", "contextCache") 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, "createdAt"`,
      [userId, customerId, title || null, JSON.stringify({})],
    );

    return NextResponse.json({
      threadId: result.rows[0].id,
      createdAt: result.rows[0].createdAt,
    });
  } catch (error) {
    console.error("[/api/insights/conversation/new] Error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
```

### Step 4.5: GET /api/insights/conversation/history

**File:** `app/api/insights/conversation/history/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const customerId = searchParams.get("customerId");
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const userId = parseInt(session.user.id, 10);

    // Build query
    let query = `
      SELECT 
        t.id,
        t.title,
        t."customerId",
        c."customerName",
        t."updatedAt",
        COUNT(m.id) as "messageCount",
        (
          SELECT content 
          FROM "ConversationMessages" 
          WHERE "threadId" = t.id AND role = 'user' 
          ORDER BY "createdAt" ASC 
          LIMIT 1
        ) as preview
      FROM "ConversationThreads" t
      LEFT JOIN "Customer" c ON t."customerId" = c.id
      LEFT JOIN "ConversationMessages" m ON m."threadId" = t.id
      WHERE t."userId" = $1 AND t."isActive" = true
    `;

    const params: any[] = [userId];
    let paramIndex = 2;

    if (customerId) {
      query += ` AND t."customerId" = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    query += `
      GROUP BY t.id, c."customerName"
      ORDER BY t."updatedAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total 
       FROM "ConversationThreads" 
       WHERE "userId" = $1 AND "isActive" = true
       ${customerId ? 'AND "customerId" = $2' : ""}`,
      customerId ? [userId, customerId] : [userId],
    );

    return NextResponse.json({
      threads: result.rows.map((row) => ({
        id: row.id,
        title: row.title || row.preview?.slice(0, 50) + "..." || "Untitled",
        customerId: row.customerId,
        customerName: row.customerName,
        messageCount: parseInt(row.messageCount, 10),
        lastMessageAt: row.updatedAt,
        preview: row.preview || "",
      })),
      total: parseInt(countResult.rows[0].total, 10),
    });
  } catch (error) {
    console.error("[/api/insights/conversation/history] Error:", error);
    return NextResponse.json(
      { error: "Failed to load history" },
      { status: 500 },
    );
  }
}
```

---

## Phase 5: Conversation Hook

### Step 5.1: Create useConversation Hook

**File:** `lib/hooks/useConversation.ts`

```typescript
import { useState, useCallback, useRef } from "react";
import type {
  ConversationMessage,
  ConversationThread,
} from "@/lib/types/conversation";

interface UseConversationReturn {
  threadId: string | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (
    question: string,
    customerId: string,
    modelId?: string,
  ) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  startNewConversation: () => void;
  loadConversation: (threadId: string) => Promise<void>;
}

export function useConversation(): UseConversationReturn {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Send a message in the current conversation
   */
  const sendMessage = useCallback(
    async (question: string, customerId: string, modelId?: string) => {
      // Cancel any ongoing request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Optimistically add user message
      const tempId = `temp-${Date.now()}`;
      const userMessage: ConversationMessage = {
        id: tempId,
        threadId: threadId || "",
        role: "user",
        content: question,
        metadata: {},
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/insights/conversation/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            customerId,
            question,
            modelId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to send message");
        }

        const data = await response.json();

        // Update thread ID if this was the first message
        if (!threadId) {
          setThreadId(data.threadId);
        }

        // Replace temp user message with real one and add assistant response
        setMessages((prev) => {
          const withoutTemp = prev.filter((msg) => msg.id !== tempId);
          return [
            ...withoutTemp,
            {
              ...userMessage,
              id: data.userMessageId,
              threadId: data.threadId,
            },
            data.message,
          ];
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was cancelled
          return;
        }

        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);

        // Remove optimistic user message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [threadId],
  );

  /**
   * Edit a message and re-run from that point
   */
  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/insights/conversation/messages/${messageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newContent }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to edit message");
        }

        const data = await response.json();

        // Update messages: replace edited message and remove discarded ones
        setMessages((prev) => {
          const editedIndex = prev.findIndex((msg) => msg.id === messageId);
          if (editedIndex === -1) return prev;

          // Keep messages up to (not including) the edited one
          const kept = prev.slice(0, editedIndex);

          // Add the updated messages
          return [...kept, data.message, data.newAssistantMessage];
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Start a new conversation
   */
  const startNewConversation = useCallback(() => {
    setThreadId(null);
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Load an existing conversation from history
   */
  const loadConversation = useCallback(async (loadThreadId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/insights/conversation/${loadThreadId}`,
      );

      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }

      const data = await response.json();

      setThreadId(data.thread.id);
      setMessages(data.messages);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    threadId,
    messages,
    isLoading,
    error,
    sendMessage,
    editMessage,
    startNewConversation,
    loadConversation,
  };
}
```

---

## Phase 6: UI Components

### Step 6.1: Create ConversationInput Component

**File:** `app/insights/new/components/ConversationInput.tsx`

```typescript
"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface ConversationInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ConversationInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Ask a question...",
}: ConversationInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 300);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Auto-focus when enabled
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[100px] max-h-[300px] pr-12 resize-none text-base border-2 focus:ring-2 focus:ring-blue-500 rounded-xl"
        rows={3}
        autoComplete="off"
        data-form-type="other"
        data-1p-ignore
        data-lpignore="true"
        spellCheck={true}
      />

      <Button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        className="absolute bottom-3 right-3 rounded-full h-10 w-10"
      >
        <Send className="h-4 w-4" />
      </Button>

      <p className="text-xs text-gray-500 mt-2">
        {disabled
          ? "Select a customer to get started"
          : "Press Ctrl+Enter to send"}
      </p>
    </div>
  );
}
```

### Step 6.2: Create UserMessage Component

**File:** `app/insights/new/components/UserMessage.tsx`

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UserMessageProps {
  message: {
    id: string;
    content: string;
    createdAt: Date;
  };
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
}

export function UserMessage({ message, onEdit }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveEdit = async () => {
    if (!onEdit || editedContent.trim() === message.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onEdit(message.id, editedContent);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save edit:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(message.content);
    setIsEditing(false);
  };

  return (
    <div className="flex justify-end mb-6">
      <div className="max-w-2xl">
        {isEditing ? (
          <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="min-h-[80px] mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={isSaving || !editedContent.trim()}
              >
                <Check className="h-4 w-4 mr-1" />
                {isSaving ? "Saving..." : "Save & Re-run"}
              </Button>
            </div>
            <p className="text-xs text-amber-600 mt-2">
              ⚠️ This will discard all messages after this one
            </p>
          </div>
        ) : (
          <div className="bg-blue-600 text-white rounded-2xl px-4 py-3">
            <p className="whitespace-pre-wrap">{message.content}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-blue-100">
              <span>
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: true,
                })}
              </span>
              {onEdit && (
                <>
                  <span>•</span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="hover:text-white flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 6.3: Create AssistantMessage Component

**File:** `app/insights/new/components/AssistantMessage.tsx`

```typescript
"use client";

import { InsightResult } from "@/lib/hooks/useInsights";
import { ResultsTable } from "./ResultsTable";
import { MessageActions } from "./MessageActions";
import { ThinkingStream } from "./ThinkingStream";
import { formatDistanceToNow } from "date-fns";

interface AssistantMessageProps {
  message: {
    id: string;
    content: string;
    result?: InsightResult;
    createdAt: Date;
    isLoading?: boolean;
  };
  customerId: string;
  showActions?: boolean;
}

export function AssistantMessage({
  message,
  customerId,
  showActions = true,
}: AssistantMessageProps) {
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-3xl w-full">
        <div className="bg-white border rounded-2xl shadow-sm p-6">
          {/* Message header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">
              AI
            </div>
            <div className="flex-1">
              <p className="text-gray-800">{message.content}</p>
              <span className="text-xs text-gray-400 mt-1 block">
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>

          {/* Loading state */}
          {message.isLoading && message.result?.thinking && (
            <div className="mt-4">
              <ThinkingStream steps={message.result.thinking} />
            </div>
          )}

          {/* Results */}
          {message.result && !message.isLoading && message.result.results && (
            <div className="mt-4">
              <ResultsTable
                columns={message.result.results.columns}
                rows={message.result.results.rows}
                maxRows={10}
              />
            </div>
          )}

          {/* Actions for this specific result */}
          {showActions && message.result && !message.isLoading && (
            <div className="mt-4 pt-4 border-t">
              <MessageActions
                result={message.result}
                customerId={customerId}
                messageId={message.id}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 6.4: Create ResultsTable Component

**File:** `app/insights/new/components/ResultsTable.tsx`

```typescript
"use client";

interface ResultsTableProps {
  columns: string[];
  rows: any[];
  maxRows?: number;
}

export function ResultsTable({
  columns,
  rows,
  maxRows = 10,
}: ResultsTableProps) {
  const displayRows = rows.slice(0, maxRows);
  const hasMore = rows.length > maxRows;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {displayRows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col} className="px-4 py-3 text-sm text-gray-900">
                  {row[col] !== null && row[col] !== undefined
                    ? String(row[col])
                    : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="text-sm text-gray-500 mt-4 text-center py-2 bg-gray-50 rounded">
          Showing first {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  );
}
```

### Step 6.5: Create MessageActions Component

**File:** `app/insights/new/components/MessageActions.tsx`

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, BarChart3, Download, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaveInsightDialog } from "./SaveInsightDialog";
import { ChartConfigurationDialog } from "@/components/charts/ChartConfigurationDialog";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface MessageActionsProps {
  result: InsightResult;
  customerId: string;
  messageId: string;
}

export function MessageActions({
  result,
  customerId,
  messageId,
}: MessageActionsProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showChartDialog, setShowChartDialog] = useState(false);

  const handleExportCSV = () => {
    if (!result.results) return;

    const { columns, rows } = result.results;

    // Create CSV content
    const csvContent = [
      columns.join(","),
      ...rows.map((row) =>
        columns
          .map((col) => {
            const value = row[col];
            // Escape values that contain commas or quotes
            if (
              typeof value === "string" &&
              (value.includes(",") || value.includes('"'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value ?? "";
          })
          .join(",")
      ),
    ].join("\n");

    // Download file
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `results-${messageId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySQL = () => {
    if (result.sql) {
      navigator.clipboard.writeText(result.sql);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowSaveDialog(true)}
        >
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowChartDialog(true)}
          disabled={!result.results || result.results.rows.length === 0}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          Chart
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCSV}
          disabled={!result.results || result.results.rows.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleCopySQL}>
              Copy SQL
            </DropdownMenuItem>
            <DropdownMenuItem>Share Link</DropdownMenuItem>
            <DropdownMenuItem>Save as Template</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SaveInsightDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        result={result}
        customerId={customerId}
      />

      {showChartDialog && result.results && (
        <ChartConfigurationDialog
          isOpen={showChartDialog}
          onClose={() => setShowChartDialog(false)}
          data={result.results.rows}
          columns={result.results.columns}
        />
      )}
    </>
  );
}
```

### Step 6.6: Add Loading & Thinking State to AssistantMessage

**Goal:** Show real-time progress indication for follow-up questions, maintaining UX parity with initial questions.

**Acceptance Criteria:**

- ✅ AI loading state displays immediately when processing follow-up question
- ✅ Animated indicator shows "AI is thinking..." with spinner
- ✅ Thinking steps stream in real-time and display progressively
- ✅ For follow-ups, thinking details are collapsed by default but expandable
- ✅ First question thinking remains expanded by default (backward compatible)
- ✅ No layout shift when thinking section appears/disappears
- ✅ Works alongside existing results display

**File:** `app/insights/new/components/AssistantMessage.tsx`

**Implementation Notes:**

1. **Detect if message is follow-up:** Add a prop `isFollowUp?: boolean` to track whether this is the first message in a thread
   - If first message (or no prior messages in thread), expand thinking by default
   - If follow-up, collapse thinking by default

2. **Update rendering logic:**
   - Move `ThinkingStream` outside the `message.isLoading` check
   - Show it whenever `message.result?.thinking` exists, regardless of loading state
   - This allows thinking to render progressively as steps arrive

3. **Loading state visualization:**

   ```typescript
   // When isLoading && !message.result?.thinking yet:
   // Show: "🤔 AI is analyzing your follow-up..."
   // Style: Light gray pill with animated spinner
   ```

4. **Collapse control for follow-ups:**
   - Modify `ThinkingStream` component to accept `collapsedByDefault?: boolean`
   - Pass `collapsedByDefault={isFollowUp}` from AssistantMessage
   - Allow user to expand via chevron (already exists)

5. **Smart scroll anchor:**
   - Add `ref` to the thinking section
   - Parent container should not auto-scroll past the thinking steps if user was reading them

---

### Step 6.7: Add Expandable "How I Got This" Context Section

**Goal:** Let users discover reasoning details for follow-up questions without cluttering initial view.

**Acceptance Criteria:**

- ✅ Expandable section appears below AI message in follow-ups
- ✅ Header shows: "How I got this answer (X steps, Y.Zs)"
- ✅ Default collapsed state for follow-ups; expanded for first question
- ✅ Chevron icon toggles expansion
- ✅ Smooth animation on expand/collapse
- ✅ Uses same `ThinkingStream` component for consistency
- ✅ Details include thinking steps, confidence scores, metrics
- ✅ Clear visual separation from main message content

**File:** `app/insights/new/components/AssistantMessage.tsx`

**Implementation Notes:**

1. **Modify component structure:**

   ```
   AssistantMessage
   ├── AI avatar + message content + timestamp
   ├── [OPTIONAL] Results table (if available)
   ├── [OPTIONAL] Message Actions (save, copy, chart, etc.)
   ├── [NEW] Thinking Context Section (collapsed by default for follow-ups)
   │   └── ThinkingStream (reused component)
   └── [OPTIONAL] Error state
   ```

2. **Conditional collapse behavior:**
   - First message in thread: `ThinkingStream` with `collapsed={false}`
   - Follow-up message: `ThinkingStream` with `collapsed={true}`
   - Use `isFollowUp` prop to determine this

3. **Visual styling:**
   - Add subtle top border to separate from results
   - Thinking section background: light gray (matches ThinkingStream default)
   - Chevron indicator on header for click affordance
   - On expand: smooth fade-in animation

4. **Pass metadata to ThinkingStream:**
   - Title: "How I got this answer" (use existing default)
   - Steps: `message.result?.thinking || []`
   - Collapsed: `isFollowUp && collapsed` state
   - Allow collapse: `true`

---

### Step 6.8: Add Context Awareness Badge

**Goal:** Show users at a glance whether answer builds on previous context or is independent.

**Acceptance Criteria:**

- ✅ Badge displays next to or below AI avatar
- ✅ Shows: "Based on X previous answers" or "New question"
- ✅ Visual color coding: teal/blue for context-aware, neutral gray for fresh
- ✅ Clickable to highlight/expand related prior messages
- ✅ Tooltip explains: "This answer uses context from your previous X questions"
- ✅ Only shows on follow-ups (not first message)
- ✅ Compact size: fits inline or on new line without breaking layout

**File:** `app/insights/new/components/AssistantMessage.tsx`

**Implementation Notes:**

1. **Data structure for tracking context:**
   - Extend `message` object with `contextDependencies?: { count: number; messageIds: string[] }`
   - Populate from API response when sending follow-up
   - AI composer service already tracks this internally; expose via API

2. **Component placement:**

   ```
   ┌─────────────────────────────────┐
   │ AI │ Message content             │
   │    │ "Based on 2 answers" 👈 NEW │
   │    │ 2 mins ago                  │
   └─────────────────────────────────┘
   ```

3. **Badge styling:**
   - Size: small pill (px-2 py-1, text-xs)
   - Colors:
     - `bg-blue-50 text-blue-700` (context-aware)
     - `bg-gray-50 text-gray-600` (fresh/independent)
   - Icon: link chain (↗) for context-aware

4. **Interactivity:**
   - Hover shows tooltip: "Uses context from questions: '...' and '...'"
   - Click highlights or scrolls to related messages in conversation
   - Optional: add light background highlight to related messages

---

### Step 6.9: Add Loading Status in Input Area

**Goal:** Provide user feedback that AI is processing follow-up, especially on slower networks.

**Acceptance Criteria:**

- ✅ Status message appears above input when AI is responding
- ✅ Shows: "⏳ AI is analyzing your follow-up..." with spinner
- ✅ Disappears when response arrives or on error
- ✅ Includes estimated time or "might take a moment"
- ✅ Non-intrusive; uses existing error/status zone
- ✅ Accessible with clear text (not icon-only)
- ✅ Graceful on mobile (stacks well with input)

**File:** `app/insights/new/components/ConversationPanel.tsx` (container) or `ConversationInput.tsx`

**Implementation Notes:**

1. **Reuse existing status zone:**
   - ConversationPanel already has error display above/below messages
   - Add new conditional: if `isLoading && messages.length > 0`, show status
   - Keep same styling as error messages (subtle pill)

2. **Status message content:**

   ```
   When first request:
   "✨ AI is composing your insights..."

   When follow-up:
   "⏳ AI is analyzing your follow-up question..." (with spinner)
   ```

3. **Spinner animation:**
   - Use existing Loader2 icon from lucide-react (already imported)
   - Animate with `animate-spin` class
   - Color: subtle blue (matches UI theme)

4. **Mobile consideration:**
   - On narrow screens, place status message ABOVE input box
   - Ensure it doesn't hide textarea
   - Stack: [Status] → [Textarea + Send Button]

5. **Dismissible:**
   - Optional close (X) button if user wants to dismiss
   - Or auto-dismiss when response arrives

---

### Step 6.10: Improve Scroll & Message Grouping for Conversations

**Goal:** Help users navigate long conversations and understand message flow.

**Acceptance Criteria:**

- ✅ Auto-scroll to new assistant message when it arrives
- ✅ Scroll only triggers for follow-ups (not cluttering on first message)
- ✅ Smart scroll: keeps prior thinking visible if user was reading
- ✅ Visual grouping: subtle separator or background between Q&A pairs
- ✅ Clear message flow: easy to scan and follow conversation
- ✅ On mobile: scroll doesn't cover input field
- ✅ Respects user scroll position: don't auto-scroll if user is reading old messages

**File:** `app/insights/new/components/ConversationPanel.tsx`

**Implementation Notes:**

1. **Smart auto-scroll logic:**

   ```typescript
   useEffect(() => {
     if (!isLoading && messages.length > 2) {
       // Only on follow-ups
       const lastMessage = messages[messages.length - 1];
       if (lastMessage?.role === "assistant") {
         // Scroll to last assistant message
         lastAssistantRef.current?.scrollIntoView({
           behavior: "smooth",
           block: "center", // Keep some context above
         });
       }
     }
   }, [messages, isLoading]);
   ```

2. **Visual grouping:**
   - Add subtle background color to each user-assistant pair
   - Alternate light colors or use subtle borders
   - Example:
     ```
     User message:     [bg-blue-50 rounded-lg p-3]
     Assistant message: [bg-white border-2 p-4]
     ─────────────────  [subtle divider]
     User message:      [bg-blue-50 rounded-lg p-3]
     Assistant message: [bg-white border-2 p-4]
     ```

3. **Message grouping container:**
   - Wrap each user-assistant pair in a container
   - Add margin and light separator line
   - Or use alternating background stripes

4. **Scroll anchor refs:**
   - Add `ref` to last assistant message container
   - Use this for scroll-into-view behavior
   - Don't scroll if user is manually scrolled up

5. **Scroll detection (optional):**
   - Track user scroll position
   - If user is reading old messages (scrolled up), don't force scroll
   - Only auto-scroll if they were at bottom of conversation

---

### Step 6.11: Add Query Composition Strategy Indicator

**Goal:** Provide transparency on how follow-up query was constructed (CTE, fresh, optimized).

**Acceptance Criteria:**

- ✅ Small indicator shows query strategy: "📎 Built on previous result (CTE)" or "✨ Fresh query"
- ✅ Located in thinking section or message footer
- ✅ Clickable to see SQL preview (next step)
- ✅ Color-coded: teal for CTE, blue for fresh, purple for optimized
- ✅ Short, scannable text (2-3 words)
- ✅ Appears only on follow-ups
- ✅ Tooltip explains strategy briefly

**File:** `app/insights/new/components/AssistantMessage.tsx`

**Implementation Notes:**

1. **Composition strategy metadata:**
   - API response includes: `compositionStrategy?: 'cte' | 'fresh' | 'optimized'`
   - Determine in SQL composer service based on AI decision
   - Store in `message.metadata.compositionStrategy`

2. **Visual indicator placement:**

   ```
   ┌─────────────────────────────┐
   │ AI │ Message                 │
   │    │ How I got this (steps)  │
   │    │ 📎 Built on previous    │ ← NEW
   │    │ Results table...        │
   └─────────────────────────────┘
   ```

3. **Strategy descriptions:**
   - `cte`: "📎 Built on previous result (CTE)" → teal badge
   - `fresh`: "✨ Fresh query (independent)" → gray badge
   - `optimized`: "⚡ Optimized version of previous" → purple badge

4. **Tooltip content:**

   ```
   CTE: "This query combines your previous results using a database CTE.
         No data stored, always fresh results."

   Fresh: "This query is independent and doesn't rely on previous results."

   Optimized: "This query reuses the structure of your previous query
              but with new filters or refinements."
   ```

5. **Interaction:**
   - Click badge → show/scroll to SQL in thinking section (Step 6.12)
   - Or link to expanded view with SQL preview

---

### Step 6.12: Add SQL Preview in Thinking Details

**Goal:** Let users verify AI correctly understood their question and generated appropriate SQL.

**Acceptance Criteria:**

- ✅ SQL appears in expandable section within "How I got this"
- ✅ Code-highlighted SQL with syntax colors
- ✅ Copy button for easy sharing/testing
- ✅ Only shown when expanded (not cluttering)
- ✅ CTE composition shows full composed query with WITH clause
- ✅ Labels for CTE name, main query, what each part does
- ✅ On mobile: horizontal scroll if needed, not breaking layout

**File:** Create `app/insights/new/components/SQLPreview.tsx`

**Implementation Notes:**

1. **Component structure:**

   ```
   SQLPreview
   ├── Header: "Generated SQL"
   ├── Strategy badge (from 6.11)
   ├── Copy button
   ├── Syntax-highlighted code block
   └── Optional: Performance metrics
   ```

2. **Integration into ThinkingStream:**
   - Add SQL as a "sub-detail" in the final thinking step
   - Or as separate section in AssistantMessage

3. **Syntax highlighting:**
   - Use existing highlight library (check package.json for suggestions)
   - Or simple CSS for keyword coloring:
     ```css
     .sql-keyword {
       color: #d73a49;
       font-weight: bold;
     }
     .sql-identifier {
       color: #24292e;
     }
     .sql-string {
       color: #032f62;
     }
     ```

4. **CTE-specific rendering:**

   ```typescript
   if (compositionStrategy === "cte") {
     // Show:
     // WITH previous_result AS (
     //   SELECT ... FROM ...
     // )
     // SELECT ... FROM previous_result ...
     // Add annotations:
     // "↓ Previous result"
     // "↓ Main query that builds on it"
   }
   ```

5. **Copy functionality:**
   - Button copies full SQL to clipboard
   - Toast notification: "SQL copied to clipboard"
   - Include button in code block header

6. **Mobile layout:**
   - Use horizontal scroll container if SQL is long
   - Monospace font at smaller size: `text-xs font-mono`
   - Ensure copy button is always accessible

---

## Phase 7: Smart Suggestions (Current: Rule-Based, Deferred: Background AI)

### Current Implementation (Rule-Based)

For the upcoming release, we ship rule-based suggestions derived from SQL and result metadata. This keeps the SQL provider contract unchanged and avoids any blocking changes.

**Files:**

- `lib/services/suggestion-generator.service.ts`
- `lib/services/refinement-generator.service.ts`
- `app/insights/new/components/SmartSuggestions.tsx`
- `app/insights/new/components/ConversationPanel.tsx`

#### Step 7.1: Rule-Based Suggestion Generator Service

**File:** `lib/services/suggestion-generator.service.ts`

- Detects aggregation/time/patient/wound patterns from SQL + columns.
- Returns top 4 suggestions by confidence.

#### Step 7.2: Refinement Generator Service

**File:** `lib/services/refinement-generator.service.ts`

- Generates refinement prompts (limit, time window, filters, sorting).

#### Step 7.3: SmartSuggestions UI + Wiring

**Files:** `app/insights/new/components/SmartSuggestions.tsx`, `app/insights/new/components/ConversationPanel.tsx`

- Displays follow-up suggestions and refinements.
- Click fills input but does not auto-send.

---

### Deferred (Post-Release): Background AI Suggestions

We will return to **Option 2 (background AI call)** after Phase 8 and deployment. This keeps main results instant while making AI suggestions a progressive enhancement.

#### Step 7.4: Suggestion Prompt + Generator (Background)

- **File:** `lib/prompts/suggestion-generation.prompt.ts` (NEW)
- AI returns `{ suggestions: [...] }` with optional reasoning.

#### Step 7.5: Suggestions API Endpoint (Non-Blocking)

- **File:** `app/api/insights/conversation/suggestions/route.ts` (NEW)
- Returns `{ suggestions: [] }` on failure (non-blocking).

#### Step 7.6: Update SmartSuggestion Type (Reasoning Optional)

- **File:** `lib/types/conversation.ts`
- `reasoning?: string`

#### Step 7.7: SmartSuggestions UI for AI Reasoning

- Render AI reasoning when present.
- Keep rule-based fallback during rollout.

#### Step 7.8: ConversationPanel Background Fetch

- Fetch suggestions after assistant response.
- Store by `messageId` and render when available.

#### Step 7.9: Tests (Parsing + UI)

- Verify parsing and UI render for AI suggestions.

---

### Performance & Cost Impact (Current vs Deferred)

| Metric                 | Rule-Based (Now) | Background AI (Deferred) |
| ---------------------- | ---------------- | ------------------------ |
| API calls per response | 1                | 2                        |
| Token usage            | 100%             | ~110%                    |
| Main response latency  | 2.5s             | 2.5s                     |
| Suggestion quality     | Low/medium       | High                     |

### Success Criteria (Current)

- [x] Rule-based suggestions appear after results
- [x] Refinement suggestions appear when applicable
- [x] Click fills input without auto-send

### Success Criteria (Deferred)

- [ ] Background AI suggestions appear when available
- [ ] Main conversation flow unchanged if suggestions fail
- [ ] Tests pass for AI suggestions parsing + UI

---

## Phase 8: Audit Integration

### Overview

This phase extends the existing QueryHistory table to track conversation lineage and composition strategies, per `auditing-improvement-todo.md`.

### Step 8.1: Create Audit Migration

**File:** `database/migration/048_conversation_audit_tracking.sql`

```sql
-- Migration 048: Add conversation audit tracking to QueryHistory
-- Purpose: Track conversation lineage and composition strategies
-- Dependencies: 023_create_query_history.sql, 046_create_conversation_tables.sql

BEGIN;

-- Add conversation tracking columns
ALTER TABLE "QueryHistory"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "isComposedQuery" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "compositionStrategy" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "parentQueryId" INTEGER
  REFERENCES "QueryHistory"(id) ON DELETE SET NULL;

-- Indexes for conversation lineage queries
CREATE INDEX IF NOT EXISTS idx_query_history_conversation_thread
ON "QueryHistory" ("conversationThreadId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_query_history_conversation_message
ON "QueryHistory" ("conversationMessageId");

CREATE INDEX IF NOT EXISTS idx_query_history_parent_query
ON "QueryHistory" ("parentQueryId");

CREATE INDEX IF NOT EXISTS idx_query_history_composed
ON "QueryHistory" ("isComposedQuery", "createdAt" DESC)
WHERE "isComposedQuery" = true;

-- Comments for documentation
COMMENT ON COLUMN "QueryHistory"."conversationThreadId"
IS 'Links to conversation thread (if query was part of conversation)';

COMMENT ON COLUMN "QueryHistory"."conversationMessageId"
IS 'Links to specific message that generated this query';

COMMENT ON COLUMN "QueryHistory"."isComposedQuery"
IS 'True if this SQL builds on previous query (CTE composition)';

COMMENT ON COLUMN "QueryHistory"."compositionStrategy"
IS 'How SQL was composed: cte, merged_where, or fresh';

COMMENT ON COLUMN "QueryHistory"."parentQueryId"
IS 'References previous query in conversation chain';

-- Conversation-only audit view (materialized). Audit reads use this view
-- (enforced by audit-query-guard); refreshed by audit-view-refresh.service.
CREATE MATERIALIZED VIEW IF NOT EXISTS "ConversationQueryHistory" AS
SELECT
  qh.id,
  qh."conversationThreadId",
  qh."conversationMessageId",
  qh."parentQueryId",
  qh."isComposedQuery",
  qh."compositionStrategy",
  qh.question,
  qh.sql,
  qh."resultCount",
  qh."customerId",
  qh."userId",
  qh."createdAt"
FROM "QueryHistory" qh
WHERE qh."conversationThreadId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_query_history_unique
  ON "ConversationQueryHistory"(id);

CREATE INDEX IF NOT EXISTS idx_conversation_query_history_thread
  ON "ConversationQueryHistory"("conversationThreadId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_query_history_parent
  ON "ConversationQueryHistory"("parentQueryId");

COMMIT;
```

### Step 8.2: Run Migration

```bash
npm run migrate
```

**Expected Output:**

```
Running migration: 048_conversation_audit_tracking.sql
✓ Added columns to QueryHistory
✓ Created indexes
✓ Added comments
✓ Created materialized view ConversationQueryHistory
Migration completed successfully
```

### Step 8.3: Create Conversation Audit Service

**File:** `lib/services/audit/conversation-audit.service.ts`

The implemented service reads from the materialized view **ConversationQueryHistory** (not the raw `QueryHistory` table) for all read operations; `audit-query-guard` enforces view-only access. Writes (log) insert into `QueryHistory`.

```typescript
import { pool } from "@/lib/db";

export interface ConversationQueryLogParams {
  threadId: string;
  messageId: string;
  question: string;
  sql: string;
  customerId: string;
  userId: number;
  parentQueryHistoryId?: number;
  compositionStrategy: "cte" | "merged_where" | "fresh";
  resultCount: number;
  executionTimeMs: number;
}

export interface QueryLineage {
  id: number;
  question: string;
  sql: string;
  compositionStrategy: string;
  createdAt: Date;
  depth: number;
}

export interface ConversationMetrics {
  total_conversations: number;
  avg_questions_per_conversation: number;
  avg_composition_rate: number;
  total_queries: number;
  composed_queries: number;
}

export class ConversationAuditService {
  /**
   * Log query with conversation context
   */
  async logConversationQuery(
    params: ConversationQueryLogParams,
  ): Promise<number> {
    const result = await pool.query(
      `
      INSERT INTO "QueryHistory" (
        question,
        sql,
        customerId,
        userId,
        conversationThreadId,
        conversationMessageId,
        isComposedQuery,
        compositionStrategy,
        parentQueryId,
        resultCount,
        executionTimeMs,
        mode,
        status,
        createdAt
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'conversation', 'success', NOW())
      RETURNING id
    `,
      [
        params.question,
        params.sql,
        params.customerId,
        params.userId,
        params.threadId,
        params.messageId,
        params.parentQueryHistoryId !== undefined,
        params.compositionStrategy,
        params.parentQueryHistoryId || null,
        params.resultCount,
        params.executionTimeMs,
      ],
    );

    return result.rows[0].id;
  }

  /**
   * Get conversation query lineage (recursive tree)
   */
  async getConversationLineage(threadId: string): Promise<QueryLineage[]> {
    const result = await pool.query(
      `
      WITH RECURSIVE lineage AS (
        -- Base case: root queries (no parent)
        SELECT 
          id,
          question,
          sql,
          "compositionStrategy",
          "createdAt",
          1 as depth,
          ARRAY[id] as path
        FROM "QueryHistory"
        WHERE "conversationThreadId" = $1
          AND "parentQueryId" IS NULL
        
        UNION ALL
        
        -- Recursive case: child queries
        SELECT 
          q.id,
          q.question,
          q.sql,
          q."compositionStrategy",
          q."createdAt",
          l.depth + 1,
          l.path || q.id
        FROM "QueryHistory" q
        INNER JOIN lineage l ON q."parentQueryId" = l.id
        WHERE NOT (q.id = ANY(l.path))  -- Prevent cycles
      )
      SELECT 
        id,
        question,
        sql,
        "compositionStrategy" as composition_strategy,
        "createdAt" as created_at,
        depth
      FROM lineage 
      ORDER BY path
    `,
      [threadId],
    );

    return result.rows;
  }

  /**
   * Get conversation metrics for dashboard
   */
  async getConversationMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<ConversationMetrics> {
    const result = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT "conversationThreadId") as total_conversations,
        COUNT(*) as total_queries,
        COUNT(*) FILTER (WHERE "isComposedQuery") as composed_queries,
        AVG(query_count)::numeric(10,2) as avg_questions_per_conversation,
        (COUNT(*) FILTER (WHERE "isComposedQuery")::float / NULLIF(COUNT(*), 0) * 100)::numeric(10,2) as avg_composition_rate
      FROM (
        SELECT 
          "conversationThreadId",
          COUNT(*) as query_count
        FROM "QueryHistory"
        WHERE "conversationThreadId" IS NOT NULL
          AND "createdAt" BETWEEN $1 AND $2
        GROUP BY "conversationThreadId"
      ) thread_stats
    `,
      [startDate, endDate],
    );

    return result.rows[0];
  }

  /**
   * Get composition strategy breakdown
   */
  async getCompositionStrategyBreakdown(startDate: Date, endDate: Date) {
    const result = await pool.query(
      `
      SELECT 
        "compositionStrategy" as strategy,
        COUNT(*) as count,
        AVG("executionTimeMs")::numeric(10,2) as avg_execution_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "executionTimeMs")::numeric(10,2) as p95_execution_time_ms
      FROM "QueryHistory"
      WHERE "conversationThreadId" IS NOT NULL
        AND "createdAt" BETWEEN $1 AND $2
      GROUP BY "compositionStrategy"
      ORDER BY count DESC
    `,
      [startDate, endDate],
    );

    return result.rows;
  }
}
```

### Step 8.4: Add Audit Dashboard API

**File:** `app/api/admin/audit/conversations/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { ConversationAuditService } from "@/lib/services/conversation-audit.service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const threadId = searchParams.get("threadId");

  const auditService = new ConversationAuditService();

  // Specific thread lineage
  if (threadId) {
    const lineage = await auditService.getConversationLineage(threadId);

    return NextResponse.json({
      threadId,
      lineage,
      queryCount: lineage.length,
      maxDepth: Math.max(...lineage.map((q) => q.depth)),
    });
  }

  // Metrics overview
  const startDate = new Date(
    searchParams.get("startDate") || Date.now() - 7 * 24 * 60 * 60 * 1000,
  );
  const endDate = new Date(searchParams.get("endDate") || Date.now());

  const [metrics, strategyBreakdown] = await Promise.all([
    auditService.getConversationMetrics(startDate, endDate),
    auditService.getCompositionStrategyBreakdown(startDate, endDate),
  ]);

  return NextResponse.json({
    period: { startDate, endDate },
    metrics,
    strategyBreakdown,
  });
}
```

### Step 8.5: Audit Dashboard UI Component

**File:** `app/admin/audit/conversation-metrics.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConversationMetrics {
  total_conversations: number;
  avg_questions_per_conversation: number;
  avg_composition_rate: number;
  total_queries: number;
  composed_queries: number;
}

export function ConversationMetricsCard() {
  const [metrics, setMetrics] = useState<ConversationMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit/conversations")
      .then((res) => res.json())
      .then((data) => {
        setMetrics(data.metrics);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!metrics) return <div>No data</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Total Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {metrics.total_conversations}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {metrics.total_queries} total queries
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Avg Questions per Conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {metrics.avg_questions_per_conversation}
          </div>
          <p className="text-xs text-gray-500 mt-1">Multi-turn engagement</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Context Carryover Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {metrics.avg_composition_rate}%
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {metrics.composed_queries} composed queries
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Phase 8 Code Review (2026-02-02)

**Taste:** 🟢 Good

- Migration 048 uses a **materialized view** `ConversationQueryHistory` for audit reads (not in original guide); aligns with existing audit pattern and query guard.
- **Audit query guard** enforces view-only reads (`ConversationQueryHistory` allowed, `QueryHistory` forbidden); tests cover ConversationQueryHistory and readonly list.
- **Conversation send** wires `ConversationAuditService.logConversationQuery` via `logQueryHistory` with thread/message/composition/parent; fire-and-forget on failure preserves request flow.
- **API** uses `requireAdmin`, `ensureAuditDashboardEnabled`, and `getAuditCache`; date validation and cache key by period; 400/500 handled.
- **UI** uses `LoadingDots`, error state, and typed response; card fits existing audit dashboard layout.

**Fatal flaws:** None. No raw `QueryHistory` in audit read paths; write path is single INSERT; defaults and error handling are consistent.

**Direction for improvement**

- **Optional:** Consider adding a short comment in `conversation-audit.service.ts` that `ConversationQueryHistory` is refreshed by `audit-view-refresh.service` so readers know why reads are view-based.
- **ConversationMetricsCard:** Remove or gate the `console.log` in the audit page’s feature-flag check for production (or use a debug-only logger).

---

## Phase 9: Save Insight Integration

### Overview

This phase enables saving insights from conversations, storing the final composed SQL that's self-contained and re-runnable.

### Step 9.1: Extend SavedInsights Schema

**File:** `database/migration/047_save_insight_conversation_link.sql`

```sql
-- Migration 047: Link SavedInsights to conversations
-- Purpose: Track which insights came from conversations

BEGIN;

ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "executionMode" VARCHAR(50) DEFAULT 'standard';

-- Index for conversation lookups
CREATE INDEX IF NOT EXISTS idx_saved_insights_conversation
ON "SavedInsights" ("conversationThreadId");

-- Comments
COMMENT ON COLUMN "SavedInsights"."conversationThreadId"
IS 'Original conversation thread (if saved from conversation)';

COMMENT ON COLUMN "SavedInsights"."conversationMessageId"
IS 'Specific message that was saved (if from conversation)';

COMMENT ON COLUMN "SavedInsights"."executionMode"
IS 'How insight was created: standard, template, or contextual (from conversation)';

COMMIT;
```

### Step 9.2: Create Save Insight Service

**File:** `lib/services/save-insight.service.ts`

```typescript
import { pool } from "@/lib/db";

export interface SavedInsight {
  id: number;
  title: string;
  sql: string;
  customerId: string;
  userId: number;
  executionMode: "standard" | "template" | "contextual";
  conversationThreadId?: string;
  conversationMessageId?: string;
  createdAt: Date;
}

export class SaveInsightService {
  /**
   * Save insight from conversation message
   */
  async saveFromConversation(
    threadId: string,
    messageId: string,
    customerId: string,
    userId: number,
    userTitle?: string,
  ): Promise<SavedInsight> {
    // Load the specific message
    const messageResult = await pool.query(
      `SELECT content, metadata 
       FROM "ConversationMessages" 
       WHERE id = $1 AND "threadId" = $2`,
      [messageId, threadId],
    );

    if (messageResult.rows.length === 0) {
      throw new Error("Message not found");
    }

    const message = messageResult.rows[0];
    const metadata = message.metadata || {};

    if (!metadata.sql) {
      throw new Error("No SQL found for this message");
    }

    // The SQL is already composed (includes all context via CTEs)
    const finalSql = metadata.sql;

    // Generate title from conversation progression
    const title = userTitle || (await this.generateTitle(threadId, messageId));

    // Save with conversation metadata
    const result = await pool.query(
      `
      INSERT INTO "SavedInsights" 
      (title, sql, customerId, userId, executionMode, conversationThreadId, conversationMessageId)
      VALUES ($1, $2, $3, $4, 'contextual', $5, $6)
      RETURNING *
    `,
      [title, finalSql, customerId, userId, threadId, messageId],
    );

    return result.rows[0];
  }

  /**
   * Generate title from conversation context
   */
  private async generateTitle(
    threadId: string,
    messageId: string,
  ): Promise<string> {
    // Load conversation up to this message
    const result = await pool.query(
      `
      SELECT content, role 
      FROM "ConversationMessages" 
      WHERE "threadId" = $1 
        AND "createdAt" <= (
          SELECT "createdAt" 
          FROM "ConversationMessages" 
          WHERE id = $2
        )
      ORDER BY "createdAt" ASC
    `,
      [threadId, messageId],
    );

    const userQuestions = result.rows
      .filter((m) => m.role === "user")
      .map((m) => m.content);

    if (userQuestions.length === 1) {
      return userQuestions[0].slice(0, 100);
    }

    // Show progression: first → last
    return `${userQuestions[0].slice(0, 40)} → ${userQuestions[
      userQuestions.length - 1
    ].slice(0, 40)}`;
  }

  /**
   * Re-run saved insight (executes the composed SQL)
   */
  async runSavedInsight(
    insightId: number,
    customerId: string,
  ): Promise<QueryResult> {
    const result = await pool.query(
      `SELECT sql FROM "SavedInsights" WHERE id = $1 AND customerId = $2`,
      [insightId, customerId],
    );

    if (result.rows.length === 0) {
      throw new Error("Insight not found");
    }

    const sql = result.rows[0].sql;

    // Execute the SQL (it's self-contained, no context needed)
    const queryResult = await pool.query(sql);

    return {
      columns: queryResult.fields.map((f) => f.name),
      rows: queryResult.rows,
    };
  }
}
```

### Step 9.3: Add Save Insight API Endpoint

**File:** `app/api/insights/conversation/save/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { SaveInsightService } from "@/lib/services/save-insight.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { threadId, messageId, customerId, title } = body;

    if (!threadId || !messageId || !customerId) {
      return NextResponse.json(
        { error: "threadId, messageId, and customerId are required" },
        { status: 400 },
      );
    }

    const userId = parseInt(session.user.id, 10);
    const saveService = new SaveInsightService();

    const insight = await saveService.saveFromConversation(
      threadId,
      messageId,
      customerId,
      userId,
      title,
    );

    return NextResponse.json({
      success: true,
      insight: {
        id: insight.id,
        title: insight.title,
        executionMode: insight.executionMode,
      },
    });
  } catch (error) {
    console.error("[/api/insights/conversation/save] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to save insight",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
```

### Step 9.4: Update MessageActions Component

**File:** `app/insights/new/components/MessageActions.tsx` (UPDATE)

```typescript
// Add to existing MessageActions component

const handleSaveInsight = async () => {
  try {
    const response = await fetch("/api/insights/conversation/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: message.threadId,
        messageId: message.id,
        customerId,
        title: undefined, // Auto-generate from conversation
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save insight");
    }

    const data = await response.json();

    // Show success toast
    toast.success(`Saved as: ${data.insight.title}`);

    setShowSaveDialog(false);
  } catch (error) {
    console.error("Save failed:", error);
    toast.error("Failed to save insight");
  }
};
```

---

## Phase 10: Integration & Testing

### Step 10.1: Update Main Page

**File:** `app/insights/conversation/page.tsx`

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { useConversation } from "@/lib/hooks/useConversation";
import { CustomerSelector } from "../new/components/CustomerSelector";
import { ModelSelector } from "../new/components/ModelSelector";
import { ConversationInput } from "../new/components/ConversationInput";
import { UserMessage } from "../new/components/UserMessage";
import { AssistantMessage } from "../new/components/AssistantMessage";
import { SmartSuggestions } from "../new/components/SmartSuggestions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

export default function ConversationPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");

  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    startNewConversation,
  } = useConversation();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!question.trim() || !customerId) return;

    await sendMessage(question, customerId, modelId);
    setQuestion(""); // Clear input after sending
  };

  const handleSuggestionClick = (suggestionText: string) => {
    // Fill input, don't auto-submit
    setQuestion(suggestionText);
  };

  const handleNewChat = () => {
    startNewConversation();
    setQuestion("");
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header: Fixed at top */}
      <div className="border-b bg-white px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link
              href="/insights"
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">Ask Question</h1>
          </div>
          <Button onClick={handleNewChat} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 max-w-xs">
            <CustomerSelector value={customerId} onChange={setCustomerId} />
          </div>
          <div className="flex-1 max-w-xs">
            <ModelSelector value={modelId} onChange={setModelId} />
          </div>
        </div>
      </div>

      {/* Main Content: Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {messages.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💬</div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                Start a Conversation
              </h2>
              <p className="text-gray-600 mb-6">
                Ask questions about your data in natural language
              </p>
              <div className="text-left max-w-md mx-auto space-y-2">
                <p className="text-sm text-gray-500 font-medium">
                  💡 Try asking:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• "How many patients have open wounds?"</li>
                  <li>• "Show me patients with infected pressure ulcers"</li>
                  <li>
                    • "What's the average healing time for stage 3 wounds?"
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage
                    key={message.id}
                    message={message}
                    onEdit={editMessage}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    customerId={customerId}
                  />
                )
              )}

              {/* Smart Suggestions after last message */}
              {!isLoading && messages.length > 0 && (
                <SmartSuggestions
                  lastMessage={messages[messages.length - 1]}
                  onSuggestionClick={handleSuggestionClick}
                />
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input: Sticky at bottom */}
      <div className="border-t bg-white flex-shrink-0">
        <div className="max-w-4xl mx-auto p-6">
          <ConversationInput
            value={question}
            onChange={setQuestion}
            onSubmit={handleSend}
            disabled={!customerId || isLoading}
            placeholder={
              messages.length === 0
                ? "Ask a question about your data..."
                : "Ask your next question..."
            }
          />
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 11: Migration & Rollout

### Step 11.1: Feature Flag Setup

**File:** `lib/config/feature-flags.ts`

```typescript
export interface FeatureFlags {
  enableConversationUI: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    enableConversationUI:
      process.env.NEXT_PUBLIC_ENABLE_CONVERSATION_UI === "true",
  };
}
```

### Step 11.2: Update Environment Variables

**File:** `.env.local.example`

```bash
# Add this line:
NEXT_PUBLIC_ENABLE_CONVERSATION_UI=false
```

### Step 11.3: Gradual Rollout Strategy

1. **Week 1: Internal Testing**

   ```bash
   # Enable for development only
   NEXT_PUBLIC_ENABLE_CONVERSATION_UI=true
   ```

2. **Week 2: Beta Users**

   ```typescript
   // Add to lib/config/feature-flags.ts
   export function isConversationUIEnabled(userId: number): boolean {
     const betaUsers = [1, 2, 3]; // Admin user IDs
     return betaUsers.includes(userId);
   }
   ```

3. **Week 3: 50% Rollout**

   ```typescript
   export function isConversationUIEnabled(userId: number): boolean {
     // A/B test: 50% of users
     return userId % 2 === 0;
   }
   ```

4. **Week 4: Full Rollout**
   ```bash
   NEXT_PUBLIC_ENABLE_CONVERSATION_UI=true
   ```

---

## Testing Checklist

### Unit Tests

```typescript
// lib/hooks/__tests__/useConversation.test.ts

import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversation } from "../useConversation";

describe("useConversation", () => {
  it("should send a message and update state", async () => {
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.sendMessage(
        "Show me patients",
        "customer-123",
        "gpt-4",
      );
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2); // User + Assistant
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.messages[1].role).toBe("assistant");
    });
  });

  it("should handle edit message", async () => {
    const { result } = renderHook(() => useConversation());

    // Send initial message
    await act(async () => {
      await result.current.sendMessage("Show patients", "customer-123");
    });

    const messageId = result.current.messages[0].id;

    // Edit message
    await act(async () => {
      await result.current.editMessage(messageId, "Show all patients");
    });

    await waitFor(() => {
      expect(result.current.messages[0].content).toBe("Show all patients");
    });
  });
});
```

### Integration Tests

```typescript
// app/insights/conversation/__tests__/conversation-flow.test.tsx

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConversationPage from "../page";

describe("Conversation Flow", () => {
  it("should allow user to ask question and see response", async () => {
    render(<ConversationPage />);

    // Select customer
    const customerSelect = screen.getByLabelText("Customer");
    fireEvent.change(customerSelect, { target: { value: "customer-123" } });

    // Type question
    const input = screen.getByPlaceholderText(
      "Ask a question about your data..."
    );
    fireEvent.change(input, { target: { value: "Show me patients" } });

    // Send
    const sendButton = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendButton);

    // Wait for response
    await waitFor(() => {
      expect(screen.getByText(/Found \d+ patients/i)).toBeInTheDocument();
    });
  });

  it("should show suggestions after response", async () => {
    render(<ConversationPage />);

    // ... send message ...

    await waitFor(() => {
      expect(screen.getByText("💡 You might want to ask:")).toBeInTheDocument();
    });
  });

  it("should fill input when suggestion clicked", async () => {
    render(<ConversationPage />);

    // ... send message and wait for suggestions ...

    const suggestion = screen.getByText("Which ones are improving?");
    fireEvent.click(suggestion);

    const input = screen.getByPlaceholderText(/Ask your next question/i);
    expect(input).toHaveValue("Which ones are improving?");
  });
});
```

### Manual Testing Scenarios

1. **Basic Conversation Flow**
   - [ ] Ask first question: "Show female patients"
   - [ ] Verify response with results
   - [ ] Ask follow-up: "Which ones are older than 40?"
   - [ ] Verify SQL uses CTE composition
   - [ ] Verify results are filtered correctly
   - [ ] Check QueryHistory shows compositionStrategy = "cte"

2. **Token Caching Verification**
   - [ ] Start conversation (first message)
   - [ ] Check API logs for token usage (~5200 tokens)
   - [ ] Send second message
   - [ ] Check API logs for token usage (~600 tokens, 90% cached)
   - [ ] Verify cache hit in logs

3. **AI-Driven Composition Decision Testing**
   - [ ] Test explicit composition: "Show female patients" → "Which ones are older than 40?"
     - Check logs show: `[Composition Decision] COMPOSE (confidence: 0.9+): Uses pronoun...`
     - Verify CTE composition in SQL

   - [ ] Test independent queries: "How many female patients?" → "How many male patients?"
     - Check logs show: `[Composition Decision] FRESH (confidence: 0.9+): Different subset...`
     - Verify fresh SQL with no CTE

   - [ ] Test implicit reference: "Show patients with wounds" → "Tell me about the older ones"
     - Check logs show: `[Composition Decision] COMPOSE (confidence: 0.8+): 'older ones' references...`
     - Verify CTE composition

   - [ ] Test different entity: "Show assessments" → "How many clinics?"
     - Check logs show: `[Composition Decision] FRESH (confidence: 1.0): Different entity...`
     - Verify fresh SQL

   - [ ] Test vague aggregation: "Show patients" → "What's the average age?"
     - Check logs show: `[Composition Decision] COMPOSE (confidence: 0.85+): Aggregating previous...`
     - Verify CTE composition with aggregation

4. **SQL Composition Strategies**
   - [ ] Test CTE composition: "Show patients" → "Which ones have wounds?"
   - [ ] Test fresh query: "Show patients" → "How many clinics?"
   - [ ] Test merged WHERE: Simple filter additions
   - [ ] Verify correct strategy logged in QueryHistory

5. **Save Insight from Conversation**
   - [ ] Have a 3-message conversation
   - [ ] Click "Save" on final result
   - [ ] Verify title includes progression (Q1 → Q3)
   - [ ] Check SavedInsights table has conversation link
   - [ ] Re-run saved insight from dashboard
   - [ ] Verify results match (SQL is self-contained)

6. **Audit Trail**
   - [ ] Complete a conversation
   - [ ] Go to Admin > Audit > Conversations
   - [ ] Verify thread appears with metrics
   - [ ] Click thread to view lineage
   - [ ] Verify parent-child relationships
   - [ ] Check composition strategy breakdown

7. **Edit Flow**
   - [ ] Ask question
   - [ ] Get response
   - [ ] Click Edit on first question
   - [ ] Modify text
   - [ ] Save → sees confirmation
   - [ ] Second message is discarded
   - [ ] New response generated

8. **New Chat**
   - [ ] Click "New Chat"
   - [ ] Conversation clears
   - [ ] Customer/Model selection retained
   - [ ] Can start fresh conversation

9. **Error Handling**
   - [ ] Invalid SQL → see error message
   - [ ] Network failure → can retry
   - [ ] Cancel during loading → request cancelled
   - [ ] Audit logs error even on failure

10. **Privacy Validation**
    - [ ] Run conversation with patient data
    - [ ] Check ConversationMessages metadata
    - [ ] Verify NO actual patient data stored
    - [ ] Only SQL and result summaries (row count, columns)

---

## Troubleshooting

### Issue: Messages not appearing

**Symptom:** User sends message but nothing happens

**Diagnosis:**

```typescript
// Check browser console for errors
// Check network tab for failed requests
```

**Solution:**

1. Verify API endpoint is accessible
2. Check database connection
3. Verify session/auth is valid

### Issue: Context not carried over

**Symptom:** Follow-up questions don't understand context

**Diagnosis:**

```bash
# Check conversation history loading
curl http://localhost:3000/api/insights/conversation/[threadId]

# Verify messages exist and have metadata
psql -d your_db -c "SELECT role, content, metadata FROM \"ConversationMessages\" WHERE \"threadId\" = 'your-thread-id'"
```

**Solution:**

1. Ensure `threadId` is being passed correctly to API
2. Verify `loadConversationHistory()` returns messages
3. Check provider's `buildConversationHistory()` is called
4. Verify AI provider is receiving context (check logs)

### Issue: SQL composition not working

**Symptom:** Follow-up questions generate fresh SQL instead of composing

**Diagnosis:**

```typescript
// Check if shouldComposeQuery is returning true
const shouldCompose = sqlComposer.shouldComposeQuery(
  "Which ones are older than 40?", // Current question
  "SELECT * FROM Patient", // Previous SQL
);
console.log("Should compose:", shouldCompose); // Should be true
```

**Solution:**

1. Verify previous message has `metadata.sql`
2. Check question contains reference words ("which ones", "those", "they")
3. Review `SqlComposerService.shouldComposeQuery()` logic
4. Check LLM is returning correct strategy in JSON

### Issue: Token usage not decreasing

**Symptom:** Subsequent messages still using ~5000 tokens

**Diagnosis:**

```bash
# For Claude: Check cache_control in request
# For Gemini: Check cachedContent is being used

# Check logs for cache hits
grep "cache" logs/api.log

# Verify Redis is storing cache keys
redis-cli KEYS "gemini:cache:*"
```

**Solution:**

1. **Claude**: Ensure `cache_control: { type: "ephemeral" }` is set
2. **Gemini**: Verify `cacheManager.create()` was called
3. Check Redis is running and accessible
4. Verify cache TTL hasn't expired (3600 seconds)
5. Ensure schema version hasn't changed (invalidates cache)

### Issue: Saved insight doesn't work

**Symptom:** Saved insight from conversation fails to run

**Diagnosis:**

```sql
-- Check saved SQL
SELECT title, sql, "executionMode"
FROM "SavedInsights"
WHERE id = your_insight_id;

-- Try running the SQL manually
-- (Copy SQL from above and execute)
```

**Solution:**

1. Verify SQL is self-contained (includes all CTEs)
2. Check for syntax errors in composed SQL
3. Verify customer context is correct
4. Test SQL in database directly to isolate issue

### Issue: Audit lineage missing

**Symptom:** QueryHistory doesn't show conversation links

**Diagnosis:**

```sql
-- Check if audit service is being called
SELECT
  question,
  "conversationThreadId",
  "isComposedQuery",
  "compositionStrategy"
FROM "QueryHistory"
WHERE "conversationThreadId" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 10;
```

**Solution:**

1. Ensure migration 048 ran successfully (conversation audit tracking + ConversationQueryHistory view)
2. Verify `ConversationAuditService.logConversationQuery()` is called
3. Check for errors in audit logging (should be fire-and-forget)
4. Verify foreign key constraints are satisfied

---

## Success Metrics

### Performance Targets

| Metric                             | Target                    | How to Measure                         |
| ---------------------------------- | ------------------------- | -------------------------------------- |
| **Token cost reduction**           | > 80% after first message | Compare token usage in API logs        |
| **Composition rate**               | > 40% of follow-ups       | QueryHistory: `isComposedQuery = true` |
| **Avg questions per conversation** | > 3                       | ConversationMetrics API                |
| **Saved insight success rate**     | > 95%                     | SavedInsights re-run success           |
| **Context understanding**          | > 85%                     | Manual testing + user feedback         |

### Deployment Readiness Checklist

**Phase 1-3: Core Infrastructure**

- [x] Migrations 030, 046, 047 completed (Phase 1 ✅)
- [x] ClaudeProvider with prompt caching working (Phase 2.2 ✅)
- [x] GeminiProvider with context caching working (Phase 2.3 ✅)
- [ ] SqlComposerService generating correct CTEs (Phase 3 - pending)
- [ ] Token usage shows 80%+ reduction (Phase 2.5 - testing pending)

**Phase 4-5: API & Hooks**

- [ ] /api/insights/conversation/send endpoint working
- [ ] /api/insights/conversation/[threadId] endpoint working
- [ ] useConversation hook managing state correctly
- [ ] Conversation history loading correctly

**Phase 6: UI Components**

- [ ] ConversationInput component rendering
- [ ] UserMessage and AssistantMessage components working
- [ ] MessageActions with Save button functional
- [ ] Conversation flow feels natural

**Phase 8-9: Audit & Save**

- [ ] QueryHistory tracking conversation lineage
- [ ] Audit dashboard showing metrics
- [ ] Save Insight creating self-contained SQL
- [ ] Saved insights re-running successfully

**Phase 10: Testing**

- [ ] Unit tests passing (15+ test cases)
- [ ] Integration tests passing (10+ scenarios)
- [ ] Manual testing completed (all 9 scenarios)
- [ ] No patient data leaked in audit logs

**Phase 11: Rollout**

- [ ] Feature flag configured
- [ ] Internal testing with 3+ users
- [ ] Performance metrics baseline captured
- [ ] Rollback plan documented

### Post-Deployment Monitoring

**Week 1:**

- Monitor token usage (should see 80% reduction)
- Track composition rate (target: 40%+)
- Watch for errors in audit logs
- Collect user feedback

**Week 2-4:**

- Measure avg questions per conversation
- Track saved insight usage
- Analyze composition strategy effectiveness
- Optimize based on metrics

### Key Files Summary

**Core Services:**

- `lib/ai/providers/claude-provider.ts` - Prompt caching
- `lib/ai/providers/gemini-provider.ts` - Context caching
- `lib/services/sql-composer.service.ts` - CTE composition
- `lib/services/conversation-audit.service.ts` - Audit tracking
- `lib/services/save-insight.service.ts` - Save from conversation

**API Endpoints:**

- `app/api/insights/conversation/send/route.ts` - Send message
- `app/api/insights/conversation/[threadId]/route.ts` - Load thread
- `app/api/insights/conversation/save/route.ts` - Save insight
- `app/api/admin/audit/conversations/route.ts` - Audit metrics

**UI Components:**

- `app/insights/conversation/page.tsx` - Main conversation page
- `app/insights/new/components/ConversationInput.tsx` - Input box
- `app/insights/new/components/MessageActions.tsx` - Save/Export actions
- `app/admin/audit/conversation-metrics.tsx` - Admin dashboard

**Database Migrations:**

- `database/migration/046_create_conversation_tables.sql` - Conversation threading tables
- `database/migration/048_conversation_audit_tracking.sql` - Audit extension + ConversationQueryHistory view
- `database/migration/047_save_insight_conversation_link.sql` - Save link

---

**Document Version:** 2.1 (AI-Driven Composition Decision)  
**Last Updated:** 2026-01-16  
**Status:** Production-Ready Implementation Guide

**⚠️ CRITICAL: Start with Phase 0 (2 days)**

**Implementation Steps:**

1. **Phase 0:** Critical Pre-Implementation Fixes (Days 1-2) ⚠️ **MUST DO FIRST**
   - Fix 0.1: PHI Protection (hash entity IDs)
   - Fix 0.2: Soft-Delete Edit Behavior
   - Fix 0.3: Conservative Flag for SavedInsights
   - Fix 0.4: Canonical Types Definition

2. **Phase 1-3:** Core Infrastructure (Days 3-7)
   - Database Migrations
   - AI Provider Context Integration
   - SQL Composition Service

3. **Phase 4-6:** API & UI (Days 8-14)
   - API Endpoints
   - Conversation Hook
   - UI Components

4. **Phase 7-10:** Smart Suggestions, Audit & Testing (Days 15-18)
   - Smart Suggestions
   - Audit Integration
   - Save Insight Integration
   - Integration & Testing

5. **Phase 11:** Rollout (Day 19+)
   - Feature Flag & Gradual Rollout

**Estimated Timeline:** 3-4 weeks (including Phase 0 fixes)
