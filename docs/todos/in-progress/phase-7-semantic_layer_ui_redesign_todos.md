# Phase 7: Semantic Layer UI Redesign - Implementation Guide (Core + Chart)

**Version:** 3.0 (Consolidated with Phase 7.5)
**Last Updated:** 2025-11-03
**Status:** Ready for Implementation
**Timeline:** 11 weeks total (Weeks 10-20)

---

## Document Overview

This guide provides step-by-step implementation for Phase 7 (Unified UI & Integration) including **Core functionality, Chart Builder, and Post-MVP Enhancements**. This document consolidates what was previously split between Phase 7 and Phase 7.5.

**Key Changes from v2.0:**

- ✅ Consolidated Phase 7.5 content into this document
- ✅ Phases 7A-7D: Core semantic layer + Chart builder (Weeks 10-17)
- ✅ Phases 7E-7H: Post-MVP enhancements (Weeks 18-20)
  - Conversation Threading (7E)
  - Smart Template Wizard (7F)
  - Advanced Follow-ups (7G)
  - Dashboard Integration (7H)

**Design Reference:** `docs/design/semantic_layer/semantic_layer_UI_design.md`

---

## Table of Contents

### Core Implementation (Weeks 10-17)

1. [Architecture Overview](#architecture-overview)
2. [Phase 7A: Unified Entry (Weeks 10-11)](#phase-7a-unified-entry-weeks-10-11)
3. [Phase 7B: Semantic Integration (Weeks 12-13)](#phase-7b-semantic-integration-weeks-12-13)
4. [Phase 7C: Auto-Funnel (Weeks 14-15)](#phase-7c-auto-funnel-weeks-14-15)
5. [Phase 7D: Chart Integration (Weeks 16-17)](#phase-7d-chart-integration-weeks-16-17)

### Post-MVP Enhancements (Weeks 18-20)

6. [Phase 7E: Conversation Threading (Week 18)](#phase-7e-conversation-threading-week-18)
7. [Phase 7F: Smart Template Wizard (Week 19)](#phase-7f-smart-template-wizard-week-19)
8. [Phase 7G: Advanced Follow-ups (Week 19)](#phase-7g-advanced-follow-ups-week-19)
9. [Phase 7H: Dashboard Integration (Week 20)](#phase-7h-dashboard-integration-week-20)

### Testing & Metrics

10. [Testing Strategy](#testing-strategy)
11. [Success Metrics](#success-metrics)

---

## Architecture Overview

### The Vision

Transform from:

```
User → Choose mode → Select form → Ask question → Complex UI
```

To:

```
User → Select customer → Ask question → Get answer → Optional actions (Chart/Save/Template)
```

### Three-Mode Integration

```
┌──────────────────────────────────────────────────────────┐
│                   USER ASKS QUESTION                      │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Mode 1: Template Match (60% of queries)                 │
│  ✓ Response time: < 1s                                    │
└──────────────────────────────────────────────────────────┘
                          ↓ No match
┌──────────────────────────────────────────────────────────┐
│  Mode 2: Direct Semantic (30% of queries)                │
│  ✓ Context discovery → SQL → Results                      │
│  ✓ Response time: 2-5s                                    │
└──────────────────────────────────────────────────────────┘
                          ↓ Complex
┌──────────────────────────────────────────────────────────┐
│  Mode 3: Auto-Funnel (10% of queries)                    │
│  ✓ Auto-execute steps → Combined results                  │
│  ✓ Response time: 5-15s                                   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                   RESULTS + ACTIONS                       │
│  • Table view (default)                                  │
│  • Actions: Chart | Save | Template | Export             │
└──────────────────────────────────────────────────────────┘
```

### Component Architecture (Updated)

```
app/
├── insights/
│   ├── page.tsx                    (NEW: Unified entry point)
│   └── components/
│       ├── CustomerSelector.tsx    (NEW)
│       ├── QuestionInput.tsx       (NEW)
│       ├── SuggestedQuestions.tsx  (NEW)
│       ├── QueryHistory.tsx        (NEW: displays query history)
│       ├── ThinkingStream.tsx      (NEW)
│       ├── InsightResults.tsx      (NEW)
│       │   ├── ActionsPanel.tsx    (NEW: Chart/Save/Template/Export)
│       │   ├── TemplateResult.tsx  (NEW)
│       │   ├── DirectResult.tsx    (NEW)
│       │   │   └── SemanticMappingsPanel.tsx  (NEW)
│       │   └── FunnelResult.tsx    (REFACTOR: Vertical layout)
│       │       └── FunnelStepCard.tsx  (NEW: Per-step actions)
│       └── ResultsDisplay.tsx      (REUSE existing)
│
├── templates/
│   └── [existing template management]  (REUSE: Link from actions)
│
└── api/
    └── insights/
        ├── ask/route.ts            (NEW: Main orchestrator)
        └── save/route.ts           (NEW: Save insight)

components/
└── charts/
    └── ChartConfigurationDialog.tsx  (REUSE existing)

lib/services/
├── thinking-stream.service.ts      (NEW)
├── complexity-detector.service.ts  (NEW)
├── funnel-generator.service.ts     (NEW)
└── template-matcher.service.ts     (ENHANCE existing)
```

---

## Phase 7A: Unified Entry (Weeks 10-11)

**Goal:** Single unified interface replacing dual-mode entry. Prove UI works with existing backend.

### Database Migration: Enhance SavedInsights (Day 1)

**Need:** Add `customer_id` to support multi-customer insights

**File:** `database/migration/022_add_customer_to_saved_insights.sql`

```sql
-- Migration 022: Add customer support and semantic scope to SavedInsights
-- Purpose: Enable multi-customer insights and semantic layer integration
-- Dependencies: 014_semantic_foundation.sql (Customer table)
-- Note: Migration numbers 018-021 already exist (semantic layer foundation)

BEGIN;

-- Add customer foreign key (UUID, following semantic layer pattern)
ALTER TABLE "SavedInsights"
ADD COLUMN "customerId" UUID NULL REFERENCES "Customer"(id) ON DELETE SET NULL;

-- Add index for customer filtering
CREATE INDEX IF NOT EXISTS idx_saved_insights_customer
ON "SavedInsights" ("customerId", "isActive");

-- Update scope to support 'semantic' (in addition to 'form', 'schema')
ALTER TABLE "SavedInsights"
DROP CONSTRAINT IF EXISTS "SavedInsights_scope_check";

ALTER TABLE "SavedInsights"
ADD CONSTRAINT "SavedInsights_scope_check"
CHECK (scope IN ('form', 'schema', 'semantic'));

-- Add semantic context for debugging (optional JSONB field)
ALTER TABLE "SavedInsights"
ADD COLUMN "semanticContext" JSONB NULL;

-- Add comments for clarity
COMMENT ON COLUMN "SavedInsights"."customerId" IS 'Customer UUID for multi-tenant support (semantic layer)';
COMMENT ON COLUMN "SavedInsights"."semanticContext" IS 'Semantic discovery context for debugging and review';

COMMIT;
```

**Run migration:**

```bash
npm run migrate
```

**Exit Criteria:**

- [x] Migration runs successfully
- [x] SavedInsights supports customerId
- [x] Scope includes 'semantic' option

---

### Database Migration: Create QueryHistory Table (Day 1)

**Need:** Separate table for auto-saved query history (ephemeral) vs manually saved insights (permanent)

**File:** `database/migration/023_create_query_history.sql`

```sql
-- Migration 023: Create QueryHistory table
-- Purpose: Store auto-saved query history (ephemeral, all questions asked)
-- Dependencies: 014_semantic_foundation.sql (Customer), 012_create_users_table.sql (Users)
-- Note: This is separate from SavedInsights (manually curated insights)

BEGIN;

-- Create query history table for auto-saved questions
CREATE TABLE IF NOT EXISTS "QueryHistory" (
  "id" SERIAL PRIMARY KEY,
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "question" TEXT NOT NULL,
  "sql" TEXT NOT NULL,
  "mode" VARCHAR(20) NOT NULL CHECK ("mode" IN ('template', 'direct', 'funnel')),
  "resultCount" INTEGER DEFAULT 0,
  "semanticContext" JSONB NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_query_history_user_customer
ON "QueryHistory" ("userId", "customerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_query_history_customer_recent
ON "QueryHistory" ("customerId", "createdAt" DESC);

-- Cleanup old queries (optional: keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_query_history()
RETURNS void AS $$
BEGIN
  DELETE FROM "QueryHistory"
  WHERE "createdAt" < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Comments for clarity
COMMENT ON TABLE "QueryHistory" IS 'Auto-saved query history (ephemeral, all questions asked)';
COMMENT ON COLUMN "QueryHistory"."customerId" IS 'Customer UUID (FK to Customer table)';
COMMENT ON COLUMN "QueryHistory"."userId" IS 'User ID (FK to Users table)';
COMMENT ON COLUMN "QueryHistory"."mode" IS 'Query execution mode: template, direct, or funnel';

COMMIT;
```

**Run migration:**

```bash
npm run migrate
```

**Exit Criteria:**

- [x] Migration runs successfully
- [x] QueryHistory table created
- [x] Indexes created for efficient queries
- [x] Cleanup function available for maintenance

**Architecture Decision:**

**QueryHistory** (ephemeral, auto-saved)

- ALL queries asked by users
- Auto-saved after each ask
- 30-day retention (cleanup)
- For re-running queries

**SavedInsights** (permanent, manual)

- Only manually saved queries
- User-curated knowledge
- No retention limit
- For important insights

---

### Task 1: Create Unified Insights Page (Day 2-3)

**File:** `app/insights/page.tsx`

```typescript
// app/insights/page.tsx

"use client";

import { useState } from "react";
import { CustomerSelector } from "./components/CustomerSelector";
import { QuestionInput } from "./components/QuestionInput";
import { SuggestedQuestions } from "./components/SuggestedQuestions";
import { RecentQuestions } from "./components/RecentQuestions";
import { InsightResults } from "./components/InsightResults";
import { useInsights } from "@/lib/hooks/useInsights";

export default function InsightsPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");

  const { result, isLoading, error, ask } = useInsights();

  const handleAsk = async () => {
    if (!customerId || !question.trim()) return;
    await ask(question, customerId);
  };

  return (
    <div className="insights-page max-w-7xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Insights</h1>
        <p className="text-gray-600 mt-2">
          Ask questions about your data in natural language
        </p>
      </header>

      <div className="space-y-6">
        <CustomerSelector value={customerId} onChange={setCustomerId} />

        <QuestionInput
          value={question}
          onChange={setQuestion}
          onSubmit={handleAsk}
          disabled={!customerId || isLoading}
          isLoading={isLoading}
        />

        {customerId && !result && (
          <SuggestedQuestions customerId={customerId} onSelect={setQuestion} />
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error.message}</p>
          </div>
        )}

        {result && (
          <InsightResults
            result={result}
            customerId={customerId}
            onRefine={setQuestion}
          />
        )}

        {customerId && (
          <RecentQuestions
            customerId={customerId}
            onSelect={(q) => setQuestion(q.question)}
          />
        )}
      </div>
    </div>
  );
}
```

**Create hook:** `lib/hooks/useInsights.ts`

```typescript
// lib/hooks/useInsights.ts

import { useState } from "react";

export interface InsightResult {
  mode: "template" | "direct" | "funnel";
  thinking: ThinkingStep[];
  sql: string;
  results: {
    rows: any[];
    columns: string[];
  };
  template?: string;
  context?: any;
  funnel?: any;
}

export function useInsights() {
  const [result, setResult] = useState<InsightResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const ask = async (question: string, customerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/insights/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, customerId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { result, isLoading, error, ask, reset };
}
```

**Exit Criteria:**

- [x] New `/insights` page loads
- [x] Customer selector functional
- [x] Question input works
- [x] Loading states display
- [x] Error handling works

---

### Task 2: Customer Selector Component (Day 3)

**File:** `app/insights/components/CustomerSelector.tsx`

```typescript
// app/insights/components/CustomerSelector.tsx

"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  is_active: boolean;
}

interface CustomerSelectorProps {
  value: string;
  onChange: (customerId: string) => void;
}

export function CustomerSelector({ value, onChange }: CustomerSelectorProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers");
      const data = await response.json();
      setCustomers(data.filter((c: Customer) => c.is_active));
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="customer">Customer</Label>
      <Select value={value} onValueChange={onChange} disabled={loading}>
        <SelectTrigger id="customer" className="w-full max-w-md">
          <SelectValue
            placeholder={loading ? "Loading..." : "Select a customer..."}
          />
        </SelectTrigger>
        <SelectContent>
          {customers.map((customer) => (
            <SelectItem key={customer.id} value={customer.id}>
              {customer.name} ({customer.customer_code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

**API Endpoint:** `app/api/customers/route.ts`

```typescript
// app/api/customers/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customers = await db.query(`
    SELECT
      id,
      customer_code,
      name,
      is_active
    FROM "Customer"
    WHERE is_active = true
    ORDER BY name ASC
  `);

  return NextResponse.json(customers.rows);
}
```

**Exit Criteria:**

- [x] Fetches active customers from database
- [x] Dropdown renders correctly
- [x] Selection updates state
- [x] Uses existing shadcn/ui components

---

### Task 3: Question Input & Thinking Stream (Day 4-5)

**File:** `app/insights/components/QuestionInput.tsx`

```typescript
// app/insights/components/QuestionInput.tsx

"use client";

import { useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface QuestionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function QuestionInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isLoading = false,
  placeholder = "Ask a question about your data...",
}: QuestionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

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
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[100px] max-h-[300px] resize-none pr-20"
          rows={3}
        />

        <Button
          onClick={onSubmit}
          disabled={disabled || !value.trim() || isLoading}
          className="absolute bottom-3 right-3"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            "Ask →"
          )}
        </Button>
      </div>

      <p className="text-sm text-gray-500">
        {disabled
          ? "Select a customer to get started"
          : "Press Ctrl+Enter to submit"}
      </p>
    </div>
  );
}
```

**File:** `app/insights/components/ThinkingStream.tsx`

```typescript
// app/insights/components/ThinkingStream.tsx

"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
}

interface ThinkingStreamProps {
  steps: ThinkingStep[];
  collapsed?: boolean;
}

export function ThinkingStream({
  steps,
  collapsed: initialCollapsed = true,
}: ThinkingStreamProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const totalTime = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const hasError = steps.some((s) => s.status === "error");

  if (steps.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-gray-50 p-4",
        hasError && "border-red-200 bg-red-50"
      )}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        <span>How I answered this</span>
        {totalTime > 0 && (
          <span className="text-gray-500">
            ({(totalTime / 1000).toFixed(1)}s)
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-2 border-t pt-4">
          {steps.map((step) => (
            <ThinkingStepItem key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingStepItem({ step }: { step: ThinkingStep }) {
  const Icon = {
    pending: Loader2,
    running: Loader2,
    complete: CheckCircle,
    error: XCircle,
  }[step.status];

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 flex-shrink-0",
          step.status === "running" && "animate-spin",
          step.status === "complete" && "text-green-600",
          step.status === "error" && "text-red-600",
          (step.status === "pending" || step.status === "running") &&
            "text-blue-600"
        )}
      />
      <span className="flex-1">{step.message}</span>
      {step.duration && step.status === "complete" && (
        <span className="text-gray-500 text-xs">
          {(step.duration / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
```

**Exit Criteria:**

- [x] Textarea auto-resizes
- [x] Ctrl+Enter submits
- [x] Loading states work
- [x] Thinking stream displays
- [x] Uses shadcn/ui components

---

### Task 4: Suggested Questions & Query History (Day 6)

**File:** `app/insights/components/SuggestedQuestions.tsx`

```typescript
// app/insights/components/SuggestedQuestions.tsx

"use client";

import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

interface SuggestedQuestionsProps {
  customerId: string;
  onSelect: (question: string) => void;
}

const defaultSuggestions = [
  "What is the average healing rate for diabetic wounds?",
  "Show infection trends by wound type",
  "Compare patient outcomes across clinics",
  "List patients with >5 assessments in the last month",
];

export function SuggestedQuestions({
  customerId,
  onSelect,
}: SuggestedQuestionsProps) {
  if (!customerId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Lightbulb className="h-4 w-4" />
        <span>Try asking:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {defaultSuggestions.map((suggestion, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            onClick={() => onSelect(suggestion)}
            className="text-sm"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

**File:** `app/insights/components/RecentQuestions.tsx`

```typescript
// app/insights/components/RecentQuestions.tsx

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface RecentQuestion {
  id: string;
  question: string;
  createdAt: Date;
  mode: "template" | "direct" | "funnel";
  recordCount?: number;
}

interface RecentQuestionsProps {
  customerId: string;
  onSelect: (question: RecentQuestion) => void;
}

export function RecentQuestions({
  customerId,
  onSelect,
}: RecentQuestionsProps) {
  const [questions, setQuestions] = useState<RecentQuestion[]>([]);

  useEffect(() => {
    if (customerId) {
      fetchRecentQuestions();
    }
  }, [customerId]);

  const fetchRecentQuestions = async () => {
    try {
      const response = await fetch(
        `/api/insights/recent?customerId=${customerId}`
      );
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error("Failed to fetch recent questions:", error);
    }
  };

  if (!customerId || questions.length === 0) return null;

  return (
    <div className="mt-8 pt-8 border-t space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Clock className="h-4 w-4" />
        <span>Recent Questions</span>
      </div>
      <div className="space-y-2">
        {questions.map((q) => (
          <Button
            key={q.id}
            variant="ghost"
            className="w-full justify-start text-left h-auto py-3"
            onClick={() => onSelect(q)}
          >
            <div className="space-y-1">
              <div className="font-medium">{q.question}</div>
              <div className="text-xs text-gray-500">
                {formatTimestamp(q.createdAt)} •
                {q.recordCount && ` ${q.recordCount} records •`}
                {q.mode === "template" && " Used template"}
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "Just now";
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}
```

**Exit Criteria:**

- [x] Suggested questions display
- [x] Recent questions fetch from API
- [x] Click fills question input
- [x] Timestamps formatted

---

### Phase 7A Exit Criteria Checklist

**STATUS: ✅ 100% COMPLETE - Option A Implemented**

- [x] Database migration adds customerId to SavedInsights
- [x] New `/insights/new` page loads without errors
- [x] Customer selector fetches and displays
- [x] Question input works with auto-resize
- [x] Suggested questions populate
- [x] Query history fetch and display ✅ **FIXED: QueryHistory table implemented**
- [x] Thinking stream shows steps
- [x] All styling uses shadcn/ui
- [x] Mobile responsive
- [x] No TypeScript errors

**✅ SOLUTION IMPLEMENTED: QueryHistory Table (Auto-save queries)**

**What was implemented:**

1. **Created QueryHistory table** (`database/migration/023_create_query_history.sql`)

   - Stores ALL queries asked (ephemeral, auto-saved)
   - Separate from SavedInsights (manually curated)
   - Includes: question, SQL, mode, resultCount, semanticContext
   - Auto-cleanup function (30-day retention)

2. **Created /api/insights/history** (renamed from /api/insights/recent)

   - **POST**: Save query to QueryHistory (auto-save after asking)
   - **GET**: Fetch query history for user + customer
   - Returns last 10 queries, most recent first

3. **Enhanced useInsights hook** (`lib/hooks/useInsights.ts`)

   - Auto-saves to QueryHistory after successful ask
   - Non-blocking (failures don't affect main flow)
   - Stores mode, resultCount, and semanticContext

4. **Created QueryHistory component** (renamed from RecentQuestions)
   - Displays query history from QueryHistory table
   - Shows timestamp, record count, and mode
   - Click to re-run a previous query

**How it works:**

```
User asks question
  ↓
POST /api/insights/ask returns results
  ↓
UI displays results
  ↓
Auto-save to QueryHistory table (background)
  ↓
Query history fetched on next render
  ↓
User sees question in "Query History" section ✅
```

**Architecture - Query vs Insight:**

```
QueryHistory table (ephemeral)
  - ALL queries asked
  - Auto-saved immediately
  - 30-day retention
  - For re-running queries

SavedInsights table (permanent)
  - Manually saved queries
  - User-curated knowledge
  - No auto-save
  - For important insights
```

**Benefits:**

- ✅ Clear separation: queries (temporary) vs insights (permanent)
- ✅ Query history works immediately
- ✅ Users can re-run past queries easily
- ✅ No clutter in SavedInsights table
- ✅ Non-breaking (history save failures are logged, not thrown)

**Phase 7D Enhancement Plan:**

- SaveInsightDialog allows users to manually save valuable queries as insights
- Users can add names, descriptions, and tags
- Saved insights appear in /insights (saved insights page)

---

## Phase 7B: Semantic Integration (Weeks 12-13)

**Goal:** Wire three-mode logic with real semantic layer APIs.

### Task 5: Template Matching Service (Day 1-2)

_[Implementation same as previous version - uses existing template catalog]_

### Task 6: Complexity Detection Service (Day 2)

_[Implementation same as previous version]_

### Task 7: Three-Mode Orchestrator API (Day 3-5)

_[Implementation same as previous version - main orchestrator with template/direct/funnel routing]_

### Task 8: Results Display with Actions Panel (Day 6-8)

**File:** `app/insights/components/InsightResults.tsx`

```typescript
// app/insights/components/InsightResults.tsx

"use client";

import { ThinkingStream } from "./ThinkingStream";
import { ActionsPanel } from "./ActionsPanel";
import { ResultsDisplay } from "@/app/components/ResultsDisplay"; // Reuse existing
import { SemanticMappingsPanel } from "./SemanticMappingsPanel";

export interface InsightResult {
  mode: "template" | "direct" | "funnel";
  thinking: ThinkingStep[];
  sql: string;
  results: {
    rows: any[];
    columns: string[];
  };
  template?: string;
  context?: any;
  funnel?: any;
}

interface InsightResultsProps {
  result: InsightResult;
  customerId: string;
  onRefine: (question: string) => void;
}

export function InsightResults({
  result,
  customerId,
  onRefine,
}: InsightResultsProps) {
  return (
    <div className="space-y-6">
      <ThinkingStream steps={result.thinking} />

      {result.mode === "template" && (
        <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
          📋 Used template: <strong>{result.template}</strong>
        </div>
      )}

      {result.mode === "direct" && result.context && (
        <SemanticMappingsPanel context={result.context} />
      )}

      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Results ({result.results.rows.length} records)
          </h3>
        </div>

        <ResultsDisplay
          data={result.results.rows}
          columns={result.results.columns}
        />
      </div>

      <ActionsPanel
        result={result}
        customerId={customerId}
        onRefine={onRefine}
      />
    </div>
  );
}
```

**File:** `app/insights/components/ActionsPanel.tsx`

```typescript
// app/insights/components/ActionsPanel.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Save,
  FileText,
  Download,
  MessageSquare,
} from "lucide-react";
import { ChartConfigurationDialog } from "@/components/charts/ChartConfigurationDialog";
import { SaveInsightDialog } from "./SaveInsightDialog";
import Link from "next/link";

interface ActionsPanelProps {
  result: InsightResult;
  customerId: string;
  onRefine: (question: string) => void;
}

export function ActionsPanel({
  result,
  customerId,
  onRefine,
}: ActionsPanelProps) {
  const [showChartBuilder, setShowChartBuilder] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  return (
    <>
      <div className="bg-gray-50 rounded-lg border p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">
          What would you like to do next?
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChartBuilder(true)}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Create Chart
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Insight
          </Button>

          <Link href="/templates/new">
            <Button variant="outline" size="sm">
              <FileText className="mr-2 h-4 w-4" />
              Save as Template
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(result.results)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>

          <Button variant="outline" size="sm" onClick={() => onRefine("")}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Ask Follow-up
          </Button>
        </div>
      </div>

      {/* Reuse existing ChartConfigurationDialog */}
      <ChartConfigurationDialog
        isOpen={showChartBuilder}
        onClose={() => setShowChartBuilder(false)}
        queryResults={result.results.rows}
        chartType="bar"
        onSave={(config) => {
          // Handle chart save with SaveInsightDialog
          setShowChartBuilder(false);
          setShowSaveDialog(true);
        }}
      />

      <SaveInsightDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        result={result}
        customerId={customerId}
      />
    </>
  );
}

function exportCSV(results: { rows: any[]; columns: string[] }) {
  const csv = [
    results.columns.join(","),
    ...results.rows.map((row) =>
      results.columns.map((col) => JSON.stringify(row[col])).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "results.csv";
  a.click();
}
```

**Exit Criteria:**

- [x] Actions panel shows all buttons
- [x] Chart button opens existing ChartConfigurationDialog
- [x] Save button opens new SaveInsightDialog
- [x] Template button links to /templates/new
- [x] Export CSV works

---

### Phase 7B Exit Criteria Checklist

- [ ] Template matching integrated
- [ ] Complexity detection classifies questions
- [ ] Three modes route correctly
- [ ] Actions panel displays
- [ ] ChartConfigurationDialog opens
- [ ] All modes return valid results

---

---

# Workflow Philosophy: Progressive Disclosure + Conversational Refinement

**Added:** 2025-11-03
**Status:** Design Complete, Ready for Implementation

## The Core Problem

Traditional approaches force users into two extremes:

**Manual Funnel (Too Much Control):**

- ❌ User approves every step
- ❌ Too many clicks, breaks flow
- ❌ Requires understanding of decomposition
- ✅ But: User has full control

**Auto-Funnel (Too Little Control):**

- ✅ Fast, automatic execution
- ✅ Simple user experience
- ❌ But: Black box, no intervention
- ❌ If one step wrong, whole query fails

## Our Solution: Three Levels of Engagement

### **Level 1: Auto Mode (Default - 80% of queries)**

User asks → System auto-executes → Results appear → User is happy → Done

**UI:**

```
┌─────────────────────────────────────────────────────┐
│ Results (150 records)                   [Showing data] │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Table with patient data...]                    │ │
│ │ ID | Name      | Age | City     | Status       │ │
│ │ 1  | John Doe  | 45  | Auckland | Active       │ │
│ │ 2  | Jane Smith| 62  | Auckland | Active       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ▼ How I got this (click to expand)                  │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Save] [Chart] [Export] [Refine] [Ask Follow-up]│ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### **Level 2: Inspection Mode (User validates)**

User clicks "How I got this" or sees unexpected results

**UI (Expanded):**

```
┌─────────────────────────────────────────────────────┐
│ ▲ How I got this answer                             │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Understanding] [SQL] [Tables/Fields] [Context]  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ What I understood:                                   │
│ • You want: Patients                                │
│ • Filtered by: Status = 'Active'                    │
│ • Filtered by: City = 'Auckland'                    │
│                                                       │
│ SQL I generated:                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SELECT * FROM rpt.Patient                        │ │
│ │ WHERE Status = 'Active'                          │ │
│ │   AND City = 'Auckland'                          │ │
│ │ LIMIT 1000                                       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ Tables/Fields I used:                                │
│ • rpt.Patient (150 matching records)                │
│   ├─ Status field (for 'active' filter)            │
│   └─ City field (for 'Auckland' filter)            │
│                                                       │
│ ⚠️ My assumptions:                                   │
│ • "Active" means Status = 'Active'                  │
│   [Challenge this]                                   │
│ • "Auckland" matches City field exactly             │
│   [Challenge this]                                   │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 💬 Ask me about this query                       │ │
│ │                                                   │ │
│ │ Quick questions:                                  │ │
│ │ • Why did you use Status = 'Active'?             │ │
│ │ • Show me alternative interpretations            │ │
│ │ • Include inactive patients too                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ [Re-run] [Edit SQL Directly] [Deep Dive Into Steps] │
└─────────────────────────────────────────────────────┘
```

**Conversational Refinement Example:**

```
User types: "Why did you use Status = 'Active'?"

AI responds:
┌─────────────────────────────────────────────────────┐
│ I interpreted "active patients" as patients with    │
│ Status = 'Active'.                                   │
│                                                       │
│ Did you mean something else? I see these            │
│ alternatives in the schema:                          │
│                                                       │
│ • HasActiveWounds = true?                           │
│ • LastVisitDate within last 90 days?                │
│ • Currently enrolled in treatment?                  │
│                                                       │
│ Or describe what "active" means to you:             │
│ [Text input box]                                     │
└─────────────────────────────────────────────────────┘
```

**After user clarifies:**

```
User types: "I meant has active wounds"

AI responds:
┌─────────────────────────────────────────────────────┐
│ ✓ Got it! I'll regenerate using HasActiveWounds.   │
│                                                       │
│ Here's what I changed:                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ - WHERE Status = 'Active'                        │ │
│ │ + WHERE HasActiveWounds = true                   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ This will likely return different results           │
│ (focusing on wound status, not patient status).     │
│                                                       │
│ [▶ Re-run with this change] [Keep editing]          │
└─────────────────────────────────────────────────────┘
```

### **Level 3: Deep Dive Mode (Complex queries)**

For complex questions, show step preview BEFORE executing

**UI (Complex Question Detected):**

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ This is a complex query (complexity: 8/10)       │
│                                                       │
│ I'll break it down into 4 steps. Here's my plan:    │
│                                                       │
│ ▼ Step 1: Get diabetic patients over 60             │
│   │ Tables: Patient, PatientCondition               │
│   │ Estimated: ~500 patients                        │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ ▼ Step 2: Get wounds for these patients             │
│   │ Tables: Wound                                    │
│   │ Estimated: ~1,200 wounds                        │
│   │ Depends on: Step 1 results                      │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ ▼ Step 3: Filter Auckland + calculate healing       │
│   │ Tables: Wound, Address                          │
│   │ Estimated: ~800 wounds                          │
│   │ Depends on: Step 2 results                      │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ ▼ Step 4: Group by type and average                 │
│   │ Aggregation: AVG(healing_days)                  │
│   │ Estimated: 3-5 groups                           │
│   │ Depends on: Step 3 results                      │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ Total estimated time: ~8-12 seconds                 │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [▶ Run All Steps] [🔍 Inspect Each Step]        │ │
│ │ [👣 Step Through Manually]                       │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Interactive Step Inspection:**

```
User clicks [🔍 Inspect Each Step] → Step 1 expands:

┌─────────────────────────────────────────────────────┐
│ Step 1: Get diabetic patients over 60               │
│                                                       │
│ My interpretation:                                   │
│ • "Diabetic" = PatientCondition.Name = 'Diabetes'   │
│ • "Over 60" = Patient.Age > 60                      │
│                                                       │
│ SQL:                                                 │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SELECT p.PatientId, p.Name, p.Age               │ │
│ │ FROM rpt.Patient p                               │ │
│ │ JOIN rpt.PatientCondition pc                     │ │
│ │   ON p.PatientId = pc.PatientId                  │ │
│ │ WHERE pc.ConditionName = 'Diabetes'              │ │
│ │   AND p.Age > 60                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ⚠️ Assumptions:                                      │
│ • Using exact match 'Diabetes' (not 'Pre-Diabetes') │
│   [Include pre-diabetes too]                        │
│ • Age is current age, not age at wound occurrence   │
│   [Challenge this]                                   │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 💬 Questions or corrections?                     │ │
│ │ [Text input box]                                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ [✓ Approve] [✏️ Edit SQL] [🗑️ Skip Step] [▶ Test]  │
└─────────────────────────────────────────────────────┘
```

#### Handling Empty Results

**Smart Empty State:**

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ No results found (0 records)                     │
│                                                       │
│ This could mean:                                     │
│ • There really is no matching data ✓                │
│ • My filters were too strict                        │
│ • I used the wrong table/field                      │
│ • The data exists but under different names         │
│                                                       │
│ Let me help you troubleshoot:                        │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [🔍 Check if data exists]                        │ │
│ │ Verify if there's ANY matching data in database  │ │
│ │                                                   │ │
│ │ [🔧 Broaden filters]                             │ │
│ │ Try removing some restrictions                   │ │
│ │                                                   │ │
│ │ [📋 Show me the SQL]                             │ │
│ │ Review the query I generated                     │ │
│ │                                                   │ │
│ │ [🔄 Start over with guidance]                    │ │
│ │ Let me ask clarifying questions                  │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**"Check if data exists" flow:**

```
User clicks [🔍 Check if data exists]

AI investigates:
┌─────────────────────────────────────────────────────┐
│ 🔍 Data Existence Check                             │
│                                                       │
│ Let me check each filter separately...              │
│                                                       │
│ ✓ Found 2,500 patients in rpt.Patient              │
│ ✓ Found 450 with Status = 'Active'                 │
│ ✓ Found 800 in City = 'Auckland'                   │
│ ✗ Found 0 that match BOTH filters                   │
│                                                       │
│ The issue: No patients are both Active AND in       │
│ Auckland.                                            │
│                                                       │
│ Here's the breakdown:                                │
│ • Auckland patients: Mostly 'Inactive' status       │
│ • Active patients: Mostly in Wellington/Christchurch│
│                                                       │
│ Want to:                                             │
│ • Remove location filter? (show all Active)         │
│ • Remove status filter? (show all Auckland)         │
│ • Check spelling of 'Auckland'?                     │
│ • See where Active patients are located?            │
└─────────────────────────────────────────────────────┘
```

#### Key UI Components Needed

##### **1. Collapsible Inspection Panel**

**Component:** `app/insights/new/components/InspectionPanel.tsx`

**Features:**

- Tabs: Understanding | SQL | Tables/Fields | Context
- Collapsible by default
- Persists expansion state in session
- Syntax highlighting for SQL
- Interactive schema tree

##### **2. Conversational Refinement Input**

**Component:** `app/insights/new/components/ConversationalRefinement.tsx`

**Features:**

- Context-aware suggestions (based on empty results, complex query, etc.)
- Quick action buttons
- Natural language understanding
- History of refinements in session
- Diff viewer for SQL changes

##### **3. Step Preview & Approval**

**Component:** `app/insights/new/components/StepPreview.tsx`

**Features:**

- Expandable step cards
- Interactive approval workflow
- Preview SQL for each step
- Test-run individual steps
- Modify step logic
- Skip steps
- Reorder steps

##### **4. Assumption Validation**

**Component:** `app/insights/new/components/AssumptionValidator.tsx`

**Features:**

- Lists all AI assumptions
- One-click challenge
- Alternative interpretations
- Confidence scores
- Schema evidence

##### **5. Diff Viewer**

**Component:** `app/insights/new/components/SQLDiffViewer.tsx`

**Features:**

- Side-by-side SQL comparison
- Highlighted changes
- Explanation of why changed
- Estimated impact on results
- Rollback option

##### **6. Smart Empty State**

**Component:** `app/insights/new/components/SmartEmptyState.tsx`

**Features:**

- Automatic data existence check
- Filter analysis
- Troubleshooting suggestions
- Guided refinement
- Alternative queries

---

### Implementation Tasks

### Task 9: Complexity Thresholds & Routing (Day 1)

**Enhance:** `lib/services/semantic/complexity-detector.service.ts`

Add threshold-based routing logic:

```typescript
export interface ComplexityThresholds {
  simple: number; // 0-4: Direct execution
  medium: number; // 5-7: Preview + auto-execute
  complex: number; // 8-10: Require inspection
}

export function getExecutionStrategy(
  analysis: ComplexityAnalysis
): "auto" | "preview" | "inspect" {
  const score = analysis.indicators.multiStep
    ? calculateComplexityScore(analysis)
    : 0;

  if (score <= 4) return "auto";
  if (score <= 7) return "preview";
  return "inspect";
}
```

**Exit Criteria:**

- [ ] Complexity scoring returns 0-10 scale
- [ ] Three execution strategies defined
- [ ] Threshold configuration externalized

---

## Phase 7C: Progressive Auto-Funnel (Weeks 14-15)

**Goal:** Implement intelligent auto-funnel with three levels of user engagement

### Architecture: Progressive Disclosure + Conversational Refinement

**Status:** Design Complete, Ready for Implementation

#### The Core Problem

Traditional approaches force users into two extremes:

**Manual Funnel (Too Much Control):**

- ❌ User approves every step
- ❌ Too many clicks, breaks flow
- ❌ Requires understanding of decomposition
- ✅ But: User has full control

**Auto-Funnel (Too Little Control):**

- ✅ Fast, automatic execution
- ✅ Simple user experience
- ❌ But: Black box, no intervention
- ❌ If one step wrong, whole query fails

#### Our Solution: Three Levels of Engagement

##### **Level 1: Auto Mode (Default - 80% of queries)**

User asks → System auto-executes → Results appear → User is happy → Done

**UI:**

```
┌─────────────────────────────────────────────────────┐
│ Results (150 records)                   [Showing data] │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Table with patient data...]                    │ │
│ │ ID | Name      | Age | City     | Status       │ │
│ │ 1  | John Doe  | 45  | Auckland | Active       │ │
│ │ 2  | Jane Smith| 62  | Auckland | Active       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ▼ How I got this (click to expand)                  │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Save] [Chart] [Export] [Refine] [Ask Follow-up]│ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

##### **Level 2: Inspection Mode (User validates)**

User clicks "How I got this" or sees unexpected results

**UI (Expanded):**

```
┌─────────────────────────────────────────────────────┐
│ ▲ How I got this answer                             │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Understanding] [SQL] [Tables/Fields] [Context]  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ What I understood:                                   │
│ • You want: Patients                                │
│ • Filtered by: Status = 'Active'                    │
│ • Filtered by: City = 'Auckland'                    │
│                                                       │
│ SQL I generated:                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SELECT * FROM rpt.Patient                        │ │
│ │ WHERE Status = 'Active'                          │ │
│ │   AND City = 'Auckland'                          │ │
│ │ LIMIT 1000                                       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ Tables/Fields I used:                                │
│ • rpt.Patient (150 matching records)                │
│   ├─ Status field (for 'active' filter)            │
│   └─ City field (for 'Auckland' filter)            │
│                                                       │
│ ⚠️ My assumptions:                                   │
│ • "Active" means Status = 'Active'                  │
│   [Challenge this]                                   │
│ • "Auckland" matches City field exactly             │
│   [Challenge this]                                   │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 💬 Ask me about this query                       │ │
│ │                                                   │ │
│ │ Quick questions:                                  │ │
│ │ • Why did you use Status = 'Active'?             │ │
│ │ • Show me alternative interpretations            │ │
│ │ • Include inactive patients too                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ [Re-run] [Edit SQL Directly] [Deep Dive Into Steps] │
└─────────────────────────────────────────────────────┘
```

**Conversational Refinement Example:**

```
User types: "Why did you use Status = 'Active'?"

AI responds:
┌─────────────────────────────────────────────────────┐
│ I interpreted "active patients" as patients with    │
│ Status = 'Active'.                                   │
│                                                       │
│ Did you mean something else? I see these            │
│ alternatives in the schema:                          │
│                                                       │
│ • HasActiveWounds = true?                           │
│ • LastVisitDate within last 90 days?                │
│ • Currently enrolled in treatment?                  │
│                                                       │
│ Or describe what "active" means to you:             │
│ [Text input box]                                     │
└─────────────────────────────────────────────────────┘
```

**After user clarifies:**

```
User types: "I meant has active wounds"

AI responds:
┌─────────────────────────────────────────────────────┐
│ ✓ Got it! I'll regenerate using HasActiveWounds.   │
│                                                       │
│ Here's what I changed:                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ - WHERE Status = 'Active'                        │ │
│ │ + WHERE HasActiveWounds = true                   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ This will likely return different results           │
│ (focusing on wound status, not patient status).     │
│                                                       │
│ [▶ Re-run with this change] [Keep editing]          │
└─────────────────────────────────────────────────────┘
```

##### **Level 3: Deep Dive Mode (Complex queries)**

For complex questions, show step preview BEFORE executing

**UI (Complex Question Detected):**

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ This is a complex query (complexity: 8/10)       │
│                                                       │
│ I'll break it down into 4 steps. Here's my plan:    │
│                                                       │
│ ▼ Step 1: Get diabetic patients over 60             │
│   │ Tables: Patient, PatientCondition               │
│   │ Estimated: ~500 patients                        │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ ▼ Step 2: Get wounds for these patients             │
│   │ Tables: Wound                                    │
│   │ Estimated: ~1,200 wounds                        │
│   │ Depends on: Step 1 results                      │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ ▼ Step 3: Filter Auckland + calculate healing       │
│   │ Tables: Wound, Address                          │
│   │ Estimated: ~800 wounds                          │
│   │ Depends on: Step 2 results                      │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ ▼ Step 4: Group by type and average                 │
│   │ Aggregation: AVG(healing_days)                  │
│   │ Estimated: 3-5 groups                           │
│   │ Depends on: Step 3 results                      │
│   │ [Preview SQL] [Modify]                          │
│   └─────────────────────────────────────────────────│
│                                                       │
│ Total estimated time: ~8-12 seconds                 │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [▶ Run All Steps] [🔍 Inspect Each Step]        │ │
│ │ [👣 Step Through Manually]                       │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Interactive Step Inspection:**

```
User clicks [🔍 Inspect Each Step] → Step 1 expands:

┌─────────────────────────────────────────────────────┐
│ Step 1: Get diabetic patients over 60               │
│                                                       │
│ My interpretation:                                   │
│ • "Diabetic" = PatientCondition.Name = 'Diabetes'   │
│ • "Over 60" = Patient.Age > 60                      │
│                                                       │
│ SQL:                                                 │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SELECT p.PatientId, p.Name, p.Age               │ │
│ │ FROM rpt.Patient p                               │ │
│ │ JOIN rpt.PatientCondition pc                     │ │
│ │   ON p.PatientId = pc.PatientId                  │ │
│ │ WHERE pc.ConditionName = 'Diabetes'              │ │
│ │   AND p.Age > 60                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ⚠️ Assumptions:                                      │
│ • Using exact match 'Diabetes' (not 'Pre-Diabetes') │
│   [Include pre-diabetes too]                        │
│ • Age is current age, not age at wound occurrence   │
│   [Challenge this]                                   │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 💬 Questions or corrections?                     │ │
│ │ [Text input box]                                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ [✓ Approve] [✏️ Edit SQL] [🗑️ Skip Step] [▶ Test]  │
└─────────────────────────────────────────────────────┘
```

#### Handling Empty Results

**Smart Empty State:**

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ No results found (0 records)                     │
│                                                       │
│ This could mean:                                     │
│ • There really is no matching data ✓                │
│ • My filters were too strict                        │
│ • I used the wrong table/field                      │
│ • The data exists but under different names         │
│                                                       │
│ Let me help you troubleshoot:                        │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [🔍 Check if data exists]                        │ │
│ │ Verify if there's ANY matching data in database  │ │
│ │                                                   │ │
│ │ [🔧 Broaden filters]                             │ │
│ │ Try removing some restrictions                   │ │
│ │                                                   │ │
│ │ [📋 Show me the SQL]                             │ │
│ │ Review the query I generated                     │ │
│ │                                                   │ │
│ │ [🔄 Start over with guidance]                    │ │
│ │ Let me ask clarifying questions                  │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**"Check if data exists" flow:**

```
User clicks [🔍 Check if data exists]

AI investigates:
┌─────────────────────────────────────────────────────┐
│ 🔍 Data Existence Check                             │
│                                                       │
│ Let me check each filter separately...              │
│                                                       │
│ ✓ Found 2,500 patients in rpt.Patient              │
│ ✓ Found 450 with Status = 'Active'                 │
│ ✓ Found 800 in City = 'Auckland'                   │
│ ✗ Found 0 that match BOTH filters                   │
│                                                       │
│ The issue: No patients are both Active AND in       │
│ Auckland.                                            │
│                                                       │
│ Here's the breakdown:                                │
│ • Auckland patients: Mostly 'Inactive' status       │
│ • Active patients: Mostly in Wellington/Christchurch│
│                                                       │
│ Want to:                                             │
│ • Remove location filter? (show all Active)         │
│ • Remove status filter? (show all Auckland)         │
│ • Check spelling of 'Auckland'?                     │
│ • See where Active patients are located?            │
└─────────────────────────────────────────────────────┘
```

#### Key UI Components Needed

##### **1. Collapsible Inspection Panel**

**Component:** `app/insights/new/components/InspectionPanel.tsx`

**Features:**

- Tabs: Understanding | SQL | Tables/Fields | Context
- Collapsible by default
- Persists expansion state in session
- Syntax highlighting for SQL
- Interactive schema tree

##### **2. Conversational Refinement Input**

**Component:** `app/insights/new/components/ConversationalRefinement.tsx`

**Features:**

- Context-aware suggestions (based on empty results, complex query, etc.)
- Quick action buttons
- Natural language understanding
- History of refinements in session
- Diff viewer for SQL changes

##### **3. Step Preview & Approval**

**Component:** `app/insights/new/components/StepPreview.tsx`

**Features:**

- Expandable step cards
- Interactive approval workflow
- Preview SQL for each step
- Test-run individual steps
- Modify step logic
- Skip steps
- Reorder steps

##### **4. Assumption Validation**

**Component:** `app/insights/new/components/AssumptionValidator.tsx`

**Features:**

- Lists all AI assumptions
- One-click challenge
- Alternative interpretations
- Confidence scores
- Schema evidence

##### **5. Diff Viewer**

**Component:** `app/insights/new/components/SQLDiffViewer.tsx`

**Features:**

- Side-by-side SQL comparison
- Highlighted changes
- Explanation of why changed
- Estimated impact on results
- Rollback option

##### **6. Smart Empty State**

**Component:** `app/insights/new/components/SmartEmptyState.tsx`

**Features:**

- Automatic data existence check
- Filter analysis
- Troubleshooting suggestions
- Guided refinement
- Alternative queries

---

### Implementation Tasks

### Task 9: Complexity Thresholds & Routing (Day 1)

**Enhance:** `lib/services/semantic/complexity-detector.service.ts`

Add threshold-based routing logic:

```typescript
export interface ComplexityThresholds {
  simple: number; // 0-4: Direct execution
  medium: number; // 5-7: Preview + auto-execute
  complex: number; // 8-10: Require inspection
}

export function getExecutionStrategy(
  analysis: ComplexityAnalysis
): "auto" | "preview" | "inspect" {
  const score = analysis.indicators.multiStep
    ? calculateComplexityScore(analysis)
    : 0;

  if (score <= 4) return "auto";
  if (score <= 7) return "preview";
  return "inspect";
}
```

**Exit Criteria:**

- [ ] Complexity scoring returns 0-10 scale
- [ ] Three execution strategies defined
- [ ] Threshold configuration externalized

---

## Phase 7D: Chart Integration (Weeks 16-17)

**Goal:** Full chart creation workflow with existing ChartConfigurationDialog.

### Task 9: Save Insight Dialog (Day 1-2)

**File:** `app/insights/components/SaveInsightDialog.tsx`

```typescript
// app/insights/components/SaveInsightDialog.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

interface SaveInsightDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: InsightResult;
  customerId: string;
  chartConfig?: {
    chartType: string;
    chartMapping: Record<string, string>;
  };
}

export function SaveInsightDialog({
  isOpen,
  onClose,
  result,
  customerId,
  chartConfig,
}: SaveInsightDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please provide a name for this insight",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/insights/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          question: result.question || "",
          customerId,
          sql: result.sql,
          chartType: chartConfig?.chartType || "table",
          chartMapping: chartConfig?.chartMapping || {},
          scope: "semantic", // New scope for semantic layer insights
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          semanticContext: includeContext ? result.context : null,
          results: result.results.rows.slice(0, 100), // Save first 100 rows
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save insight");
      }

      const data = await response.json();

      toast({
        title: "Insight saved",
        description: `"${name}" has been saved successfully`,
      });

      onClose();

      // Optionally redirect to saved insight
      if (data.id) {
        router.push(`/insights/${data.id}`);
      }
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Insight</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Healing Rate - Diabetic Wounds"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this insight show?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., healing, diabetic, outcomes"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="include-context">Include semantic context</Label>
              <p className="text-sm text-gray-500">
                Save semantic mappings for debugging
              </p>
            </div>
            <Switch
              id="include-context"
              checked={includeContext}
              onCheckedChange={setIncludeContext}
            />
          </div>

          {chartConfig && (
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p className="font-medium text-blue-900">Chart included</p>
              <p className="text-blue-700">
                {chartConfig.chartType} chart with configured mappings
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Insight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**API Endpoint:** `app/api/insights/save/route.ts`

```typescript
// app/api/insights/save/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    name,
    description,
    question,
    customerId, // UUID string
    sql,
    chartType,
    chartMapping,
    scope,
    tags,
    semanticContext,
  } = await req.json();

  try {
    const result = await db.query(
      `
      INSERT INTO "SavedInsights" (
        name,
        question,
        scope,
        "customerId",
        "userId",
        sql,
        "chartType",
        "chartMapping",
        description,
        tags,
        "semanticContext",
        "createdBy"
      )
      VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `,
      [
        name,
        question,
        scope || "semantic",
        customerId, // UUID string, cast in query
        session.user.id, // INTEGER userId (from Users table)
        sql,
        chartType,
        JSON.stringify(chartMapping),
        description,
        JSON.stringify(tags || []),
        semanticContext ? JSON.stringify(semanticContext) : null,
        session.user.email,
      ]
    );

    return NextResponse.json({
      id: result.rows[0].id,
      message: "Insight saved successfully",
    });
  } catch (error) {
    console.error("Failed to save insight:", error);
    return NextResponse.json(
      { error: "Failed to save insight" },
      { status: 500 }
    );
  }
}
```

**Exit Criteria:**

- [x] Dialog opens from ActionsPanel
- [x] All fields save to database
- [x] Uses existing SavedInsights schema
- [x] Chart config optional
- [x] Redirects to saved insight

---

### Task 10: Chart Builder Integration (Day 3-4)

**Update ActionsPanel** to handle chart → save flow:

```typescript
// app/insights/components/ActionsPanel.tsx (Enhanced)

export function ActionsPanel({
  result,
  customerId,
  onRefine,
}: ActionsPanelProps) {
  const [showChartBuilder, setShowChartBuilder] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [chartConfig, setChartConfig] = useState<any>(null);

  const handleChartSave = (config: {
    chartType: string;
    chartMapping: Record<string, string>;
  }) => {
    setChartConfig(config);
    setShowChartBuilder(false);
    setShowSaveDialog(true); // Auto-open save dialog after chart config
  };

  return (
    <>
      {/* ... buttons ... */}

      {/* Reuse existing ChartConfigurationDialog */}
      <ChartConfigurationDialog
        isOpen={showChartBuilder}
        onClose={() => setShowChartBuilder(false)}
        queryResults={result.results.rows}
        chartType="bar"
        allowTypeChange={true}
        onTypeChange={(type) => {
          // Handle chart type changes
        }}
        onSave={handleChartSave}
        saveButtonText="Continue to Save"
      />

      <SaveInsightDialog
        isOpen={showSaveDialog}
        onClose={() => {
          setShowSaveDialog(false);
          setChartConfig(null);
        }}
        result={result}
        customerId={customerId}
        chartConfig={chartConfig}
      />
    </>
  );
}
```

**Exit Criteria:**

- [x] Chart builder opens from actions
- [x] Reuses existing ChartConfigurationDialog
- [x] Flows to SaveInsightDialog
- [x] Chart config passed through
- [x] Two-step flow works smoothly

---

### Task 11: Export & Link to Templates (Day 5)

**Export Options:**

```typescript
// lib/utils/export.ts

export function exportToCSV(
  results: { rows: any[]; columns: string[] },
  filename: string
) {
  const csv = [
    results.columns.join(","),
    ...results.rows.map((row) =>
      results.columns.map((col) => JSON.stringify(row[col] ?? "")).join(",")
    ),
  ].join("\n");

  downloadFile(csv, `${filename}.csv`, "text/csv");
}

export function exportToJSON(data: any, filename: string) {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `${filename}.json`, "application/json");
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Link to Templates:**

```typescript
// In ActionsPanel, enhance template link to pass data

<Link
  href={{
    pathname: "/templates/new",
    query: {
      fromInsight: true,
      sql: result.sql,
      question: result.question,
      // Optionally pre-fill from semantic context
      intent: result.context?.intent.type,
    },
  }}
>
  <Button variant="outline" size="sm">
    <FileText className="mr-2 h-4 w-4" />
    Save as Template
  </Button>
</Link>
```

**Exit Criteria:**

- [x] CSV export works
- [x] JSON export works
- [x] Template link passes data
- [x] All export formats valid

---

### Phase 7D Exit Criteria Checklist

- [ ] SaveInsightDialog functional
- [ ] ChartConfigurationDialog integrated
- [ ] Chart → Save flow works
- [ ] Exports (CSV, JSON) work
- [ ] Template link passes data
- [ ] Saved insights persist to database
- [ ] All actions tested end-to-end

---

## Testing Strategy

### Unit Tests

**Coverage targets:**

- Services: 80%+
- Components: 70%+
- Utilities: 90%+

**Key test files:**

```
lib/services/__tests__/
├── template-matcher.service.test.ts
├── complexity-detector.service.test.ts
└── funnel-generator.service.test.ts

app/insights/components/__tests__/
├── QuestionInput.test.tsx
├── ThinkingStream.test.tsx
├── ActionsPanel.test.tsx
└── SaveInsightDialog.test.tsx
```

### Integration Tests

**Test scenarios:**

1. Template mode: Question → Template match → SQL → Results → Chart → Save
2. Direct mode: Question → Context discovery → SQL → Results → Save
3. Funnel mode: Question → Funnel generation → Auto-execution → Results → Save step

### E2E Tests

**User flows:**

1. New user: Select customer → Ask question → See results → Create chart → Save
2. Power user: Ask question → View semantic mappings → Edit SQL → Save
3. Funnel user: Complex question → View steps → Save individual step
4. Error recovery: Invalid question → Error → Refine → Success

---

## Success Metrics

### User Experience Metrics

| Metric                  | Target | Measurement                     |
| ----------------------- | ------ | ------------------------------- |
| Time to first insight   | < 10s  | From question submit to results |
| User satisfaction (NPS) | > 8.0  | Post-interaction survey         |
| Question success rate   | > 85%  | Valid results / total queries   |
| Template match rate     | > 60%  | Queries using templates         |
| Chart creation rate     | > 30%  | Charts created / total queries  |

### Technical Performance Metrics

| Metric                | Target      | Measurement          |
| --------------------- | ----------- | -------------------- |
| Template mode latency | < 1s (p95)  | API response time    |
| Direct mode latency   | < 5s (p95)  | API response time    |
| Funnel mode latency   | < 15s (p95) | Total execution time |
| Save insight time     | < 2s        | Database insert time |

---

## Migration Checklist

### From Current System

**Update routes:**

- [x] Keep `/insights/[id]` (view saved insight)
- [x] Remove `/insights/new` (replaced by `/insights`)
- [x] Keep `/funnel-test` for testing

**Reuse components:**

- [x] ChartConfigurationDialog
- [x] ResultsDisplay
- [x] Template editor

**Update database:**

- [x] Add customerId to SavedInsights
- [x] Add 'semantic' scope option

---

---

# Post-MVP Enhancements (Weeks 18-20)

These features transform the semantic layer from a single-query tool into a conversational intelligence platform.

**What Post-MVP Enhancements Add:**

- 💬 ChatGPT-style conversation threading with context carryover
- 🪄 Smart template wizard that auto-detects placeholders
- 🎯 Context-aware follow-up question suggestions
- 📊 Dashboard integration for saving insights

**Prerequisites:**

- ✅ Phase 7A-7D complete (unified UI, three-mode orchestrator, chart integration)
- ✅ SavedInsights schema enhanced with customerId and semanticContext
- ✅ ChartConfigurationDialog integrated
- ✅ Template management working

**Design Philosophy:**

- Build on Phase 7's "results-as-hub" model
- Add conversational depth without complexity overhead
- Enable power users without overwhelming casual users
- Maintain sub-5s response times for most interactions

---

## Phase 7E: Conversation Threading (Week 18)

**Goal:** Enable ChatGPT-style conversation with context carryover between questions.

### Database Migration: Conversation Tables (Day 1)

**File:** `database/migration/024_create_conversation_tables.sql`

```sql
-- Migration 024: Create conversation threading tables
-- Purpose: Support ChatGPT-style conversation with context carryover
-- Dependencies: 014_semantic_foundation.sql (Customer), 012_create_users_table.sql (Users)
-- Note: Migration 023 is QueryHistory table (auto-saved queries)

BEGIN;

-- Create conversation threads table
CREATE TABLE IF NOT EXISTS "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "title" TEXT,
  "contextCache" JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation messages table
CREATE TABLE IF NOT EXISTS "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive");

CREATE INDEX IF NOT EXISTS idx_conversation_threads_active
ON "ConversationThreads" ("isActive", "updatedAt") WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
ON "ConversationMessages" ("threadId", "createdAt");

-- Auto-update updatedAt on thread when messages added
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
AFTER INSERT ON "ConversationMessages"
FOR EACH ROW
EXECUTE FUNCTION update_conversation_thread_timestamp();

-- Comments for clarity
COMMENT ON TABLE "ConversationThreads" IS 'Conversation threads for semantic layer Q&A (Phase 7E)';
COMMENT ON TABLE "ConversationMessages" IS 'Individual messages within conversation threads';
COMMENT ON COLUMN "ConversationThreads"."customerId" IS 'Customer UUID (FK to Customer table)';
COMMENT ON COLUMN "ConversationThreads"."userId" IS 'User ID (FK to Users table)';
COMMENT ON COLUMN "ConversationThreads"."contextCache" IS 'Shared entities, date ranges, etc. for context carryover';

COMMIT;
```

**Run migration:**

```bash
npm run migrate
```

**Exit Criteria:**

- [ ] Migration runs successfully
- [ ] ConversationThreads table created
- [ ] ConversationMessages table created
- [ ] Indexes created
- [ ] Trigger updates thread timestamp

---

### Task 1: Conversation Service (Day 2)

**File:** `lib/services/conversation.service.ts`

See Phase 7.5 document lines 266-489 for full implementation.

**Key methods:**

- `createThread(customerId, userId, initialQuestion)` - Create new conversation
- `getActiveThread(customerId, userId)` - Get active thread for user
- `addMessage(threadId, role, content, metadata)` - Add message to thread
- `getThreadMessages(threadId, limit)` - Get thread messages
- `updateContextCache(threadId, context)` - Update context
- `buildContext(threadId, maxMessages)` - Build conversation context

**Exit Criteria:**

- [ ] Service creates threads
- [ ] Messages save to database
- [ ] Context cache updates
- [ ] Thread retrieval works
- [ ] Build context from history

---

### Task 2: Conversation Hook (Day 3)

**File:** `lib/hooks/useConversation.ts`

See Phase 7.5 document lines 502-659 for full implementation.

**Key features:**

- Manages conversation state (messages, threadId)
- Optimistic UI updates
- Thread persistence and resumption
- Error handling

**Exit Criteria:**

- [ ] Hook manages conversation state
- [ ] Optimistic UI updates
- [ ] Error handling works
- [ ] Thread persistence

---

### Task 3: Conversation UI Components (Day 4-5)

**Files:**

- `app/insights/components/ConversationThread.tsx` - Message history display
- `app/insights/components/ConversationMessage.tsx` - Single Q&A pair
- `app/insights/page.tsx` - Enhanced for conversation mode
- `app/api/insights/conversation/route.ts` - API endpoint

See Phase 7.5 document lines 670-1027 for full implementation.

**Exit Criteria:**

- [ ] Conversation thread displays messages
- [ ] User/assistant messages styled differently
- [ ] Auto-scroll to latest message
- [ ] API persists conversation
- [ ] Context passed to orchestrator
- [ ] "New Conversation" button works

---

### Phase 7E Exit Criteria Checklist

- [ ] Database migration creates conversation tables
- [ ] ConversationService creates and manages threads
- [ ] useConversation hook manages state
- [ ] ConversationThread component renders messages
- [ ] Messages persist to database
- [ ] Context carryover works for follow-ups
- [ ] New conversation resets state
- [ ] Mobile responsive

---

## Phase 7F: Smart Template Wizard (Week 19)

**Goal:** Auto-detect placeholders from semantic context and create templates with guided wizard.

### Task 4: Placeholder Detection Service (Day 1-2)

**File:** `lib/services/placeholder-detector.service.ts`

See Phase 7.5 document lines 1057-1345 for full implementation.

**Key features:**

- Detects date ranges from SQL
- Detects entity filters
- Detects metric thresholds
- Detects WHERE clause filters
- Generates template SQL with {{placeholders}}
- Confidence scoring

**Exit Criteria:**

- [ ] Detects date ranges
- [ ] Detects entities
- [ ] Detects metrics
- [ ] Detects filters
- [ ] Generates template SQL
- [ ] Confidence scoring works

---

### Task 5: Template Wizard Component (Day 3-4)

**Files:**

- `app/insights/components/TemplateWizard.tsx` - 3-step wizard dialog
- `app/insights/components/WizardStepDetect.tsx` - Auto-detect placeholders
- `app/insights/components/WizardStepConfigure.tsx` - Configure placeholders
- `app/insights/components/WizardStepPreview.tsx` - Preview & save

See Phase 7.5 document lines 1358-1830 for full implementation.

**Exit Criteria:**

- [ ] Wizard opens from actions
- [ ] Step 1 detects placeholders
- [ ] Step 2 configures placeholders
- [ ] Step 3 previews template
- [ ] Save creates template

---

### Task 6: Update ActionsPanel with Wizard (Day 5)

**File:** `app/insights/components/ActionsPanel.tsx` (Enhanced)

Add "Save as Template" button that opens TemplateWizard.

See Phase 7.5 document lines 1842-1883 for implementation.

**Exit Criteria:**

- [ ] Template wizard button in actions panel
- [ ] Wizard integrates with existing flow
- [ ] Templates saved to database

---

### Phase 7F Exit Criteria Checklist

- [ ] PlaceholderDetector service works
- [ ] Template wizard opens
- [ ] 3-step flow completes
- [ ] Placeholders auto-detected
- [ ] Templates saved with placeholders
- [ ] Integration with existing template system

---

## Phase 7G: Advanced Follow-ups (Week 19)

**Goal:** Generate context-aware follow-up question suggestions based on current results.

### Task 7: Follow-up Generator Service (Day 1)

**File:** `lib/services/follow-up-generator.service.ts`

See Phase 7.5 document lines 1907-2083 for full implementation.

**Key features:**

- Drill-down suggestions (aggregate → details)
- Comparison suggestions (time-based, entity-based)
- Trend suggestions (over time)
- Related entity suggestions

**Exit Criteria:**

- [ ] Generates drill-down suggestions
- [ ] Generates comparison suggestions
- [ ] Generates trend suggestions
- [ ] Generates related entity suggestions
- [ ] Confidence scoring works

---

### Task 8: Follow-up Suggestions Component (Day 2)

**Files:**

- `app/insights/components/FollowUpSuggestions.tsx` - Display suggestions
- `app/api/insights/follow-ups/route.ts` - Generate suggestions API

See Phase 7.5 document lines 2095-2263 for full implementation.

**Exit Criteria:**

- [ ] Suggestions generate from results
- [ ] Intent icons display
- [ ] Click fills question input
- [ ] API integrates with generator service

---

### Phase 7G Exit Criteria Checklist

- [ ] Follow-up generator service works
- [ ] Suggestions display after results
- [ ] Intent-based categorization
- [ ] Click triggers new question
- [ ] Context-aware suggestions

---

## Phase 7H: Dashboard Integration (Week 20)

**Goal:** Enable saving insights directly to dashboards (if dashboard builder exists).

**Note:** This phase is conditional on existence of dashboard builder. If no dashboard builder exists, defer this phase.

### Task 9: Dashboard Save Dialog (Day 1-2)

**File:** `app/insights/components/DashboardSaveDialog.tsx`

See Phase 7.5 document lines 2289-2462 for full implementation.

**Key features:**

- Fetches available dashboards
- Saves insight as dashboard widget
- Includes chart configuration
- Error handling

**Exit Criteria:**

- [ ] Fetches available dashboards
- [ ] Saves widget to dashboard
- [ ] Includes chart config
- [ ] Error handling works

---

### Task 10: Update ActionsPanel with Dashboard (Day 3)

**File:** `app/insights/components/ActionsPanel.tsx` (Final enhancement)

Add "Add to Dashboard" button that opens DashboardSaveDialog.

See Phase 7.5 document lines 2474-2515 for implementation.

**Exit Criteria:**

- [ ] Dashboard button in actions
- [ ] Dialog integrates smoothly
- [ ] Widget saves to dashboard

---

### Phase 7H Exit Criteria Checklist

- [ ] Dashboard save dialog works
- [ ] Fetches available dashboards
- [ ] Saves insights as dashboard widgets
- [ ] Chart config included
- [ ] Integration with existing dashboard system (if available)

---

## Document History

| Version | Date       | Changes                                          | Author          |
| ------- | ---------- | ------------------------------------------------ | --------------- |
| 1.0     | 2025-10-31 | Initial version                                  | InsightGen Team |
| 2.0     | 2025-10-31 | Updated with existing infrastructure             | InsightGen Team |
| 3.0     | 2025-11-03 | Consolidated with Phase 7.5 (added Phases 7E-7H) | InsightGen Team |

---

**Next Steps:**

- ✅ Phase 7A complete (Unified Entry UI)
- Continue with Phase 7B (Semantic Integration)
- Set up tracking for success metrics
- Plan rollout schedule for Weeks 18-20 enhancements
