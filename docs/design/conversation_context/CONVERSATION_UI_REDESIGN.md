# Conversation-First UI Redesign

**Version:** 1.0  
**Last Updated:** 2026-01-14  
**Status:** Design Complete, Ready for Implementation  
**Document Owner:** InsightGen Team  
**Related Documents:**
- `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md` - Clarification system
- `docs/design/semantic_layer/semantic_layer_UI_design.md` - Base UI architecture
- `ARCHITECTURE_V2_SUMMARY.md` - System architecture

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Design Philosophy](#design-philosophy)
4. [User Experience Flow](#user-experience-flow)
5. [Visual Design Mockups](#visual-design-mockups)
6. [Component Architecture](#component-architecture)
7. [Data Models](#data-models)
8. [API Design](#api-design)
9. [Database Schema](#database-schema)
10. [State Management](#state-management)
11. [Smart Suggestions System](#smart-suggestions-system)
12. [Migration Strategy](#migration-strategy)
13. [Implementation Plan](#implementation-plan)
14. [Success Metrics](#success-metrics)

---

## Executive Summary

### The Vision

Transform the InsightGen "Ask Question" page from a **single-shot query interface** into a **ChatGPT-style conversation system** where users can naturally ask follow-up questions, refine results, and build on previous answers—all within a continuous conversational context.

### Current vs. Proposed

**Current System:**
```
User asks → Gets result → Must craft entirely new question
• No context carryover
• "Refine" and "Follow-up" buttons overlap
• Each query is isolated
• Users repeat context in every question
```

**Proposed System:**
```
User asks → Gets result → Types next question naturally
• Context automatically maintained
• Smart suggestions for common follow-ups
• Chat-like interface everyone understands
• Conversation history preserved
```

### Key Benefits

| Benefit | Impact |
|---------|--------|
| **Reduced cognitive load** | Users don't think about "refine vs follow-up" |
| **Faster workflows** | One-click suggestions + freeform input |
| **Natural interaction** | Matches ChatGPT mental model (familiar to all) |
| **Context retention** | AI understands "Which ones?" and "Show me the trend" |
| **Better discoverability** | Smart suggestions teach users what's possible |

---

## Problem Statement

### 1. **Button Confusion**

Current UI has overlapping actions:

```typescript
[Refine this query] ← Modifies current SQL
[Ask Follow-up] ← (Not implemented) Would ask new question in context

// Both essentially do the same thing!
// Users don't know which to use
```

**Problem:** Two buttons trying to solve the same need—continuing the conversation.

### 2. **No Context Carryover**

```
User: "Show me patients with infected wounds"
AI: [Shows 42 patients]

User: "Which ones are improving?"
AI: ❌ "I don't know what 'ones' you're referring to"

// User must rephrase:
User: "Show me patients with infected wounds who are improving"
```

**Problem:** Users must repeat context in every question.

### 3. **Mental Model Mismatch**

Users expect **ChatGPT-style conversation**:
- Type question → Get answer → Type follow-up → Get answer
- Edit previous questions
- See history
- Context automatically carried forward

But get **form-based query tool**:
- Fill form → Submit → Get result → Clear form → Start over

### 4. **Hidden Capabilities**

The current "Refine" panel has great quick-action chips:
```typescript
["Include inactive records"]
["Change to last 6 months"]
["Add more columns"]
```

But they're **hidden behind a button**. Most users never discover them.

---

## Design Philosophy

### 1. **Conversation as Primary Paradigm**

Every interaction is a **message in an ongoing conversation**, not a separate query.

```
✅ Good: "Show me the trend" (assumes context)
❌ Bad: "Show me the trend of wound healing for patients with infected wounds in the ABC Clinic over the last 6 months" (no context)
```

### 2. **Input Box is Always Visible**

The main question input is **always at the bottom**, always accessible. No hiding, no collapsing.

**Why:** Users should never wonder "Where do I type my next question?"

### 3. **Suggestions Augment, Don't Replace**

Smart suggestion chips are **shortcuts**, not the only way forward.

```typescript
// Clicking a suggestion fills the input
onClick={() => setQuestion(suggestion.text)}

// User can then:
// 1. Press Enter to send as-is
// 2. Edit the text first
// 3. Clear it and type something else
```

### 4. **Actions are Contextual**

Each AI response has its own action buttons (Save, Chart, Export). Users can save or chart **any result** in the conversation, not just the latest one.

### 5. **Progressive Disclosure**

- **Simple questions** → Direct answer (no suggestions)
- **Complex results** → Show 3-4 smart suggestions
- **Multi-turn conversations** → Show context indicators

### 6. **Edit Any Question**

Like ChatGPT, users can **edit any previous question**. This:
- Re-runs from that point
- Discards subsequent messages
- Creates a new branch in the conversation

---

## User Experience Flow

### Flow 1: Simple Question → Follow-up

```
┌─────────────────────────────────────────┐
│ Step 1: User asks first question        │
└─────────────────────────────────────────┘
User types: "Show me patients with infected wounds"
[Presses Ctrl+Enter]

↓

┌─────────────────────────────────────────┐
│ Step 2: AI responds with results        │
└─────────────────────────────────────────┘
🤖 "Found 42 patients with infected wounds"
[Table showing 42 patients]
[💾 Save] [📊 Chart] [📥 Export]

↓

┌─────────────────────────────────────────┐
│ Step 3: Smart suggestions appear        │
└─────────────────────────────────────────┘
💡 You might want to ask:
[🔬 Which ones are improving?]
[📈 Show healing trends over time]
[🏥 Group by clinic or location]

✨ Or refine:
[Include inactive too] [Last 6 months] [Top 10 only]

↓

┌─────────────────────────────────────────┐
│ Step 4: User clicks suggestion          │
└─────────────────────────────────────────┘
User clicks: [🔬 Which ones are improving?]

Input box fills with: "Which ones are improving?"
User sees it, presses Enter

↓

┌─────────────────────────────────────────┐
│ Step 5: AI understands context          │
└─────────────────────────────────────────┘
🤖 "Found 12 patients showing improvement"
[Table showing 12 patients]
[💾 Save] [📊 Chart] [📥 Export]

Conversation thread now has:
• Message 1: "Show me patients..." → 42 results
• Message 2: "Which ones are improving?" → 12 results
```

### Flow 2: Edit Previous Question

```
┌─────────────────────────────────────────┐
│ Conversation history:                   │
│                                         │
│ 🧑 Show me patients with infected wounds │
│ 🤖 Found 42 patients... [results]       │
│                                         │
│ 🧑 Which ones are improving?             │
│ 🤖 Found 12 patients... [results]       │
└─────────────────────────────────────────┘

↓ User clicks [Edit] on first question

┌─────────────────────────────────────────┐
│ Edit mode activated                     │
└─────────────────────────────────────────┘
🧑 [Text box: "Show me patients with infected wounds"]
   ↓ User changes to:
   "Show me patients with healing wounds"

[Save Edit]

↓

┌─────────────────────────────────────────┐
│ Conversation re-runs from that point    │
└─────────────────────────────────────────┘
🧑 Show me patients with healing wounds ← Edited
🤖 Found 67 patients with healing wounds [results]

(Second question is discarded - user must ask again if needed)
```

### Flow 3: New Conversation

```
User clicks [New Chat] button

↓

┌─────────────────────────────────────────┐
│ System behavior:                        │
└─────────────────────────────────────────┘
1. Current conversation saved to history
2. New conversation thread created
3. Input box cleared
4. Customer/Model selection retained
5. Clean slate - no context carried over

User can now:
• Start fresh topic
• Switch customers and start new analysis
• Access old conversations from [History] dropdown
```

### Flow 4: Suggestion Fills Input (Not Auto-Submit)

```
AI shows results

↓

💡 Suggestions appear:
[🔬 Which ones are improving?]
[📈 Show healing trends]

↓

User clicks: [📈 Show healing trends]

↓

┌─────────────────────────────────────────┐
│ Input box updates (cursor at end)      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Show healing trends                 │
│                              [Send]│
└─────────────────────────────────────┘

User can:
1. Press Enter → Send as-is
2. Edit: "Show healing trends over last 30 days" → Send
3. Clear and type something else entirely
```

---

## Visual Design Mockups

### Mockup 1: Initial State (Empty Conversation)

```
┌────────────────────────────────────────────────────────────────┐
│ ← Insights / Ask Question                         [History] [?]│
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Customer         │  │ AI Model         │  │ [New Chat]   │ │
│  │ ABC Clinic    [▼]│  │ GPT-4         [▼]│  └──────────────┘ │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    💬 Start a Conversation                      │
│                                                                 │
│               Ask questions about your data in                 │
│                    natural language                            │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Ask a question...                                      │   │
│  │                                                        │   │
│  │                                                   [▶] │   │
│  └────────────────────────────────────────────────────────┘   │
│  Press Ctrl+Enter to send                                      │
│                                                                 │
│  💡 Try asking:                                                 │
│  • "How many patients have open wounds?"                       │
│  • "Show me patients with infected pressure ulcers"           │
│  • "What's the average healing time for stage 3 wounds?"      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Mockup 2: After First Question (With Results)

```
┌────────────────────────────────────────────────────────────────┐
│ ← Insights / Ask Question                  [History ▼] [New]  │
├────────────────────────────────────────────────────────────────┤
│  ABC Clinic    [▼]  │  GPT-4    [▼]                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Show me patients with infected wounds                │  │
│  │    [Edit] • 2 min ago                                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🤖 Found 42 patients with infected wounds               │  │
│  │                                                          │  │
│  │    ┌──────────────────────────────────────────────┐    │  │
│  │    │ PatientID │ Name         │ WoundType │ ...  │    │  │
│  │    ├──────────────────────────────────────────────┤    │  │
│  │    │ P-001     │ John Smith   │ Pressure  │ ...  │    │  │
│  │    │ P-002     │ Jane Doe     │ Diabetic  │ ...  │    │  │
│  │    │ P-003     │ Bob Johnson  │ Venous    │ ...  │    │  │
│  │    │ ...       │ ...          │ ...       │ ...  │    │  │
│  │    │                                  (42 total)  │    │  │
│  │    └──────────────────────────────────────────────┘    │  │
│  │                                                          │  │
│  │    ┌──────────────────────────────────────────────┐    │  │
│  │    │ 💾 Save  📊 Chart  📥 Export CSV  ⋯ More    │    │  │
│  │    └──────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  💡 You might want to ask:                                     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ [🔬 Which ones are improving?]                       │     │
│  │ [📈 Show healing trends over time]                   │     │
│  │ [🏥 Group by clinic or location]                     │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  ✨ Or refine the current result:                              │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ [Include inactive too] [Last 6 months] [Top 10 only] │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  Ask your next question...                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                                                        │   │
│  │                                                   [▶] │   │
│  └────────────────────────────────────────────────────────┘   │
│  Press Ctrl+Enter to send                                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Mockup 3: Multi-Turn Conversation

```
┌────────────────────────────────────────────────────────────────┐
│ ← Insights / Conversation with ABC Clinic    [History] [New]  │
├────────────────────────────────────────────────────────────────┤
│  ABC Clinic    [▼]  │  GPT-4    [▼]                           │
├────────────────────────────────────────────────────────────────┤
│                          ↓ Scrollable Area ↓                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Show me patients with infected wounds                │  │
│  │    [Edit] • 5 min ago                                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🤖 Found 42 patients with infected wounds               │  │
│  │    [Table: 42 patients]                                 │  │
│  │    💾 Save  📊 Chart  📥 Export  ⋯ More                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Which ones are improving?                            │  │
│  │    [Edit] • 3 min ago                                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🤖 Found 12 patients showing improvement                │  │
│  │    [Table: 12 patients]                                 │  │
│  │    💾 Save  📊 Chart  📥 Export  ⋯ More                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Show healing rates over the last 30 days             │  │
│  │    [Edit] • 1 min ago                                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🤖 Here are the healing rates for those 12 patients:    │  │
│  │                                                          │  │
│  │    📊 [Line chart showing healing trend]                │  │
│  │    Average: 15% reduction per week                      │  │
│  │                                                          │  │
│  │    💾 Save  📊 Chart  📥 Export  ⋯ More                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  💡 You might want to ask:                                     │
│  [📊 Compare to facility average] [🎯 Show outliers]          │
│  [🏥 Break down by clinic]                                     │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                     ↑ Sticky Bottom Section ↑                  │
│  Ask your next question...                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Compare to facility average                            │   │
│  │                                                   [▶] │   │
│  └────────────────────────────────────────────────────────┘   │
│  Press Ctrl+Enter to send                                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Mockup 4: Edit Mode

```
┌────────────────────────────────────────────────────────────────┐
│  Existing conversation...                                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Show me patients with infected wounds                │  │
│  │    [Edit] • 5 min ago                      ← User clicks│  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│                  ↓ Changes to ↓                                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Edit question:                                       │  │
│  │    ┌────────────────────────────────────────────────┐  │  │
│  │    │ Show me patients with infected wounds          │  │  │
│  │    └────────────────────────────────────────────────┘  │  │
│  │    [Cancel] [Save & Re-run]                            │  │
│  │                                                         │  │
│  │    ⚠️  This will discard all questions after this one   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ❌ This message will be discarded:                            │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Which ones are improving?                            │  │
│  │    (will be removed when you edit above)               │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Mockup 5: Loading State

```
┌────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🧑 Which ones are improving?                            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🤖 Analyzing your question...                           │  │
│  │                                                          │  │
│  │    ⏳ Understanding your question... (1.2s)             │  │
│  │    ✓  Intent: patient_cohort_analysis                   │  │
│  │    ✓  Context: using previous result (42 patients)      │  │
│  │    🔄 Generating SQL...                                  │  │
│  │                                                          │  │
│  │    Using: GPT-4                                         │  │
│  │    Elapsed: 3.4s                                        │  │
│  │                                                          │  │
│  │    [Cancel]                                             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  Ask your next question...                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                                            (disabled)   │   │
│  │                                                   [⏸] │   │
│  └────────────────────────────────────────────────────────┘   │
│  Waiting for current question to complete...                   │
└────────────────────────────────────────────────────────────────┘
```

### Mockup 6: Conversation History Dropdown

```
┌────────────────────────────────────────────────────────────────┐
│ ← Insights / Ask Question         [History ▼] [New Chat]      │
│                                         ↓                       │
│                               ┌──────────────────────────────┐ │
│                               │ Recent Conversations        │ │
│                               ├──────────────────────────────┤ │
│                               │ 🕐 Today                     │ │
│                               │ • Infected wounds analysis   │ │
│                               │   (3 messages, ABC Clinic)   │ │
│                               │                              │ │
│                               │ • Healing rate trends        │ │
│                               │   (5 messages, XYZ Hospital) │ │
│                               │                              │ │
│                               │ 🕐 Yesterday                 │ │
│                               │ • Pressure ulcer cohort      │ │
│                               │   (2 messages, ABC Clinic)   │ │
│                               │                              │ │
│                               │ • Diabetic foot screening    │ │
│                               │   (7 messages, Community)    │ │
│                               │                              │ │
│                               │ ─────────────────────────   │ │
│                               │ [View All History...]        │ │
│                               └──────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Component Hierarchy

```
NewInsightPage (Main Container)
├─ ConversationHeader
│  ├─ CustomerSelector
│  ├─ ModelSelector
│  ├─ ConversationHistoryDropdown
│  └─ NewChatButton
│
├─ ConversationThread (Scrollable)
│  ├─ EmptyState (if no messages)
│  └─ ConversationMessage[] (array of messages)
│     ├─ UserMessage
│     │  ├─ MessageBubble
│     │  └─ EditButton
│     │
│     └─ AssistantMessage
│        ├─ MessageContent (text)
│        ├─ LoadingState (if pending)
│        ├─ ResultsDisplay (if completed)
│        │  ├─ ResultsTable
│        │  ├─ ResultsChart (optional)
│        │  └─ FilterMetricsSummary (optional)
│        │
│        └─ MessageActions
│           ├─ SaveButton
│           ├─ ChartButton
│           ├─ ExportButton
│           └─ MoreActionsMenu
│
├─ SmartSuggestions (after last message)
│  ├─ FollowUpSuggestions
│  │  └─ SuggestionChip[]
│  │
│  └─ RefinementSuggestions
│     └─ RefinementChip[]
│
└─ ConversationInput (Sticky Bottom)
   ├─ QuestionTextarea
   ├─ SendButton
   └─ HelpText
```

### Key Components Details

#### 1. NewInsightPage (Main Container)

```typescript
// app/insights/new/page.tsx

"use client";

import { useState, useEffect, useRef } from "react";
import { useConversation } from "@/lib/hooks/useConversation";
import { ConversationHeader } from "./components/ConversationHeader";
import { ConversationThread } from "./components/ConversationThread";
import { SmartSuggestions } from "./components/SmartSuggestions";
import { ConversationInput } from "./components/ConversationInput";

export default function NewInsightPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    startNewConversation,
    loadConversation,
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

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header: Fixed at top */}
      <ConversationHeader
        customerId={customerId}
        onCustomerChange={setCustomerId}
        modelId={modelId}
        onModelChange={setModelId}
        onNewChat={startNewConversation}
        onLoadHistory={loadConversation}
      />

      {/* Main Content: Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <ConversationThread
            messages={messages}
            onEditMessage={editMessage}
            customerId={customerId}
          />
          
          {/* Smart Suggestions after last message */}
          {!isLoading && messages.length > 0 && (
            <SmartSuggestions
              lastMessage={messages[messages.length - 1]}
              onSuggestionClick={handleSuggestionClick}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input: Sticky at bottom */}
      <div className="border-t bg-white">
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

#### 2. ConversationMessage

```typescript
// app/insights/new/components/ConversationMessage.tsx

"use client";

import { useState } from "react";
import { ConversationMessage as MessageType } from "@/lib/types/conversation";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";

interface ConversationMessageProps {
  message: MessageType;
  customerId: string;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  showActions?: boolean;
}

export function ConversationMessage({
  message,
  customerId,
  onEdit,
  showActions = true,
}: ConversationMessageProps) {
  if (message.role === "user") {
    return (
      <UserMessage
        message={message}
        onEdit={onEdit}
      />
    );
  }

  return (
    <AssistantMessage
      message={message}
      customerId={customerId}
      showActions={showActions}
    />
  );
}
```

#### 3. UserMessage

```typescript
// app/insights/new/components/UserMessage.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";

interface UserMessageProps {
  message: {
    id: string;
    content: string;
    timestamp: Date;
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
              <span>{formatTimestamp(message.timestamp)}</span>
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

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  
  return date.toLocaleDateString();
}
```

#### 4. AssistantMessage

```typescript
// app/insights/new/components/AssistantMessage.tsx

"use client";

import { InsightResult } from "@/lib/hooks/useInsights";
import { ResultsTable } from "./ResultsTable";
import { MessageActions } from "./MessageActions";
import { ThinkingStream } from "./ThinkingStream";

interface AssistantMessageProps {
  message: {
    id: string;
    content: string;
    result?: InsightResult;
    timestamp: Date;
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
          {/* Message content */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-semibold">
              AI
            </div>
            <div className="flex-1">
              <p className="text-gray-800">{message.content}</p>
              <span className="text-xs text-gray-400 mt-1 block">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
          </div>

          {/* Loading state */}
          {message.isLoading && message.result?.thinking && (
            <ThinkingStream steps={message.result.thinking} />
          )}

          {/* Results */}
          {message.result && !message.isLoading && (
            <>
              {message.result.results && (
                <div className="mt-4">
                  <ResultsTable
                    columns={message.result.results.columns}
                    rows={message.result.results.rows}
                  />
                </div>
              )}

              {/* Actions for this specific result */}
              {showActions && (
                <MessageActions
                  result={message.result}
                  customerId={customerId}
                  messageId={message.id}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

#### 5. ConversationInput

```typescript
// app/insights/new/components/ConversationInput.tsx

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
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
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
        className="min-h-[100px] max-h-[300px] pr-12 resize-none text-base"
        rows={3}
      />

      <Button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        className="absolute bottom-3 right-3 rounded-full"
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

#### 6. SmartSuggestions

```typescript
// app/insights/new/components/SmartSuggestions.tsx

"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { generateSmartSuggestions } from "@/lib/services/suggestion-generator.service";
import { generateRefinements } from "@/lib/services/refinement-generator.service";
import type { ConversationMessage } from "@/lib/types/conversation";

interface SmartSuggestionsProps {
  lastMessage: ConversationMessage;
  onSuggestionClick: (text: string) => void;
}

export function SmartSuggestions({
  lastMessage,
  onSuggestionClick,
}: SmartSuggestionsProps) {
  const suggestions = useMemo(
    () => generateSmartSuggestions(lastMessage.result),
    [lastMessage]
  );

  const refinements = useMemo(
    () => generateRefinements(lastMessage.result),
    [lastMessage]
  );

  // Don't show if no suggestions
  if (suggestions.length === 0 && refinements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 my-6">
      {/* Follow-up Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
            💡 You might want to ask:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick(suggestion.text)}
                className="text-left hover:bg-blue-50 hover:border-blue-300"
              >
                <span className="mr-2">{suggestion.icon}</span>
                {suggestion.text}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Refinement Suggestions */}
      {refinements.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
            ✨ Or refine the current result:
          </p>
          <div className="flex flex-wrap gap-2">
            {refinements.map((refinement, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                onClick={() => onSuggestionClick(refinement)}
                className="text-left hover:bg-gray-100"
              >
                {refinement}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Data Models

### Core Types

```typescript
// lib/types/conversation.ts

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
  
  // Context used for this message
  contextUsed?: {
    previousMessageIds: string[];
    customerScope: string;
    activeFilters?: any;
  };
}

export interface ConversationContext {
  // Shared context across messages
  customerId: string;
  activeFilters?: any[];
  referencedEntities?: {
    patients?: string[];
    wounds?: string[];
    assessments?: string[];
  };
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  lastResultSet?: {
    messageId: string;
    rowCount: number;
    columns: string[];
  };
}

export interface SmartSuggestion {
  text: string;
  icon?: string;
  category: "drill-down" | "comparison" | "trend" | "related";
  confidence?: number;
}
```

---

## API Design

### POST /api/insights/conversation/send

Send a message in a conversation thread.

**Request:**
```typescript
{
  threadId?: string;  // Optional: omit to create new thread
  customerId: string;
  question: string;
  modelId?: string;
  context?: {
    previousMessages?: number;  // How many previous messages to include as context
    explicitContext?: any;      // Any explicit context to add
  };
}
```

**Response:**
```typescript
{
  threadId: string;
  message: {
    id: string;
    role: "assistant";
    content: string;
    result: InsightResult;
    timestamp: Date;
  };
  contextUsed: {
    previousMessageIds: string[];
    contextSummary: string;
  };
}
```

### PATCH /api/insights/conversation/messages/:messageId

Edit a message and re-run from that point.

**Request:**
```typescript
{
  newContent: string;
}
```

**Response:**
```typescript
{
  message: ConversationMessage;
  discardedMessageIds: string[];  // Messages that were discarded
  newResult: InsightResult;
}
```

### POST /api/insights/conversation/new

Start a new conversation thread.

**Request:**
```typescript
{
  customerId: string;
  title?: string;
}
```

**Response:**
```typescript
{
  threadId: string;
  createdAt: Date;
}
```

### GET /api/insights/conversation/:threadId

Load a conversation thread with all messages.

**Response:**
```typescript
{
  thread: ConversationThread;
  messages: ConversationMessage[];
}
```

### GET /api/insights/conversation/history

Get user's conversation history.

**Query Params:**
```
?customerId=uuid&limit=20&offset=0
```

**Response:**
```typescript
{
  threads: Array<{
    id: string;
    title: string;
    customerId: string;
    customerName: string;
    messageCount: number;
    lastMessageAt: Date;
    preview: string;  // First user message
  }>;
  total: number;
}
```

### POST /api/insights/conversation/suggestions

Generate smart suggestions for a given result.

**Request:**
```typescript
{
  result: InsightResult;
  conversationContext?: ConversationContext;
}
```

**Response:**
```typescript
{
  followUps: SmartSuggestion[];
  refinements: string[];
}
```

---

## Database Schema

### ConversationThreads Table

```sql
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

CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_active
ON "ConversationThreads" ("isActive", "updatedAt" DESC)
WHERE "isActive" = true;

COMMENT ON TABLE "ConversationThreads" IS 'Conversation threads for multi-turn Q&A';
COMMENT ON COLUMN "ConversationThreads"."contextCache" IS 'Shared context: entities, filters, time ranges';
```

### ConversationMessages Table

```sql
CREATE TABLE IF NOT EXISTS "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
ON "ConversationMessages" ("threadId", "createdAt" ASC);

COMMENT ON TABLE "ConversationMessages" IS 'Individual messages within conversation threads';
COMMENT ON COLUMN "ConversationMessages"."metadata" IS 'SQL, model, timing, context for assistant messages';
```

### Auto-update Thread Timestamp Trigger

```sql
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
```

---

## State Management

### useConversation Hook

```typescript
// lib/hooks/useConversation.ts

import { useState, useCallback, useRef } from "react";
import type { ConversationMessage, ConversationThread } from "@/lib/types/conversation";
import type { InsightResult } from "./useInsights";

interface UseConversationReturn {
  threadId: string | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (question: string, customerId: string, modelId?: string) => Promise<void>;
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
  const sendMessage = useCallback(async (
    question: string,
    customerId: string,
    modelId?: string
  ) => {
    // Cancel any ongoing request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Optimistically add user message
    const userMessage: ConversationMessage = {
      id: `temp-${Date.now()}`,
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
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      // Update thread ID if this was the first message
      if (!threadId) {
        setThreadId(data.threadId);
      }

      // Replace temp user message with real one and add assistant response
      setMessages((prev) => {
        const withoutTemp = prev.filter((msg) => msg.id !== userMessage.id);
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
      setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [threadId]);

  /**
   * Edit a message and re-run from that point
   */
  const editMessage = useCallback(async (
    messageId: string,
    newContent: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/insights/conversation/messages/${messageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newContent }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to edit message");
      }

      const data = await response.json();

      // Update messages: replace edited message and remove discarded ones
      setMessages((prev) => {
        // Find the index of the edited message
        const editedIndex = prev.findIndex((msg) => msg.id === messageId);
        if (editedIndex === -1) return prev;

        // Keep messages up to and including the edited one
        const kept = prev.slice(0, editedIndex);

        // Add the updated message and new response
        return [
          ...kept,
          data.message,
          data.newAssistantMessage,
        ];
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      const response = await fetch(`/api/insights/conversation/${loadThreadId}`);

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

## Smart Suggestions System

### Suggestion Generator Service

```typescript
// lib/services/suggestion-generator.service.ts

import type { InsightResult } from "@/lib/hooks/useInsights";
import type { SmartSuggestion } from "@/lib/types/conversation";

/**
 * Generate smart follow-up suggestions based on query result
 */
export function generateSmartSuggestions(
  result?: InsightResult
): SmartSuggestion[] {
  if (!result || !result.results) {
    return [];
  }

  const suggestions: SmartSuggestion[] = [];

  // Analyze SQL to determine query type
  const sql = result.sql || "";
  const hasAggregation = /COUNT|SUM|AVG|MAX|MIN/i.test(sql);
  const hasGroupBy = /GROUP BY/i.test(sql);
  const hasTimeColumn = result.results.columns.some((col) =>
    /date|time/i.test(col)
  );
  const hasPatientId = result.results.columns.some((col) =>
    /patient/i.test(col)
  );
  const hasWoundData = result.results.columns.some((col) =>
    /wound|area|depth/i.test(col)
  );

  // For aggregated results → suggest drill-down
  if (hasAggregation && hasGroupBy) {
    suggestions.push({
      text: "Show me the individual records",
      icon: "🔎",
      category: "drill-down",
      confidence: 0.9,
    });
  }

  // For time-series data → suggest comparisons
  if (hasTimeColumn) {
    suggestions.push({
      text: "Compare to previous period",
      icon: "⚖️",
      category: "comparison",
      confidence: 0.85,
    });

    if (hasGroupBy) {
      suggestions.push({
        text: "Show monthly breakdown",
        icon: "📊",
        category: "trend",
        confidence: 0.8,
      });
    }
  }

  // For patient lists → suggest analysis
  if (hasPatientId && !hasAggregation) {
    suggestions.push({
      text: "Which ones are improving?",
      icon: "📈",
      category: "related",
      confidence: 0.85,
    });

    suggestions.push({
      text: "Group by clinic or location",
      icon: "🏥",
      category: "related",
      confidence: 0.75,
    });
  }

  // For wound data → suggest metrics
  if (hasWoundData) {
    suggestions.push({
      text: "Show healing rates",
      icon: "💊",
      category: "related",
      confidence: 0.8,
    });

    if (!hasAggregation) {
      suggestions.push({
        text: "Find outliers",
        icon: "🎯",
        category: "related",
        confidence: 0.75,
      });
    }
  }

  // Sort by confidence and limit to top 4
  return suggestions
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 4);
}
```

### Refinement Generator Service

```typescript
// lib/services/refinement-generator.service.ts

import type { InsightResult } from "@/lib/hooks/useInsights";

/**
 * Generate context-aware refinement suggestions
 */
export function generateRefinements(result?: InsightResult): string[] {
  if (!result || !result.results || !result.sql) {
    return [];
  }

  const refinements: string[] = [];
  const sql = result.sql;
  const rowCount = result.results.rows.length;

  // Always offer explanation
  refinements.push("Explain what you found");

  // If many rows, suggest limiting
  if (rowCount > 10) {
    refinements.push("Show only top 10 results");
  }

  // If has time filter, suggest changing it
  if (/DATEADD|DATEDIFF/i.test(sql)) {
    if (!/MONTH.*6/i.test(sql)) {
      refinements.push("Change to last 6 months");
    }
    if (!/YEAR.*1/i.test(sql)) {
      refinements.push("Change to last year");
    }
  }

  // If excludes inactive, suggest including them
  if (/isActive\s*=\s*1/i.test(sql)) {
    refinements.push("Include inactive records too");
  }

  // If limited columns (< 5), suggest adding more
  if (result.results.columns.length < 5) {
    refinements.push("Add more columns");
  }

  // If no ORDER BY, suggest sorting
  if (!/ORDER BY/i.test(sql)) {
    refinements.push("Sort the results");
  }

  // Limit to 5 refinements
  return refinements.slice(0, 5);
}
```

---

## Migration Strategy

### Phase 1: Non-Breaking Addition (Week 1)

**Goal:** Add conversation features **alongside** existing UI, without breaking anything.

**Steps:**
1. ✅ Create database tables (ConversationThreads, ConversationMessages)
2. ✅ Build `useConversation` hook
3. ✅ Create new components (ConversationMessage, SmartSuggestions)
4. ✅ Keep old page at `/insights/new`
5. ✅ Deploy new conversation page at `/insights/conversation` (beta)

**Risk:** None - old system untouched

### Phase 2: Gradual Migration (Week 2)

**Goal:** A/B test conversation UI with select users.

**Steps:**
1. ✅ Add feature flag: `ENABLE_CONVERSATION_UI`
2. ✅ Route users based on flag:
   ```typescript
   if (featureFlags.enableConversationUI) {
     return <ConversationPage />;
   } else {
     return <OldInsightsPage />;
   }
   ```
3. ✅ Collect metrics (engagement, success rate, user feedback)
4. ✅ Iterate based on feedback

**Risk:** Low - can toggle back instantly

### Phase 3: Full Rollout (Week 3)

**Goal:** Make conversation UI the default.

**Steps:**
1. ✅ Enable flag for all users
2. ✅ Redirect `/insights/new` → `/insights/conversation`
3. ✅ Keep old page available at `/insights/legacy` for 2 weeks
4. ✅ Monitor for issues

**Risk:** Medium - have rollback plan

### Phase 4: Cleanup (Week 4)

**Goal:** Remove old code.

**Steps:**
1. ✅ After 2 weeks of stable operation, delete old components
2. ✅ Remove feature flag
3. ✅ Update documentation
4. ✅ Archive old page

**Risk:** Low - old system validated obsolete

---

## Implementation Plan

### Week 1: Foundation

#### Day 1-2: Database & API
- [x] Run migration to create ConversationThreads and ConversationMessages tables
- [ ] Create `/api/insights/conversation/send` endpoint
- [ ] Create `/api/insights/conversation/:threadId` endpoint (load)
- [ ] Create `/api/insights/conversation/new` endpoint
- [ ] Test API endpoints with Postman

#### Day 3-4: Core Hook & Context
- [ ] Implement `useConversation` hook
- [ ] Add context-building logic (pass previous messages to LLM)
- [ ] Handle optimistic updates
- [ ] Add error handling and loading states

#### Day 5: Testing
- [ ] Write unit tests for `useConversation`
- [ ] Test context carryover with real queries
- [ ] Verify database persistence

### Week 2: UI Components

#### Day 1-2: Message Components
- [ ] Create `ConversationMessage` component
- [ ] Create `UserMessage` with edit functionality
- [ ] Create `AssistantMessage` with results display
- [ ] Add message actions (Save, Chart, Export)

#### Day 3: Input & Suggestions
- [ ] Create `ConversationInput` component
- [ ] Implement auto-resize textarea
- [ ] Add Ctrl+Enter to send
- [ ] Create `SmartSuggestions` component

#### Day 4: Page Layout
- [ ] Create new `/insights/conversation` page
- [ ] Implement sticky header and footer
- [ ] Add conversation history dropdown
- [ ] Implement "New Chat" button

#### Day 5: Polish
- [ ] Add loading states
- [ ] Add empty states
- [ ] Mobile responsive design
- [ ] Accessibility improvements (ARIA labels, keyboard nav)

### Week 3: Smart Suggestions

#### Day 1-2: Suggestion Generator
- [ ] Implement `generateSmartSuggestions` service
- [ ] Add SQL analysis logic
- [ ] Test with various query types
- [ ] Tune confidence scoring

#### Day 3: Refinement Generator
- [ ] Implement `generateRefinements` service
- [ ] Context-aware refinement suggestions
- [ ] Test with complex queries

#### Day 4-5: Integration
- [ ] Connect suggestions to UI
- [ ] Test suggestion → input fill flow
- [ ] Add suggestion API endpoint
- [ ] Polish suggestion UI

### Week 4: Migration & Polish

#### Day 1-2: A/B Testing Setup
- [ ] Add feature flag system
- [ ] Create rollout strategy
- [ ] Set up analytics tracking
- [ ] Deploy to beta users

#### Day 3-4: Feedback & Iteration
- [ ] Collect user feedback
- [ ] Fix reported bugs
- [ ] Optimize performance
- [ ] Improve suggestions based on usage

#### Day 5: Documentation
- [ ] Write user guide
- [ ] Create video tutorial
- [ ] Update internal docs
- [ ] Prepare for full rollout

---

## Success Metrics

### User Engagement

| Metric | Baseline | Target (3 months) |
|--------|----------|-------------------|
| Questions per session | 1.2 | 3.5+ |
| Follow-up question rate | 0% | 60%+ |
| Suggestion click rate | N/A | 40%+ |
| Conversation length (avg messages) | N/A | 4+ |
| Edit usage rate | N/A | 15%+ |

### Efficiency

| Metric | Baseline | Target |
|--------|----------|--------|
| Time to answer follow-up | N/A | < 15 seconds |
| Context understanding accuracy | N/A | > 85% |
| Suggestion relevance (user rating) | N/A | > 4.0/5 |

### Quality

| Metric | Baseline | Target |
|--------|----------|--------|
| Query success rate (no errors) | 70% | 90%+ |
| User satisfaction (NPS) | Unknown | 70+ |
| Feature discovery rate | 20% | 70%+ |

### Business Impact

| Metric | Baseline | Target |
|--------|----------|--------|
| Weekly active users | 100 | 200+ |
| Insights saved per user | 0.5 | 2+ |
| User retention (30-day) | 40% | 70%+ |

---

## Appendix

### A. Example Conversations

**Example 1: Progressive Drill-Down**
```
User: "How many patients have open wounds?"
AI: "You have 150 patients with open wounds."

User: "Which ones are infected?"
AI: "42 of those patients have infected wounds."

User: "Show me the ones improving"
AI: "12 patients showing improvement (>25% area reduction)"

User: "What treatments are they on?"
AI: "Here's the treatment breakdown for those 12 patients..."
```

**Example 2: Comparison Analysis**
```
User: "Show me wound healing rates for the ABC Clinic"
AI: "Here are the healing rates: [chart]"

User: "Compare to the overall facility average"
AI: "ABC Clinic: 78%, Facility average: 65%"

User: "What's driving the difference?"
AI: "ABC Clinic has: 1) Higher compliance, 2) More frequent assessments..."
```

**Example 3: Edit & Branch**
```
User: "Show me patients with pressure ulcers"
AI: [Shows 50 patients]

User: "Which ones are stage 3 or 4?"
AI: [Shows 12 patients]

User: [Edits first question to "Show me patients with diabetic foot ulcers"]
AI: [Discards second message, shows 35 patients with diabetic foot ulcers]
```

### B. Context Passing Strategy

**How context is maintained:**

```typescript
// When user asks follow-up "Which ones are improving?"
// System builds context from previous messages:

const contextPrompt = `
Previous conversation:
- User asked: "Show me patients with infected wounds"
- You found: 42 patients (saved in result set ID: abc-123)
- Query returned columns: PatientID, Name, WoundType, InfectionStatus

Current question: "Which ones are improving?"

Instruction: Use the previous result set (42 patients) as the base.
Filter for patients showing improvement (area reduction > 25%).
`;
```

**Implementation:**
```typescript
// lib/services/conversation-context.service.ts

export function buildContextPrompt(
  thread: ConversationThread,
  messages: ConversationMessage[],
  currentQuestion: string
): string {
  const recentMessages = messages.slice(-5); // Last 5 messages
  
  let context = "Previous conversation:\n";
  
  for (const msg of recentMessages) {
    if (msg.role === "user") {
      context += `- User asked: "${msg.content}"\n`;
    } else if (msg.result) {
      context += `- You found: ${msg.result.results?.rows.length} ${extractEntityType(msg.content)}\n`;
      if (msg.result.sql) {
        context += `- Result set ID: ${msg.id}\n`;
        context += `- Columns: ${msg.result.results?.columns.join(", ")}\n`;
      }
    }
  }
  
  context += `\nCurrent question: "${currentQuestion}"\n`;
  context += `\nInstruction: Interpret pronouns (which ones, they, those, etc.) using the most recent result set.`;
  
  return context;
}
```

### C. Mobile Responsiveness

**Key Adaptations:**

1. **Stacked Layout**
   - Full width messages
   - Single column for suggestions
   - Bottom action bar for Save/Chart/Export

2. **Touch Targets**
   - Minimum 44px tap targets
   - Larger buttons for suggestions
   - Swipe-to-edit for messages

3. **Input Optimization**
   - Native mobile keyboard
   - Voice input button
   - Auto-capitalize first word

4. **Performance**
   - Lazy load old messages
   - Virtualized message list
   - Debounced auto-resize

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-14  
**Status:** Ready for Implementation  
**Next Steps:** Review with team → Create implementation tickets → Begin Week 1 tasks
