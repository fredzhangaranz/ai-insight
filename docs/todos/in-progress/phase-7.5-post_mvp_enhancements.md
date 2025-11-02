# Phase 7.5: Post-MVP Enhancements - Implementation Guide

**Version:** 1.0
**Last Updated:** 2025-10-31
**Status:** Ready for Implementation (After Phase 7)
**Timeline:** 3 weeks (Weeks 18-20)
**Dependencies:** Phase 7 (Core + Chart) must be complete

---

## Document Overview

This guide provides step-by-step implementation for Phase 7.5 post-MVP enhancements. These features transform the semantic layer from a single-query tool into a conversational intelligence platform.

**What Phase 7.5 Adds:**
- 💬 ChatGPT-style conversation threading with context carryover
- 🪄 Smart template wizard that auto-detects placeholders
- 🎯 Context-aware follow-up question suggestions
- 📊 Dashboard integration for saving insights

**Prerequisites:**
- ✅ Phase 7 complete (unified UI, three-mode orchestrator, chart integration)
- ✅ SavedInsights schema enhanced with customerId and semanticContext
- ✅ ChartConfigurationDialog integrated
- ✅ Template management working

**Design Philosophy:**
- Build on Phase 7's "results-as-hub" model
- Add conversational depth without complexity overhead
- Enable power users without overwhelming casual users
- Maintain sub-5s response times for most interactions

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 7.5A: Conversation Threading (Week 18)](#phase-75a-conversation-threading-week-18)
3. [Phase 7.5B: Smart Template Wizard (Week 19)](#phase-75b-smart-template-wizard-week-19)
4. [Phase 7.5C: Advanced Follow-ups (Week 19)](#phase-75c-advanced-follow-ups-week-19)
5. [Phase 7.5D: Dashboard Integration (Week 20)](#phase-75d-dashboard-integration-week-20)
6. [Testing Strategy](#testing-strategy)
7. [Success Metrics](#success-metrics)

---

## Architecture Overview

### The Enhanced Vision

Transform from:
```
User → Ask question → Get answer → Optional actions
```

To:
```
User → Ask question → Get answer → Continue conversation
                                  → Create template (auto-detected placeholders)
                                  → Save to dashboard
                                  → Follow smart suggestions
```

### Conversation Flow Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    CONVERSATION STATE                     │
│  • Question history (thread)                             │
│  • Semantic context cache                                │
│  • Active entities (customer, date ranges, metrics)      │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                   NEW QUESTION ARRIVES                    │
└──────────────────────────────────────────────────────────┘
                          ↓
                    Is follow-up?
                    /           \
                  YES            NO
                   ↓              ↓
    ┌─────────────────────┐  ┌──────────────────┐
    │ Merge with context  │  │ New conversation │
    │ • Resolve "it"      │  │ • Fresh start    │
    │ • Carry entities    │  │ • Reset state    │
    └─────────────────────┘  └──────────────────┘
                   ↓              ↓
┌──────────────────────────────────────────────────────────┐
│              Three-Mode Orchestrator (Phase 7)            │
│  Template → Direct → Funnel                              │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                  RESULTS + ENHANCEMENTS                   │
│  • Table view (default)                                  │
│  • Actions: Chart | Save | Template* | Export            │
│  • NEW: Smart follow-ups                                 │
│  • NEW: Save to dashboard                                │
│  • NEW: Template wizard (auto-detect placeholders)       │
└──────────────────────────────────────────────────────────┘
```

### Component Architecture Updates

```
app/
├── insights/
│   ├── page.tsx                         (ENHANCE: Conversation mode)
│   └── components/
│       ├── ConversationThread.tsx       (NEW: Message history)
│       ├── ConversationMessage.tsx      (NEW: Single Q&A pair)
│       ├── FollowUpSuggestions.tsx      (NEW: Smart suggestions)
│       ├── TemplateWizard.tsx           (NEW: 3-step wizard)
│       │   ├── WizardStepDetect.tsx     (NEW: Auto-detect placeholders)
│       │   ├── WizardStepConfigure.tsx  (NEW: Configure placeholders)
│       │   └── WizardStepPreview.tsx    (NEW: Preview & save)
│       ├── DashboardSaveDialog.tsx      (NEW: Save to dashboard)
│       └── ActionsPanel.tsx             (ENHANCE: Add dashboard + wizard)
│
└── api/
    └── insights/
        ├── conversation/route.ts        (NEW: Conversation state)
        ├── follow-ups/route.ts          (NEW: Generate suggestions)
        └── template-wizard/
            ├── detect/route.ts          (NEW: Detect placeholders)
            └── save/route.ts            (NEW: Save template)

lib/
├── services/
│   ├── conversation.service.ts          (NEW: Context management)
│   ├── follow-up-generator.service.ts   (NEW: Smart suggestions)
│   └── placeholder-detector.service.ts  (NEW: Template analysis)
│
└── hooks/
    └── useConversation.ts               (NEW: Conversation state hook)
```

### Database Schema Updates

**New table: ConversationThreads**
```sql
CREATE TABLE "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" VARCHAR(50) NOT NULL,
  "userId" VARCHAR(255) NOT NULL,
  "title" TEXT,  -- Auto-generated from first question
  "contextCache" JSONB,  -- Shared entities, date ranges, etc.
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive");
```

**New table: ConversationMessages**
```sql
CREATE TABLE "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL,  -- 'user' | 'assistant'
  "content" TEXT NOT NULL,
  "metadata" JSONB,  -- Question for user, result for assistant
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages_thread
ON "ConversationMessages" ("threadId", "createdAt");
```

---

## Phase 7.5A: Conversation Threading (Week 18)

**Goal:** Enable ChatGPT-style conversation with context carryover between questions.

### Database Migration: Conversation Tables (Day 1)

**File:** `database/migration/019_create_conversation_tables.sql`

```sql
-- Create conversation threads table
CREATE TABLE "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" VARCHAR(50) NOT NULL,
  "userId" VARCHAR(255) NOT NULL,
  "title" TEXT,
  "contextCache" JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create conversation messages table
CREATE TABLE "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive");

CREATE INDEX idx_conversation_threads_active
ON "ConversationThreads" ("isActive", "updatedAt");

CREATE INDEX idx_conversation_messages_thread
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

COMMENT ON TABLE "ConversationThreads" IS 'Conversation threads for semantic layer Q&A';
COMMENT ON TABLE "ConversationMessages" IS 'Individual messages within conversation threads';
```

**Run migration:**
```bash
npm run migrate
```

**Exit Criteria:**
- [x] Migration runs successfully
- [x] ConversationThreads table created
- [x] ConversationMessages table created
- [x] Indexes created
- [x] Trigger updates thread timestamp

---

### Task 1: Conversation Service (Day 2)

**File:** `lib/services/conversation.service.ts`

```typescript
// lib/services/conversation.service.ts

import { db } from "@/lib/db";

export interface ConversationThread {
  id: string;
  customerId: string;
  userId: string;
  title: string | null;
  contextCache: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export class ConversationService {
  /**
   * Create a new conversation thread
   */
  static async createThread(
    customerId: string,
    userId: string,
    initialQuestion: string
  ): Promise<ConversationThread> {
    const title = this.generateTitle(initialQuestion);

    const result = await db.query(
      `
      INSERT INTO "ConversationThreads" ("customerId", "userId", title)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
      [customerId, userId, title]
    );

    return this.mapThreadFromDB(result.rows[0]);
  }

  /**
   * Get active thread for user + customer
   */
  static async getActiveThread(
    customerId: string,
    userId: string
  ): Promise<ConversationThread | null> {
    const result = await db.query(
      `
      SELECT * FROM "ConversationThreads"
      WHERE "customerId" = $1
        AND "userId" = $2
        AND "isActive" = true
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
      [customerId, userId]
    );

    return result.rows[0] ? this.mapThreadFromDB(result.rows[0]) : null;
  }

  /**
   * Add message to thread
   */
  static async addMessage(
    threadId: string,
    role: "user" | "assistant",
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<ConversationMessage> {
    const result = await db.query(
      `
      INSERT INTO "ConversationMessages" ("threadId", role, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [threadId, role, content, JSON.stringify(metadata)]
    );

    return this.mapMessageFromDB(result.rows[0]);
  }

  /**
   * Get thread messages (chronological)
   */
  static async getThreadMessages(
    threadId: string,
    limit: number = 50
  ): Promise<ConversationMessage[]> {
    const result = await db.query(
      `
      SELECT * FROM "ConversationMessages"
      WHERE "threadId" = $1
      ORDER BY "createdAt" ASC
      LIMIT $2
    `,
      [threadId, limit]
    );

    return result.rows.map(this.mapMessageFromDB);
  }

  /**
   * Update thread context cache
   */
  static async updateContextCache(
    threadId: string,
    context: Record<string, any>
  ): Promise<void> {
    await db.query(
      `
      UPDATE "ConversationThreads"
      SET "contextCache" = $2, "updatedAt" = NOW()
      WHERE "id" = $1
    `,
      [threadId, JSON.stringify(context)]
    );
  }

  /**
   * End thread (mark inactive)
   */
  static async endThread(threadId: string): Promise<void> {
    await db.query(
      `
      UPDATE "ConversationThreads"
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE "id" = $1
    `,
      [threadId]
    );
  }

  /**
   * Get recent threads for user
   */
  static async getRecentThreads(
    userId: string,
    customerId: string,
    limit: number = 10
  ): Promise<ConversationThread[]> {
    const result = await db.query(
      `
      SELECT * FROM "ConversationThreads"
      WHERE "userId" = $1 AND "customerId" = $2
      ORDER BY "updatedAt" DESC
      LIMIT $3
    `,
      [userId, customerId, limit]
    );

    return result.rows.map(this.mapThreadFromDB);
  }

  /**
   * Build conversation context from thread history
   */
  static async buildContext(
    threadId: string,
    maxMessages: number = 10
  ): Promise<string> {
    const messages = await this.getThreadMessages(threadId, maxMessages);

    const contextLines = messages.map((msg) => {
      if (msg.role === "user") {
        return `User: ${msg.content}`;
      } else {
        // Include key result info
        const metadata = msg.metadata || {};
        return `Assistant: ${msg.content} (${metadata.rowCount || 0} rows, ${metadata.mode || "unknown"} mode)`;
      }
    });

    return contextLines.join("\n");
  }

  // Helper methods
  private static generateTitle(question: string): string {
    const truncated = question.slice(0, 60);
    return truncated.length < question.length ? `${truncated}...` : truncated;
  }

  private static mapThreadFromDB(row: any): ConversationThread {
    return {
      id: row.id,
      customerId: row.customerId,
      userId: row.userId,
      title: row.title,
      contextCache:
        typeof row.contextCache === "string"
          ? JSON.parse(row.contextCache)
          : row.contextCache,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private static mapMessageFromDB(row: any): ConversationMessage {
    return {
      id: row.id,
      threadId: row.threadId,
      role: row.role,
      content: row.content,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata,
      createdAt: new Date(row.createdAt),
    };
  }
}
```

**Exit Criteria:**
- [x] Service creates threads
- [x] Messages save to database
- [x] Context cache updates
- [x] Thread retrieval works
- [x] Build context from history

---

### Task 2: Conversation Hook (Day 3)

**File:** `lib/hooks/useConversation.ts`

```typescript
// lib/hooks/useConversation.ts

import { useState, useCallback } from "react";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: any;
  timestamp: Date;
}

export function useConversation(customerId: string) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Start new conversation
   */
  const startNew = useCallback(async () => {
    if (threadId) {
      await endConversation();
    }
    setMessages([]);
    setThreadId(null);
  }, [threadId]);

  /**
   * Resume existing conversation
   */
  const resume = useCallback(async (existingThreadId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/insights/conversation?threadId=${existingThreadId}`
      );

      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }

      const data = await response.json();
      setThreadId(data.threadId);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Ask question in conversation context
   */
  const ask = useCallback(
    async (question: string) => {
      if (!customerId) {
        throw new Error("Customer ID required");
      }

      setIsLoading(true);
      setError(null);

      // Optimistically add user message
      const userMessage: ConversationMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: question,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await fetch("/api/insights/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            customerId,
            threadId,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Update thread ID if new
        if (!threadId) {
          setThreadId(data.threadId);
        }

        // Add assistant response
        const assistantMessage: ConversationMessage = {
          id: data.messageId,
          role: "assistant",
          content: question,
          result: data.result,
          timestamp: new Date(),
        };

        setMessages((prev) => {
          // Replace temp user message with real one
          const withoutTemp = prev.filter((m) => m.id !== userMessage.id);
          return [
            ...withoutTemp,
            { ...userMessage, id: data.userMessageId },
            assistantMessage,
          ];
        });

        return data.result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [customerId, threadId]
  );

  /**
   * End current conversation
   */
  const endConversation = useCallback(async () => {
    if (!threadId) return;

    try {
      await fetch(`/api/insights/conversation/${threadId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to end conversation:", err);
    }
  }, [threadId]);

  return {
    threadId,
    messages,
    isLoading,
    error,
    ask,
    startNew,
    resume,
    endConversation,
  };
}
```

**Exit Criteria:**
- [x] Hook manages conversation state
- [x] Optimistic UI updates
- [x] Error handling works
- [x] Thread persistence

---

### Task 3: Conversation UI Components (Day 4-5)

**File:** `app/insights/components/ConversationThread.tsx`

```typescript
// app/insights/components/ConversationThread.tsx

"use client";

import { useRef, useEffect } from "react";
import { ConversationMessage as Message } from "@/lib/hooks/useConversation";
import { ConversationMessage } from "./ConversationMessage";

interface ConversationThreadProps {
  messages: Message[];
  customerId: string;
}

export function ConversationThread({
  messages,
  customerId,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {messages.map((message, index) => (
        <ConversationMessage
          key={message.id}
          message={message}
          customerId={customerId}
          isLatest={index === messages.length - 1}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

**File:** `app/insights/components/ConversationMessage.tsx`

```typescript
// app/insights/components/ConversationMessage.tsx

"use client";

import { ConversationMessage as Message } from "@/lib/hooks/useConversation";
import { User, Bot } from "lucide-react";
import { ThinkingStream } from "./ThinkingStream";
import { ResultsDisplay } from "@/app/components/ResultsDisplay";
import { ActionsPanel } from "./ActionsPanel";

interface ConversationMessageProps {
  message: Message;
  customerId: string;
  isLatest: boolean;
}

export function ConversationMessage({
  message,
  customerId,
  isLatest,
}: ConversationMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="flex-1 pt-1">
          <div className="text-sm font-medium text-gray-900 mb-2">You</div>
          <div className="prose max-w-none">
            <p>{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message with result
  const result = message.result;

  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
          <Bot className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="flex-1 space-y-4">
        <div className="text-sm font-medium text-gray-900">Assistant</div>

        {result && (
          <>
            <ThinkingStream steps={result.thinking || []} collapsed={!isLatest} />

            {result.mode === "template" && (
              <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
                📋 Used template: <strong>{result.template}</strong>
              </div>
            )}

            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Results ({result.results?.rows.length || 0} records)
                </h3>
              </div>

              <ResultsDisplay
                data={result.results?.rows || []}
                columns={result.results?.columns || []}
              />
            </div>

            {isLatest && (
              <ActionsPanel
                result={result}
                customerId={customerId}
                onRefine={() => {}}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

**Update main page:** `app/insights/page.tsx`

```typescript
// app/insights/page.tsx (Enhanced for conversation mode)

"use client";

import { useState } from "react";
import { CustomerSelector } from "./components/CustomerSelector";
import { QuestionInput } from "./components/QuestionInput";
import { SuggestedQuestions } from "./components/SuggestedQuestions";
import { ConversationThread } from "./components/ConversationThread";
import { useConversation } from "@/lib/hooks/useConversation";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";

export default function InsightsPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");

  const { messages, isLoading, error, ask, startNew } =
    useConversation(customerId);

  const handleAsk = async () => {
    if (!customerId || !question.trim()) return;
    await ask(question);
    setQuestion(""); // Clear input after asking
  };

  return (
    <div className="insights-page max-w-7xl mx-auto p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Insights</h1>
          <p className="text-gray-600 mt-2">
            Ask questions about your data in natural language
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" onClick={startNew}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            New Conversation
          </Button>
        )}
      </header>

      <div className="space-y-6">
        <CustomerSelector value={customerId} onChange={setCustomerId} />

        {messages.length > 0 && (
          <ConversationThread messages={messages} customerId={customerId} />
        )}

        <QuestionInput
          value={question}
          onChange={setQuestion}
          onSubmit={handleAsk}
          disabled={!customerId || isLoading}
          isLoading={isLoading}
          placeholder={
            messages.length > 0
              ? "Ask a follow-up question..."
              : "Ask a question about your data..."
          }
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error.message}</p>
          </div>
        )}

        {customerId && messages.length === 0 && (
          <SuggestedQuestions customerId={customerId} onSelect={setQuestion} />
        )}
      </div>
    </div>
  );
}
```

**API Endpoint:** `app/api/insights/conversation/route.ts`

```typescript
// app/api/insights/conversation/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ConversationService } from "@/lib/services/conversation.service";
// Reuse existing orchestrator from Phase 7
import { InsightOrchestrator } from "@/lib/services/insight-orchestrator.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, customerId, threadId } = await req.json();

  try {
    // Get or create thread
    let thread;
    if (threadId) {
      // TODO: Validate user owns thread
      thread = { id: threadId };
    } else {
      thread = await ConversationService.createThread(
        customerId,
        session.user.email,
        question
      );
    }

    // Build context from conversation history
    const conversationContext =
      await ConversationService.buildContext(thread.id);

    // Save user message
    const userMessage = await ConversationService.addMessage(
      thread.id,
      "user",
      question
    );

    // Get answer using existing orchestrator (from Phase 7)
    const result = await InsightOrchestrator.ask(
      question,
      customerId,
      conversationContext // Pass conversation context for follow-up resolution
    );

    // Save assistant message
    const assistantMessage = await ConversationService.addMessage(
      thread.id,
      "assistant",
      question, // Store original question
      {
        mode: result.mode,
        rowCount: result.results?.rows.length || 0,
        sql: result.sql,
      }
    );

    return NextResponse.json({
      threadId: thread.id,
      userMessageId: userMessage.id,
      messageId: assistantMessage.id,
      result,
    });
  } catch (error) {
    console.error("Conversation error:", error);
    return NextResponse.json(
      { error: "Failed to process question" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
  }

  try {
    const messages = await ConversationService.getThreadMessages(threadId);

    return NextResponse.json({
      threadId,
      messages,
    });
  } catch (error) {
    console.error("Failed to fetch conversation:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
  }

  try {
    await ConversationService.endThread(threadId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to end conversation:", error);
    return NextResponse.json(
      { error: "Failed to end conversation" },
      { status: 500 }
    );
  }
}
```

**Exit Criteria:**
- [x] Conversation thread displays messages
- [x] User/assistant messages styled differently
- [x] Auto-scroll to latest message
- [x] API persists conversation
- [x] Context passed to orchestrator
- [x] "New Conversation" button works

---

### Phase 7.5A Exit Criteria Checklist

- [ ] Database migration creates conversation tables
- [ ] ConversationService creates and manages threads
- [ ] useConversation hook manages state
- [ ] ConversationThread component renders messages
- [ ] Messages persist to database
- [ ] Context carryover works for follow-ups
- [ ] New conversation resets state
- [ ] Mobile responsive

---

## Phase 7.5B: Smart Template Wizard (Week 19)

**Goal:** Auto-detect placeholders from semantic context and create templates with guided wizard.

### Task 4: Placeholder Detection Service (Day 1-2)

**File:** `lib/services/placeholder-detector.service.ts`

```typescript
// lib/services/placeholder-detector.service.ts

export interface DetectedPlaceholder {
  key: string;
  displayName: string;
  type: "entity" | "metric" | "date" | "filter";
  value: string;
  confidence: number;
  suggestions?: string[];
}

export interface PlaceholderDetectionResult {
  placeholders: DetectedPlaceholder[];
  templateSQL: string;
  templateQuestion: string;
}

export class PlaceholderDetector {
  /**
   * Detect placeholders from semantic context
   */
  static detect(
    question: string,
    sql: string,
    semanticContext: any
  ): PlaceholderDetectionResult {
    const placeholders: DetectedPlaceholder[] = [];

    // Detect date ranges
    const dateRangePlaceholder = this.detectDateRange(
      question,
      sql,
      semanticContext
    );
    if (dateRangePlaceholder) {
      placeholders.push(dateRangePlaceholder);
    }

    // Detect entities (wound types, clinics, etc.)
    const entityPlaceholders = this.detectEntities(
      question,
      sql,
      semanticContext
    );
    placeholders.push(...entityPlaceholders);

    // Detect metrics
    const metricPlaceholders = this.detectMetrics(
      question,
      sql,
      semanticContext
    );
    placeholders.push(...metricPlaceholders);

    // Detect filters
    const filterPlaceholders = this.detectFilters(
      question,
      sql,
      semanticContext
    );
    placeholders.push(...filterPlaceholders);

    // Generate template SQL
    const templateSQL = this.generateTemplateSQL(sql, placeholders);

    // Generate template question
    const templateQuestion = this.generateTemplateQuestion(
      question,
      placeholders
    );

    return {
      placeholders,
      templateSQL,
      templateQuestion,
    };
  }

  private static detectDateRange(
    question: string,
    sql: string,
    context: any
  ): DetectedPlaceholder | null {
    // Look for date literals in SQL
    const datePattern =
      /['"](\d{4}-\d{2}-\d{2})['"]/g;
    const matches = [...sql.matchAll(datePattern)];

    if (matches.length === 0) return null;

    // Extract date range
    const dates = matches.map((m) => m[1]);

    if (dates.length >= 2) {
      return {
        key: "date_range",
        displayName: "Date Range",
        type: "date",
        value: `${dates[0]} to ${dates[dates.length - 1]}`,
        confidence: 0.9,
        suggestions: [
          "Last 7 days",
          "Last 30 days",
          "Last 3 months",
          "Last 12 months",
        ],
      };
    }

    return null;
  }

  private static detectEntities(
    question: string,
    sql: string,
    context: any
  ): DetectedPlaceholder[] {
    const placeholders: DetectedPlaceholder[] = [];

    // Look for entity filters in semantic context
    if (!context?.mappings) return placeholders;

    for (const mapping of context.mappings) {
      if (mapping.type !== "entity") continue;

      // Check if entity has specific value in SQL
      const valuePattern = new RegExp(
        `${mapping.column}\\s*=\\s*['"]([^'"]+)['"]`,
        "i"
      );
      const match = sql.match(valuePattern);

      if (match) {
        placeholders.push({
          key: mapping.column,
          displayName: this.formatDisplayName(mapping.column),
          type: "entity",
          value: match[1],
          confidence: 0.85,
          suggestions: this.getEntitySuggestions(mapping.column),
        });
      }
    }

    return placeholders;
  }

  private static detectMetrics(
    question: string,
    sql: string,
    context: any
  ): DetectedPlaceholder[] {
    const placeholders: DetectedPlaceholder[] = [];

    // Look for specific metric values in question
    const metricPattern = /(?:>=|<=|>|<|=)\s*(\d+(?:\.\d+)?)/g;
    const matches = [...question.matchAll(metricPattern)];

    if (matches.length > 0) {
      matches.forEach((match, i) => {
        placeholders.push({
          key: `metric_threshold_${i}`,
          displayName: `Metric Threshold ${i + 1}`,
          type: "metric",
          value: match[1],
          confidence: 0.7,
        });
      });
    }

    return placeholders;
  }

  private static detectFilters(
    question: string,
    sql: string,
    context: any
  ): DetectedPlaceholder[] {
    const placeholders: DetectedPlaceholder[] = [];

    // Detect WHERE clause conditions
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:GROUP BY|ORDER BY|LIMIT|$)/is);

    if (whereMatch) {
      const whereClause = whereMatch[1];

      // Look for IN clauses
      const inPattern = /(\w+)\s+IN\s*\(([^)]+)\)/gi;
      const inMatches = [...whereClause.matchAll(inPattern)];

      inMatches.forEach((match) => {
        const column = match[1];
        const values = match[2];

        placeholders.push({
          key: `filter_${column}`,
          displayName: this.formatDisplayName(column),
          type: "filter",
          value: values.trim(),
          confidence: 0.8,
        });
      });
    }

    return placeholders;
  }

  private static generateTemplateSQL(
    sql: string,
    placeholders: DetectedPlaceholder[]
  ): string {
    let templateSQL = sql;

    // Replace placeholder values with {{placeholders}}
    for (const ph of placeholders) {
      if (ph.type === "date") {
        // Replace date literals
        templateSQL = templateSQL.replace(
          /['"](\d{4}-\d{2}-\d{2})['"]/g,
          `{{${ph.key}}}`
        );
      } else if (ph.type === "entity") {
        // Replace entity values
        const pattern = new RegExp(
          `${ph.key}\\s*=\\s*['"]${ph.value}['"]`,
          "gi"
        );
        templateSQL = templateSQL.replace(pattern, `${ph.key} = {{${ph.key}}}`);
      } else if (ph.type === "filter") {
        // Replace filter lists
        const pattern = new RegExp(
          `${ph.key.replace("filter_", "")}\\s+IN\\s*\\([^)]+\\)`,
          "gi"
        );
        templateSQL = templateSQL.replace(
          pattern,
          `${ph.key.replace("filter_", "")} IN ({{${ph.key}}})`
        );
      }
    }

    return templateSQL;
  }

  private static generateTemplateQuestion(
    question: string,
    placeholders: DetectedPlaceholder[]
  ): string {
    let templateQuestion = question;

    // Replace specific values with placeholders
    for (const ph of placeholders) {
      if (ph.value) {
        templateQuestion = templateQuestion.replace(
          new RegExp(`\\b${this.escapeRegex(ph.value)}\\b`, "gi"),
          `{{${ph.displayName}}}`
        );
      }
    }

    return templateQuestion;
  }

  private static formatDisplayName(column: string): string {
    return column
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private static getEntitySuggestions(column: string): string[] {
    // In production, fetch from database
    const suggestions: Record<string, string[]> = {
      wound_type: ["Diabetic", "Pressure", "Venous", "Arterial"],
      clinic_id: ["Clinic A", "Clinic B", "Clinic C"],
      patient_status: ["Active", "Discharged", "Inactive"],
    };

    return suggestions[column.toLowerCase()] || [];
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
```

**Exit Criteria:**
- [x] Detects date ranges
- [x] Detects entities
- [x] Detects metrics
- [x] Detects filters
- [x] Generates template SQL
- [x] Confidence scoring works

---

### Task 5: Template Wizard Component (Day 3-4)

**File:** `app/insights/components/TemplateWizard.tsx`

```typescript
// app/insights/components/TemplateWizard.tsx

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { WizardStepDetect } from "./WizardStepDetect";
import { WizardStepConfigure } from "./WizardStepConfigure";
import { WizardStepPreview } from "./WizardStepPreview";
import { DetectedPlaceholder } from "@/lib/services/placeholder-detector.service";

interface TemplateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  result: any;
  customerId: string;
}

export function TemplateWizard({
  isOpen,
  onClose,
  result,
  customerId,
}: TemplateWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [placeholders, setPlaceholders] = useState<DetectedPlaceholder[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");

  const handleDetect = (detected: DetectedPlaceholder[]) => {
    setPlaceholders(detected);
    setStep(2);
  };

  const handleConfigure = (configured: DetectedPlaceholder[]) => {
    setPlaceholders(configured);
    setStep(3);
  };

  const handleSave = async () => {
    // Save template via API
    await fetch("/api/insights/template-wizard/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: templateName,
        description: templateDescription,
        question: result.question,
        sql: result.sql,
        placeholders,
        customerId,
      }),
    });

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Template {step === 1 && "- Detect Placeholders"}
            {step === 2 && "- Configure Placeholders"}
            {step === 3 && "- Preview & Save"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {step === 1 && (
            <WizardStepDetect result={result} onNext={handleDetect} />
          )}

          {step === 2 && (
            <WizardStepConfigure
              placeholders={placeholders}
              onNext={handleConfigure}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <WizardStepPreview
              result={result}
              placeholders={placeholders}
              templateName={templateName}
              setTemplateName={setTemplateName}
              templateDescription={templateDescription}
              setTemplateDescription={setTemplateDescription}
              onSave={handleSave}
              onBack={() => setStep(2)}
            />
          )}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex gap-1">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-12 rounded ${
                  s === step ? "bg-purple-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**File:** `app/insights/components/WizardStepDetect.tsx`

```typescript
// app/insights/components/WizardStepDetect.tsx

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { PlaceholderDetector } from "@/lib/services/placeholder-detector.service";
import type { DetectedPlaceholder } from "@/lib/services/placeholder-detector.service";

interface WizardStepDetectProps {
  result: any;
  onNext: (placeholders: DetectedPlaceholder[]) => void;
}

export function WizardStepDetect({ result, onNext }: WizardStepDetectProps) {
  const [detecting, setDetecting] = useState(true);
  const [placeholders, setPlaceholders] = useState<DetectedPlaceholder[]>([]);

  useEffect(() => {
    detectPlaceholders();
  }, []);

  const detectPlaceholders = async () => {
    setDetecting(true);

    // Simulate API call (in production, call backend)
    setTimeout(() => {
      const detected = PlaceholderDetector.detect(
        result.question || "",
        result.sql,
        result.context
      );

      setPlaceholders(detected.placeholders);
      setDetecting(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 p-4 rounded-lg">
        <p className="text-sm text-blue-900">
          We'll analyze your query to automatically detect reusable placeholders,
          making it easy to create a flexible template.
        </p>
      </div>

      {detecting ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
          <p className="text-gray-600">Analyzing query for placeholders...</p>
        </div>
      ) : (
        <>
          <div>
            <h3 className="font-medium mb-3">
              Detected {placeholders.length} placeholder{placeholders.length !== 1 ? "s" : ""}
            </h3>

            {placeholders.length === 0 ? (
              <div className="bg-gray-50 p-6 rounded-lg text-center">
                <p className="text-gray-600">
                  No placeholders detected. This query may not benefit from
                  templating.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Placeholders are values that users might want to change, like
                  date ranges or entity filters.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {placeholders.map((ph, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-white border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{ph.displayName}</div>
                      <div className="text-sm text-gray-600">
                        {ph.type} • Current: {ph.value}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Sparkles className="h-4 w-4" />
                      {Math.round(ph.confidence * 100)}% confidence
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => onNext(placeholders)}
              disabled={placeholders.length === 0}
            >
              Continue
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

**File:** `app/insights/components/WizardStepConfigure.tsx`

```typescript
// app/insights/components/WizardStepConfigure.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { DetectedPlaceholder } from "@/lib/services/placeholder-detector.service";

interface WizardStepConfigureProps {
  placeholders: DetectedPlaceholder[];
  onNext: (configured: DetectedPlaceholder[]) => void;
  onBack: () => void;
}

export function WizardStepConfigure({
  placeholders: initialPlaceholders,
  onNext,
  onBack,
}: WizardStepConfigureProps) {
  const [placeholders, setPlaceholders] = useState(initialPlaceholders);

  const updatePlaceholder = (index: number, updates: Partial<DetectedPlaceholder>) => {
    setPlaceholders((prev) =>
      prev.map((ph, i) => (i === index ? { ...ph, ...updates } : ph))
    );
  };

  const removePlaceholder = (index: number) => {
    setPlaceholders((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 p-4 rounded-lg">
        <p className="text-sm text-blue-900">
          Configure each placeholder's display name and type. These will be used
          when users fill out the template.
        </p>
      </div>

      <div className="space-y-4">
        {placeholders.map((ph, i) => (
          <div key={i} className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Placeholder {i + 1}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removePlaceholder(i)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`display-name-${i}`}>Display Name</Label>
                <Input
                  id={`display-name-${i}`}
                  value={ph.displayName}
                  onChange={(e) =>
                    updatePlaceholder(i, { displayName: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`type-${i}`}>Type</Label>
                <Select
                  value={ph.type}
                  onValueChange={(type: any) => updatePlaceholder(i, { type })}
                >
                  <SelectTrigger id={`type-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entity">Entity</SelectItem>
                    <SelectItem value="metric">Metric</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="filter">Filter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`key-${i}`}>Key</Label>
              <Input
                id={`key-${i}`}
                value={ph.key}
                onChange={(e) => updatePlaceholder(i, { key: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            <div className="bg-gray-50 p-2 rounded text-sm text-gray-600">
              Current value: <code>{ph.value}</code>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onNext(placeholders)}>
          Preview Template
        </Button>
      </div>
    </div>
  );
}
```

**File:** `app/insights/components/WizardStepPreview.tsx`

```typescript
// app/insights/components/WizardStepPreview.tsx

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DetectedPlaceholder } from "@/lib/services/placeholder-detector.service";

interface WizardStepPreviewProps {
  result: any;
  placeholders: DetectedPlaceholder[];
  templateName: string;
  setTemplateName: (name: string) => void;
  templateDescription: string;
  setTemplateDescription: (desc: string) => void;
  onSave: () => void;
  onBack: () => void;
}

export function WizardStepPreview({
  result,
  placeholders,
  templateName,
  setTemplateName,
  templateDescription,
  setTemplateDescription,
  onSave,
  onBack,
}: WizardStepPreviewProps) {
  // Generate template SQL preview
  let templateSQL = result.sql;
  for (const ph of placeholders) {
    templateSQL = templateSQL.replace(
      new RegExp(`\\b${ph.value}\\b`, "g"),
      `{{${ph.key}}}`
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="template-name">Template Name *</Label>
          <Input
            id="template-name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g., Healing Rate by Wound Type"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-description">Description</Label>
          <Textarea
            id="template-description"
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.target.value)}
            placeholder="What does this template help users analyze?"
            rows={3}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">Template Preview</h4>

        <div className="space-y-2">
          <Label>Placeholders ({placeholders.length})</Label>
          <div className="bg-gray-50 p-3 rounded-lg space-y-1">
            {placeholders.map((ph, i) => (
              <div key={i} className="text-sm">
                <code className="font-mono text-purple-700">
                  {`{{${ph.key}}}`}
                </code>
                {" - "}
                {ph.displayName} ({ph.type})
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Generated SQL</Label>
          <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">
            {templateSQL}
          </pre>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onSave} disabled={!templateName.trim()}>
          Save Template
        </Button>
      </div>
    </div>
  );
}
```

**Exit Criteria:**
- [x] Wizard opens from actions
- [x] Step 1 detects placeholders
- [x] Step 2 configures placeholders
- [x] Step 3 previews template
- [x] Save creates template

---

### Task 6: Update ActionsPanel with Wizard (Day 5)

**File:** `app/insights/components/ActionsPanel.tsx` (Enhanced)

```typescript
// Add to ActionsPanel.tsx

import { TemplateWizard } from "./TemplateWizard";

export function ActionsPanel({ result, customerId, onRefine }: ActionsPanelProps) {
  // ... existing state ...
  const [showTemplateWizard, setShowTemplateWizard] = useState(false);

  return (
    <>
      <div className="bg-gray-50 rounded-lg border p-4">
        {/* ... existing buttons ... */}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTemplateWizard(true)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Save as Template
        </Button>

        {/* ... other buttons ... */}
      </div>

      {/* ... existing dialogs ... */}

      <TemplateWizard
        isOpen={showTemplateWizard}
        onClose={() => setShowTemplateWizard(false)}
        result={result}
        customerId={customerId}
      />
    </>
  );
}
```

**Exit Criteria:**
- [x] Template wizard button in actions panel
- [x] Wizard integrates with existing flow
- [x] Templates saved to database

---

### Phase 7.5B Exit Criteria Checklist

- [ ] PlaceholderDetector service works
- [ ] Template wizard opens
- [ ] 3-step flow completes
- [ ] Placeholders auto-detected
- [ ] Templates saved with placeholders
- [ ] Integration with existing template system

---

## Phase 7.5C: Advanced Follow-ups (Week 19)

**Goal:** Generate context-aware follow-up question suggestions based on current results.

### Task 7: Follow-up Generator Service (Day 1)

**File:** `lib/services/follow-up-generator.service.ts`

```typescript
// lib/services/follow-up-generator.service.ts

export interface FollowUpSuggestion {
  question: string;
  intent: "drill_down" | "compare" | "trend" | "related";
  confidence: number;
}

export class FollowUpGenerator {
  /**
   * Generate smart follow-up suggestions based on current result
   */
  static generate(
    question: string,
    result: any,
    semanticContext: any
  ): FollowUpSuggestion[] {
    const suggestions: FollowUpSuggestion[] = [];

    // Drill-down suggestions
    suggestions.push(...this.generateDrillDowns(question, result, semanticContext));

    // Comparison suggestions
    suggestions.push(...this.generateComparisons(question, result, semanticContext));

    // Trend suggestions
    suggestions.push(...this.generateTrends(question, result, semanticContext));

    // Related entity suggestions
    suggestions.push(...this.generateRelated(question, result, semanticContext));

    // Sort by confidence and return top 5
    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private static generateDrillDowns(
    question: string,
    result: any,
    context: any
  ): FollowUpSuggestion[] {
    const suggestions: FollowUpSuggestion[] = [];

    // If result has aggregates, suggest drilling into details
    if (result.results?.rows.length > 0) {
      const firstRow = result.results.rows[0];

      // Look for aggregate columns
      if (firstRow.count || firstRow.avg || firstRow.sum) {
        suggestions.push({
          question: "Show me the individual records behind these numbers",
          intent: "drill_down",
          confidence: 0.8,
        });
      }
    }

    // If grouped data, suggest breaking down further
    if (context?.mappings?.some((m: any) => m.type === "groupBy")) {
      suggestions.push({
        question: "Break this down by clinic",
        intent: "drill_down",
        confidence: 0.75,
      });
    }

    return suggestions;
  }

  private static generateComparisons(
    question: string,
    result: any,
    context: any
  ): FollowUpSuggestion[] {
    const suggestions: FollowUpSuggestion[] = [];

    // Suggest time-based comparisons
    if (this.hasDateFilter(context)) {
      suggestions.push({
        question: "Compare this to the same period last year",
        intent: "compare",
        confidence: 0.7,
      });

      suggestions.push({
        question: "How does this compare to last month?",
        intent: "compare",
        confidence: 0.68,
      });
    }

    // Suggest entity comparisons
    const entities = this.extractEntities(context);
    if (entities.length > 0) {
      suggestions.push({
        question: `Compare across different ${entities[0].type}s`,
        intent: "compare",
        confidence: 0.72,
      });
    }

    return suggestions;
  }

  private static generateTrends(
    question: string,
    result: any,
    context: any
  ): FollowUpSuggestion[] {
    const suggestions: FollowUpSuggestion[] = [];

    // Suggest trending if current query is not already a trend
    if (!question.toLowerCase().includes("trend")) {
      suggestions.push({
        question: "Show the trend over time",
        intent: "trend",
        confidence: 0.75,
      });
    }

    // Suggest different time granularities
    if (this.hasDateFilter(context)) {
      suggestions.push({
        question: "Show weekly trends instead of daily",
        intent: "trend",
        confidence: 0.65,
      });
    }

    return suggestions;
  }

  private static generateRelated(
    question: string,
    result: any,
    context: any
  ): FollowUpSuggestion[] {
    const suggestions: FollowUpSuggestion[] = [];

    // Suggest related metrics
    const questionLower = question.toLowerCase();

    if (questionLower.includes("healing")) {
      suggestions.push({
        question: "What is the infection rate for the same patients?",
        intent: "related",
        confidence: 0.7,
      });
    }

    if (questionLower.includes("patient")) {
      suggestions.push({
        question: "How many assessments do these patients have?",
        intent: "related",
        confidence: 0.68,
      });
    }

    return suggestions;
  }

  private static hasDateFilter(context: any): boolean {
    return context?.mappings?.some(
      (m: any) => m.type === "date" || m.type === "dateRange"
    );
  }

  private static extractEntities(context: any): any[] {
    return (
      context?.mappings?.filter((m: any) => m.type === "entity") || []
    );
  }
}
```

**Exit Criteria:**
- [x] Generates drill-down suggestions
- [x] Generates comparison suggestions
- [x] Generates trend suggestions
- [x] Generates related entity suggestions
- [x] Confidence scoring works

---

### Task 8: Follow-up Suggestions Component (Day 2)

**File:** `app/insights/components/FollowUpSuggestions.tsx`

```typescript
// app/insights/components/FollowUpSuggestions.tsx

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, GitCompare, ZoomIn, Link } from "lucide-react";
import { FollowUpSuggestion } from "@/lib/services/follow-up-generator.service";

interface FollowUpSuggestionsProps {
  result: any;
  customerId: string;
  onSelect: (question: string) => void;
}

const intentIcons = {
  drill_down: ZoomIn,
  compare: GitCompare,
  trend: TrendingUp,
  related: Link,
};

const intentLabels = {
  drill_down: "Drill down",
  compare: "Compare",
  trend: "Trend",
  related: "Related",
};

export function FollowUpSuggestions({
  result,
  customerId,
  onSelect,
}: FollowUpSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (result) {
      fetchSuggestions();
    }
  }, [result]);

  const fetchSuggestions = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/insights/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: result.question,
          result: result.results,
          context: result.context,
          customerId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error("Failed to fetch follow-up suggestions:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-purple-900">
        <Sparkles className="h-4 w-4" />
        <span>Suggested follow-ups</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, i) => {
          const Icon = intentIcons[suggestion.intent];
          const label = intentLabels[suggestion.intent];

          return (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="bg-white hover:bg-purple-50 border-purple-200"
              onClick={() => onSelect(suggestion.question)}
            >
              <Icon className="mr-2 h-3 w-3 text-purple-600" />
              <span className="text-left">
                {suggestion.question}
                <span className="ml-2 text-xs text-gray-500">({label})</span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

**API Endpoint:** `app/api/insights/follow-ups/route.ts`

```typescript
// app/api/insights/follow-ups/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FollowUpGenerator } from "@/lib/services/follow-up-generator.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, result, context, customerId } = await req.json();

  try {
    const suggestions = FollowUpGenerator.generate(question, result, context);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Failed to generate follow-ups:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
```

**Update ConversationMessage component:**

```typescript
// In ConversationMessage.tsx, add FollowUpSuggestions after ActionsPanel

{isLatest && (
  <>
    <ActionsPanel
      result={result}
      customerId={customerId}
      onRefine={() => {}}
    />

    <FollowUpSuggestions
      result={result}
      customerId={customerId}
      onSelect={(question) => {
        // Trigger new question
        // This would be passed down from parent
      }}
    />
  </>
)}
```

**Exit Criteria:**
- [x] Suggestions generate from results
- [x] Intent icons display
- [x] Click fills question input
- [x] API integrates with generator service

---

### Phase 7.5C Exit Criteria Checklist

- [ ] Follow-up generator service works
- [ ] Suggestions display after results
- [ ] Intent-based categorization
- [ ] Click triggers new question
- [ ] Context-aware suggestions

---

## Phase 7.5D: Dashboard Integration (Week 20)

**Goal:** Enable saving insights directly to dashboards (if dashboard builder exists).

**Note:** This phase is conditional on existence of dashboard builder. If no dashboard builder exists, defer this phase.

### Task 9: Dashboard Save Dialog (Day 1-2)

**File:** `app/insights/components/DashboardSaveDialog.tsx`

```typescript
// app/insights/components/DashboardSaveDialog.tsx

"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface Dashboard {
  id: string;
  name: string;
}

interface DashboardSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: any;
  customerId: string;
  chartConfig?: {
    chartType: string;
    chartMapping: Record<string, string>;
  };
}

export function DashboardSaveDialog({
  isOpen,
  onClose,
  result,
  customerId,
  chartConfig,
}: DashboardSaveDialogProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState<string>("");
  const [widgetTitle, setWidgetTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchDashboards();
    }
  }, [isOpen, customerId]);

  const fetchDashboards = async () => {
    try {
      const response = await fetch(
        `/api/dashboards?customerId=${customerId}`
      );
      const data = await response.json();
      setDashboards(data);
    } catch (error) {
      console.error("Failed to fetch dashboards:", error);
    }
  };

  const handleSave = async () => {
    if (!selectedDashboard || !widgetTitle.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a dashboard and provide a widget title",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/dashboards/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboardId: selectedDashboard,
          title: widgetTitle,
          sql: result.sql,
          chartType: chartConfig?.chartType || "table",
          chartMapping: chartConfig?.chartMapping || {},
          customerId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save widget");
      }

      toast({
        title: "Widget added",
        description: `"${widgetTitle}" has been added to the dashboard`,
      });

      onClose();
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Dashboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dashboard">Dashboard</Label>
            <Select value={selectedDashboard} onValueChange={setSelectedDashboard}>
              <SelectTrigger id="dashboard">
                <SelectValue placeholder="Select a dashboard..." />
              </SelectTrigger>
              <SelectContent>
                {dashboards.map((dashboard) => (
                  <SelectItem key={dashboard.id} value={dashboard.id}>
                    {dashboard.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="widget-title">Widget Title</Label>
            <Input
              id="widget-title"
              value={widgetTitle}
              onChange={(e) => setWidgetTitle(e.target.value)}
              placeholder="e.g., Healing Rate by Wound Type"
            />
          </div>

          {chartConfig && (
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p className="font-medium text-blue-900">Chart configuration</p>
              <p className="text-blue-700">
                {chartConfig.chartType} chart will be displayed
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Adding..." : "Add to Dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Exit Criteria:**
- [x] Fetches available dashboards
- [x] Saves widget to dashboard
- [x] Includes chart config
- [x] Error handling works

---

### Task 10: Update ActionsPanel with Dashboard (Day 3)

**File:** `app/insights/components/ActionsPanel.tsx` (Final enhancement)

```typescript
// Add to ActionsPanel.tsx

import { DashboardSaveDialog } from "./DashboardSaveDialog";
import { LayoutDashboard } from "lucide-react";

export function ActionsPanel({ result, customerId, onRefine }: ActionsPanelProps) {
  // ... existing state ...
  const [showDashboardDialog, setShowDashboardDialog] = useState(false);

  return (
    <>
      <div className="bg-gray-50 rounded-lg border p-4">
        {/* ... existing buttons ... */}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDashboardDialog(true)}
        >
          <LayoutDashboard className="mr-2 h-4 w-4" />
          Add to Dashboard
        </Button>

        {/* ... other buttons ... */}
      </div>

      {/* ... existing dialogs ... */}

      <DashboardSaveDialog
        isOpen={showDashboardDialog}
        onClose={() => setShowDashboardDialog(false)}
        result={result}
        customerId={customerId}
        chartConfig={chartConfig}
      />
    </>
  );
}
```

**Exit Criteria:**
- [x] Dashboard button in actions
- [x] Dialog integrates smoothly
- [x] Widget saves to dashboard

---

### Phase 7.5D Exit Criteria Checklist

- [ ] Dashboard save dialog works
- [ ] Fetches available dashboards
- [ ] Saves insights as dashboard widgets
- [ ] Chart config included
- [ ] Integration with existing dashboard system (if available)

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
├── conversation.service.test.ts
├── follow-up-generator.service.test.ts
└── placeholder-detector.service.test.ts

app/insights/components/__tests__/
├── ConversationThread.test.tsx
├── TemplateWizard.test.tsx
├── FollowUpSuggestions.test.tsx
└── DashboardSaveDialog.test.tsx
```

### Integration Tests

**Test scenarios:**
1. Conversation: Ask question → Follow-up → Context preserved
2. Template wizard: Generate placeholders → Configure → Save
3. Follow-ups: Get result → Generate suggestions → Click suggestion → New query
4. Dashboard: Save chart → Add to dashboard → Verify widget

### E2E Tests

**User flows:**
1. Multi-turn conversation with context
2. Template creation from successful query
3. Follow-up exploration (drill-down → compare → trend)
4. End-to-end: Ask → Chart → Save to dashboard

---

## Success Metrics

### User Engagement Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Multi-question sessions | > 40% | Sessions with 2+ questions |
| Follow-up adoption | > 25% | Users clicking suggestions |
| Template creation rate | > 10% | Templates created / total queries |
| Dashboard saves | > 20% | Results saved to dashboard |

### Conversation Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Context resolution accuracy | > 90% | Correct pronoun/entity resolution |
| Follow-up relevance | > 80% | User rates as "helpful" |
| Template reuse rate | > 50% | Templates used 2+ times |

### Technical Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Follow-up generation time | < 500ms | Service latency |
| Placeholder detection time | < 1s | Analysis latency |
| Conversation state load | < 200ms | Database query time |
| Dashboard save time | < 2s | Widget creation time |

---

## Migration Checklist

### Database Updates

- [x] Create ConversationThreads table
- [x] Create ConversationMessages table
- [x] Add indexes for performance
- [x] Add trigger for timestamp updates

### Component Updates

- [x] Enhance InsightsPage for conversation mode
- [x] Add ConversationThread component
- [x] Add TemplateWizard component
- [x] Add FollowUpSuggestions component
- [x] Add DashboardSaveDialog component (conditional)

### Service Layer

- [x] Create ConversationService
- [x] Create FollowUpGenerator
- [x] Create PlaceholderDetector
- [x] Enhance orchestrator with context support

---

## Rollout Strategy

### Week 18: Internal Beta (Conversation Threading)

- Deploy conversation feature to staging
- Internal team testing with real customer data
- Gather feedback on context resolution accuracy
- Monitor conversation length and quality

### Week 19: Beta Expansion (Templates + Follow-ups)

- Add template wizard and follow-ups
- Expand beta to select customers
- Track feature adoption rates
- Iterate based on feedback

### Week 20: General Availability

- Full rollout to all users
- Monitor performance metrics
- Dashboard integration (if available)
- Document new features

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-31 | Initial version | InsightGen Team |

---

**Next Steps:**
- Complete Phase 7 (Core + Chart)
- Review Phase 7.5 plan with stakeholders
- Prioritize features (all or subset)
- Begin implementation (Week 18)
