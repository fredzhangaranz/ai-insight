# Phase 7: Semantic Layer UI Redesign - Implementation Guide (Core + Chart)

**Version:** 2.0 (Updated with existing infrastructure)
**Last Updated:** 2025-10-31
**Status:** Ready for Implementation
**Timeline:** 8 weeks (Weeks 10-17)

---

## Document Overview

This guide provides step-by-step implementation for Phase 7 (Unified UI & Integration) focusing on **Core functionality + Chart Builder**. Conversation threading and advanced template wizard are deferred to Phase 7.5.

**Key Changes from v1.0:**
- ✅ Reuse existing `ChartConfigurationDialog.tsx`
- ✅ Integrate with existing `/templates` management
- ✅ Enhance existing `SavedInsights` schema
- 🎯 Focus: Core semantic layer + Chart builder
- ⏭️ Defer: Conversation threading, Template wizard (Phase 7.5)

**Design Reference:** `docs/design/semantic_layer/semantic_layer_UI_design.md`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 7A: Unified Entry (Weeks 10-11)](#phase-7a-unified-entry-weeks-10-11)
3. [Phase 7B: Semantic Integration (Weeks 12-13)](#phase-7b-semantic-integration-weeks-12-13)
4. [Phase 7C: Auto-Funnel (Weeks 14-15)](#phase-7c-auto-funnel-weeks-14-15)
5. [Phase 7D: Chart Integration (Weeks 16-17)](#phase-7d-chart-integration-weeks-16-17)
6. [Testing Strategy](#testing-strategy)
7. [Success Metrics](#success-metrics)

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
│       ├── RecentQuestions.tsx     (NEW)
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

**File:** `database/migration/018_add_customer_to_saved_insights.sql`

```sql
-- Add customer_id to SavedInsights for multi-customer support
ALTER TABLE "SavedInsights"
ADD COLUMN "customerId" VARCHAR(50) NULL;

-- Add index for customer filtering
CREATE INDEX IF NOT EXISTS idx_saved_insights_customer
ON "SavedInsights" ("customerId", "isActive");

-- Update scope to support 'semantic' (in addition to 'form', 'schema')
ALTER TABLE "SavedInsights"
DROP CONSTRAINT IF EXISTS "SavedInsights_scope_check";

ALTER TABLE "SavedInsights"
ADD CONSTRAINT "SavedInsights_scope_check"
CHECK (scope IN ('form', 'schema', 'semantic'));

-- Add semantic context for debugging (optional)
ALTER TABLE "SavedInsights"
ADD COLUMN "semanticContext" JSONB NULL;

COMMENT ON COLUMN "SavedInsights"."customerId" IS 'Customer code for multi-tenant support';
COMMENT ON COLUMN "SavedInsights"."semanticContext" IS 'Semantic discovery context for review';
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
        <CustomerSelector
          value={customerId}
          onChange={setCustomerId}
        />

        <QuestionInput
          value={question}
          onChange={setQuestion}
          onSubmit={handleAsk}
          disabled={!customerId || isLoading}
          isLoading={isLoading}
        />

        {customerId && !result && (
          <SuggestedQuestions
            customerId={customerId}
            onSelect={setQuestion}
          />
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
        body: JSON.stringify({ question, customerId })
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
          <SelectValue placeholder={loading ? "Loading..." : "Select a customer..."} />
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
  placeholder = "Ask a question about your data..."
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
import { ChevronDown, ChevronRight, CheckCircle, Loader2, XCircle } from "lucide-react";
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
  collapsed: initialCollapsed = true
}: ThinkingStreamProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const totalTime = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const hasError = steps.some(s => s.status === "error");

  if (steps.length === 0) return null;

  return (
    <div className={cn(
      "rounded-lg border bg-gray-50 p-4",
      hasError && "border-red-200 bg-red-50"
    )}>
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
    error: XCircle
  }[step.status];

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 flex-shrink-0",
          step.status === "running" && "animate-spin",
          step.status === "complete" && "text-green-600",
          step.status === "error" && "text-red-600",
          (step.status === "pending" || step.status === "running") && "text-blue-600"
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

### Task 4: Suggested & Recent Questions (Day 6)

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
  "List patients with >5 assessments in the last month"
];

export function SuggestedQuestions({
  customerId,
  onSelect
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
  onSelect
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

- [ ] Database migration adds customerId to SavedInsights
- [ ] New `/insights` page loads without errors
- [ ] Customer selector fetches and displays
- [ ] Question input works with auto-resize
- [ ] Suggested questions populate
- [ ] Recent questions fetch and display
- [ ] Thinking stream shows steps
- [ ] All styling uses shadcn/ui
- [ ] Mobile responsive
- [ ] No TypeScript errors

---

## Phase 7B: Semantic Integration (Weeks 12-13)

**Goal:** Wire three-mode logic with real semantic layer APIs.

### Task 5: Template Matching Service (Day 1-2)

*[Implementation same as previous version - uses existing template catalog]*

### Task 6: Complexity Detection Service (Day 2)

*[Implementation same as previous version]*

### Task 7: Three-Mode Orchestrator API (Day 3-5)

*[Implementation same as previous version - main orchestrator with template/direct/funnel routing]*

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
  onRefine
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
  MessageSquare
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
  onRefine
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => onRefine("")}
          >
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
    ...results.rows.map(row =>
      results.columns.map(col => JSON.stringify(row[col])).join(",")
    )
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

## Phase 7C: Auto-Funnel (Weeks 14-15)

*[Implementation same as previous version - funnel generator, vertical layout, auto-execution]*

**Additional:** Add per-step save actions

**File Enhancement:** `app/insights/components/FunnelStepCard.tsx`

```typescript
// In FunnelStepCard.tsx, add mini-actions per step:

{expanded && (
  <div className="step-details">
    {/* ... existing thinking/SQL display ... */}

    <div className="flex gap-2 mt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => saveStepAsInsight(step)}
      >
        <Save className="mr-2 h-4 w-4" />
        Save this step
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => editStep(step)}
      >
        <Edit className="mr-2 h-4 w-4" />
        Edit question
      </Button>
    </div>
  </div>
)}
```

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
  chartConfig
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
        variant: "destructive"
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
          tags: tags.split(",").map(t => t.trim()).filter(Boolean),
          semanticContext: includeContext ? result.context : null,
          results: result.results.rows.slice(0, 100) // Save first 100 rows
        })
      });

      if (!response.ok) {
        throw new Error("Failed to save insight");
      }

      const data = await response.json();

      toast({
        title: "Insight saved",
        description: `"${name}" has been saved successfully`
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
        variant: "destructive"
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
    customerId,
    sql,
    chartType,
    chartMapping,
    scope,
    tags,
    semanticContext
  } = await req.json();

  try {
    const result = await db.query(
      `
      INSERT INTO "SavedInsights" (
        name,
        question,
        scope,
        "customerId",
        sql,
        "chartType",
        "chartMapping",
        description,
        tags,
        "semanticContext",
        "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `,
      [
        name,
        question,
        scope || "semantic",
        customerId,
        sql,
        chartType,
        JSON.stringify(chartMapping),
        description,
        JSON.stringify(tags || []),
        semanticContext ? JSON.stringify(semanticContext) : null,
        session.user.email
      ]
    );

    return NextResponse.json({
      id: result.rows[0].id,
      message: "Insight saved successfully"
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

export function ActionsPanel({ result, customerId, onRefine }: ActionsPanelProps) {
  const [showChartBuilder, setShowChartBuilder] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [chartConfig, setChartConfig] = useState<any>(null);

  const handleChartSave = (config: { chartType: string; chartMapping: Record<string, string> }) => {
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

export function exportToCSV(results: { rows: any[]; columns: string[] }, filename: string) {
  const csv = [
    results.columns.join(","),
    ...results.rows.map(row =>
      results.columns.map(col => JSON.stringify(row[col] ?? "")).join(",")
    )
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
      intent: result.context?.intent.type
    }
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

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first insight | < 10s | From question submit to results |
| User satisfaction (NPS) | > 8.0 | Post-interaction survey |
| Question success rate | > 85% | Valid results / total queries |
| Template match rate | > 60% | Queries using templates |
| Chart creation rate | > 30% | Charts created / total queries |

### Technical Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template mode latency | < 1s (p95) | API response time |
| Direct mode latency | < 5s (p95) | API response time |
| Funnel mode latency | < 15s (p95) | Total execution time |
| Save insight time | < 2s | Database insert time |

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

## Phase 7.5 Deferred Features

The following features are deferred to Phase 7.5 (documented separately):

1. **Conversation Threading** - ChatGPT-style Q&A history with context
2. **Smart Template Wizard** - Auto-detect placeholders from semantic context
3. **Advanced Follow-ups** - Context-aware question suggestions
4. **Dashboard Integration** - Direct save to dashboard builder

See: `docs/todos/in-progress/phase-7.5-post_mvp_enhancements.md`

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-31 | Initial version | InsightGen Team |
| 2.0 | 2025-10-31 | Updated with existing infrastructure | InsightGen Team |

---

**Next Steps:**
- Review updated implementation plan with team
- Begin Phase 7A (Weeks 10-11)
- Set up tracking for success metrics
- Prepare Phase 7.5 roadmap
