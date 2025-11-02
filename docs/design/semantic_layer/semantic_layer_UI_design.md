# Semantic Layer UI Design: ChatGPT for Healthcare Data

**Version:** 1.0
**Last Updated:** 2025-10-31
**Status:** Design Complete, Ready for Implementation
**Document Owner:** InsightGen Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Philosophy](#design-philosophy)
3. [First Principles Analysis](#first-principles-analysis)
4. [Unified User Flow](#unified-user-flow)
5. [Progressive Disclosure Pattern](#progressive-disclosure-pattern)
6. [Three-Mode Integration Strategy](#three-mode-integration-strategy)
7. [Component Architecture](#component-architecture)
8. [Thinking Stream Design](#thinking-stream-design)
9. [Auto-Funnel Pattern](#auto-funnel-pattern)
10. [Visual Design Specifications](#visual-design-specifications)
11. [Migration from Current Design](#migration-from-current-design)
12. [Success Metrics](#success-metrics)

---

## Executive Summary

### The Vision

Transform InsightGen from a form-centric query tool into a **"ChatGPT for Healthcare Data"**—a conversational interface where users ask questions and receive trusted answers with full transparency into the reasoning process.

### Core Problem

**Current State:**
- Users must choose between "Form-Specific" and "Database Insight" modes
- Form selection required before asking questions
- Complex funnel UI with horizontal scrolling
- Information overload for simple queries
- Semantic layer vision conflicts with current workflow

**Desired State:**
- Single unified interface: Customer → Question → Answer
- No form selection (semantic layer handles this automatically)
- Clean, minimal UI for 90% of queries
- Funnel complexity hidden until needed
- ChatGPT-like thinking process visibility

### Key Innovation: Progressive Disclosure

**Simple Case (90% of queries):**
```
Question → Thinking (collapsed) → Results
```

**Complex Case (10% of queries):**
```
Question → Auto-Funnel (vertical steps) → Results
```

**Power User (on-demand):**
```
Question → Thinking (expanded) → Semantic Mappings → SQL Editor → Results
```

---

## Design Philosophy

### Three Core Principles

1. **Answer-First, Not SQL-First**
   - Users want answers, not queries
   - SQL is an implementation detail
   - Show results immediately, SQL on-demand

2. **Trust Through Transparency**
   - Show thinking process (ChatGPT-style)
   - Explain semantic mappings
   - Surface confidence scores
   - Make AI reasoning visible

3. **Graceful Complexity**
   - Simple by default
   - Powerful when needed
   - Progressive disclosure of details
   - Never hide control, just hide complexity

### Design Decisions

| Old Pattern | New Pattern | Rationale |
|-------------|-------------|-----------|
| Form selection required | No form selection | Semantic layer handles form discovery |
| Two workflow modes | Single unified flow | Simpler mental model |
| Horizontal funnel scroll | Vertical auto-funnel | Familiar pattern, less cognitive load |
| Always-visible complexity | Collapsed by default | Clean UI for common cases |
| Funnel as primary UI | Funnel as fallback | Only show when AI needs help |

---

## First Principles Analysis

### What Users Actually Want

1. **Answer to their question** (not SQL, not forms, not steps)
2. **Trust in the answer** (how did you get this?)
3. **Control when needed** (let me fix if wrong)

### What They Don't Care About

- Which form has the data
- Database schema details
- Multi-step breakdowns (unless AI struggles)
- Template matching logic
- Semantic mapping internals

### The Core Tension

- **Funnel system** gives control but adds friction
- **Semantic layer** removes friction but loses control
- **Solution:** Progressive disclosure—simple by default, powerful when needed

---

## Unified User Flow

### Single Entry Point

```
┌─────────────────────────────────────────────────────────┐
│  Insights                                      [@Fred]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer: [St Mary's Hospital ▼]                       │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ 💬 Ask a question about your data              │    │
│  │                                                 │    │
│  │ What's the average healing rate for diabetic   │    │
│  │ wounds in the last 6 months?                    │    │
│  └────────────────────────────────────────────────┘    │
│                                           [Ask →]       │
│                                                          │
│  💡 Try asking:                                         │
│     • Infection trends by wound type                    │
│     • Patient outcomes in AML clinic                    │
│     • Healing rates compared across facilities          │
│                                                          │
│  📋 Recent Questions                                    │
│  ┌──────────────────────────────────────────────┐      │
│  │ Healing rate for diabetic wounds       2h ago│      │
│  │ 📊 287 records • Used template               │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Changes from Current Design

**Removed:**
- ❌ "Form-Specific Insight" vs "Database Insight" choice
- ❌ Form selection step
- ❌ "Analyze with AI" button to generate questions
- ❌ Horizontal funnel panel navigation

**Added:**
- ✅ Customer selector (enables multi-customer support)
- ✅ Single question input (like ChatGPT)
- ✅ Suggested questions based on customer data
- ✅ Recent questions history with metadata

---

## Progressive Disclosure Pattern

### Level 1: Simple Answer (Default for 90% of cases)

```
┌─────────────────────────────────────────────────────────┐
│  Q: Average healing rate for diabetic wounds?           │
│                                              [Edit ✏️]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ▼ Understanding your question... (0.8s)  [Collapse]   │
│     ✓ Intent: outcome_analysis                          │
│     ✓ Metric: healing_rate                              │
│     ✓ Filter: diabetic wounds                           │
│     ✓ Template matched: "Avg Metric by Category" (94%) │
│                                                          │
│  ▼ Building query... (1.2s)               [Collapse]   │
│     ✓ Semantic mapping: Etiology = "Diabetic Foot..."  │
│     ✓ Forms: Wound Assessment, Measurements             │
│     ✓ Join path: Patient → Wound → Assessment          │
│     ✓ Validated against demo data                       │
│                                                          │
│     [Show SQL] [Show Mappings]                          │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Results (287 records)                    [Chart][Table]│
│                                                          │
│  📊  Average Healing Rate: 1.2 cm²/week                 │
│      [Interactive chart showing trend over 6 months]    │
│                                                          │
│      Median: 0.9 cm²/week                               │
│      Patients: 45                                        │
│      Assessments: 287                                    │
│                                                          │
│  [Refine Question] [Adjust SQL] [Save as Template]     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**User Experience:**
- Thinking process streams in real-time
- Everything collapsed by default (clean)
- Click to expand details (power users)
- **No funnel shown** (not needed for simple queries)

### Level 2: Complex Auto-Funnel (10% of cases)

```
┌─────────────────────────────────────────────────────────┐
│  Q: Compare healing across clinics for infected wounds  │
│     with >5 assessments in Q1 2024                       │
│                                              [Edit ✏️]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ⚠️ Complex question - breaking into steps              │
│                        [Auto-mode: ON ▼] [Manual]       │
│                                                          │
│  ▼ Step 1/3: Identify clinics (✓ 1.2s)   [Collapse]    │
│     ✓ Found 4 clinics with wound care programs          │
│     ✓ Template: "List Distinct Values"                  │
│     [View SQL] [View Data: 4 rows]                      │
│                                                          │
│  ▼ Step 2/3: Filter infected wounds (✓ 2.1s) [Collapse]│
│     ✓ Semantic mapping: Infection Status → "Yes"       │
│     ✓ Forms: Assessment Series                          │
│     ✓ Using data from Step 1                            │
│     [View SQL] [View Data: 127 rows] [Edit Question]   │
│                                                          │
│  ▶ Step 3/3: Calculate healing rate (⏳ running...)     │
│     ⏳ Generating query...                              │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  [Pause] [Skip to Manual Mode]                          │
└─────────────────────────────────────────────────────────┘
```

**Key Innovations:**
- **Funnel triggered automatically** when semantic layer detects complexity
- **Auto-mode by default** - runs all steps without user input
- **Each step shows mini-thinking** - same pattern as simple case
- **Manual override available** - click any step to edit
- **Cleaner than current funnel** - no horizontal scroll, vertical steps

### Level 3: Power User Mode (On-Demand)

```
┌─────────────────────────────────────────────────────────┐
│  Q: Average healing rate for diabetic wounds?           │
│                                              [Edit ✏️]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ▼ Understanding your question... (0.8s)  [Expanded]   │
│     ✓ Intent: outcome_analysis                          │
│     ✓ Metric: healing_rate                              │
│     ✓ Filter: diabetic wounds                           │
│     ✓ Template matched: "Avg Metric by Category" (94%) │
│                                                          │
│     🔍 Semantic Mappings Detected:                      │
│     ┌───────────────────────────────────────────────┐  │
│     │ • "diabetic wounds"                           │  │
│     │   → Concept: wound_classification             │  │
│     │   → Form: "Wound Assessment"                  │  │
│     │   → Field: "Etiology"                         │  │
│     │   → Value: "Diabetic Foot Ulcer"              │  │
│     │   → Confidence: 97%                           │  │
│     │                                               │  │
│     │ • "healing rate"                              │  │
│     │   → Concept: outcome_metrics                  │  │
│     │   → Form: "Assessment Series"                 │  │
│     │   → Field: "Area (cm²)"                       │  │
│     │   → Calculation: (initial - current)/initial  │  │
│     │   → Confidence: 92%                           │  │
│     └───────────────────────────────────────────────┘  │
│                                                          │
│     📋 Forms Required:                                  │
│     • Wound Assessment (contains wound classification)  │
│     • Assessment Series (contains measurements)         │
│                                                          │
│     🔗 Join Path:                                       │
│     Patient → Wound → Assessment → Measurement          │
│     (4 tables, 3 joins)                                 │
│                                                          │
│  ▼ Generated SQL (1.2s)                   [Expanded]   │
│     ```sql                                              │
│     SELECT                                              │
│       AVG((m1.value - m2.value) / m1.value) AS healing_rate│
│     FROM rpt.Patient p                                  │
│     INNER JOIN rpt.Wound w ON p.id = w.patientFk       │
│     ...                                                 │
│     ```                                                 │
│     [Copy SQL] [Edit SQL] [Download]                   │
│                                                          │
│  📊 Results (287 records)                               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Power User Features:**
- Full semantic mapping details
- Complete join path visualization
- SQL editor with syntax highlighting
- Download context bundle as JSON
- Manual override at every level

---

## Three-Mode Integration Strategy

### Decision Flow

```
User asks question
       ↓
┌──────────────────────────────────┐
│  1. Template Matching (fastest)  │
│     Check template library        │
│     Confidence > 90%?             │
└──────────────────────────────────┘
       ↓ Yes (60% of cases)
   Use template → Results

       ↓ No
┌──────────────────────────────────┐
│  2. Semantic Discovery            │
│     Context API analyzes question │
│     Maps to customer schema       │
│     Complexity score?             │
└──────────────────────────────────┘
       ↓ Simple (30% of cases)
   Direct SQL → Results

       ↓ Complex (10% of cases)
┌──────────────────────────────────┐
│  3. Auto-Funnel                   │
│     Break into sub-questions      │
│     Run each step automatically   │
│     Show progress                 │
└──────────────────────────────────┘
       ↓
   Combined SQL → Results
```

### Mode Characteristics

| Mode | Trigger | Speed | User Input | Transparency |
|------|---------|-------|------------|--------------|
| **Template** | Match confidence > 90% | <1s | None | Low (just "used template X") |
| **Direct** | Complexity score < 3 | 2-5s | None | Medium (show semantic mappings) |
| **Auto-Funnel** | Complexity score ≥ 3 | 5-15s | Optional | High (show all steps) |

### Backend Integration

```typescript
// app/api/insights/ask/route.ts

export async function POST(req: Request) {
  const { question, customerId } = await req.json();

  // Track thinking steps for UI
  const thinking = new ThinkingStream();

  // 1. Template-first (fastest path)
  thinking.add("Checking template library...");
  const template = await templateService.match(question);

  if (template.confidence > 0.9) {
    thinking.add(`✓ Template matched: "${template.name}" (${template.confidence})`);
    const sql = await templateService.fill(template, customerId);
    const results = await executeSQL(sql, customerId);

    return {
      mode: "template",
      thinking: thinking.steps,
      sql,
      results,
      template: template.name
    };
  }

  // 2. Semantic layer discovery
  thinking.add("Analyzing question with semantic layer...");
  const context = await fetch(
    `/api/customers/${customerId}/context/discover`,
    {
      method: "POST",
      body: JSON.stringify({ question })
    }
  );

  thinking.add(`✓ Intent: ${context.intent}`);
  thinking.add(`✓ Concepts: ${context.concepts.map(c => c.name).join(", ")}`);
  thinking.add(`✓ Forms: ${context.forms.map(f => f.name).join(", ")}`);

  // 3. Complexity check
  if (context.complexityScore < 3) {
    // Simple - direct SQL
    thinking.add("Generating SQL...");
    const sql = await sqlGenerator.generate(context, customerId);
    thinking.add("✓ Validated against demo data");
    const results = await executeSQL(sql, customerId);

    return {
      mode: "direct",
      thinking: thinking.steps,
      context,
      sql,
      results
    };
  }

  // 4. Complex - generate funnel
  thinking.add("⚠️ Complex question - creating breakdown...");
  const funnel = await funnelGenerator.create(context, customerId);
  thinking.add(`✓ Created ${funnel.steps.length} steps`);

  // Auto-execute funnel
  for (const step of funnel.steps) {
    thinking.add(`▶ Step ${step.order}: ${step.question}`);
    const stepSQL = await sqlGenerator.generate(step.context, customerId);
    const stepResults = await executeSQL(stepSQL, customerId);
    thinking.add(`✓ Step ${step.order} complete (${stepResults.rows.length} rows)`);

    step.sql = stepSQL;
    step.results = stepResults;
  }

  // Combine results
  const finalSQL = await funnel.combineSteps();
  const finalResults = await executeSQL(finalSQL, customerId);

  return {
    mode: "funnel",
    thinking: thinking.steps,
    funnel,
    sql: finalSQL,
    results: finalResults
  };
}
```

---

## Component Architecture

### Component Hierarchy

```
app/insights/page.tsx (New unified page)
├── CustomerSelector
├── QuestionInput
├── SuggestedQuestions
├── RecentQuestions
└── InsightResults (Conditional rendering)
    ├── ThinkingStream (Always visible)
    ├── TemplateResult (mode === "template")
    ├── DirectResult (mode === "direct")
    │   ├── SemanticMappingsPanel (expandable)
    │   ├── SQLViewer (expandable)
    │   └── ResultsDisplay
    └── FunnelResult (mode === "funnel")
        ├── FunnelHeader (auto/manual toggle)
        ├── FunnelSteps (vertical layout)
        │   └── FunnelStep[] (each with mini-thinking)
        └── ResultsDisplay
```

### Key Components

#### 1. ThinkingStream Component

```typescript
// components/ThinkingStream.tsx

interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
}

interface ThinkingStreamProps {
  steps: ThinkingStep[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export function ThinkingStream({
  steps,
  collapsed = true,
  onToggle
}: ThinkingStreamProps) {
  const totalTime = steps.reduce((sum, s) => sum + (s.duration || 0), 0);

  return (
    <div className="thinking-stream">
      <button
        onClick={onToggle}
        className="thinking-header"
      >
        {collapsed ? "▶" : "▼"}
        How I answered this ({(totalTime / 1000).toFixed(1)}s)
      </button>

      {!collapsed && (
        <div className="thinking-steps">
          {steps.map(step => (
            <ThinkingStep key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingStep({ step }: { step: ThinkingStep }) {
  const icon = {
    pending: "⏳",
    running: "⏳",
    complete: "✓",
    error: "❌"
  }[step.status];

  return (
    <div className={`thinking-step thinking-step-${step.status}`}>
      <span className="step-icon">{icon}</span>
      <span className="step-message">{step.message}</span>
      {step.duration && (
        <span className="step-duration">
          ({(step.duration / 1000).toFixed(1)}s)
        </span>
      )}
      {step.details && (
        <button onClick={() => showDetails(step)}>
          [View Details]
        </button>
      )}
    </div>
  );
}
```

#### 2. FunnelResult Component (Simplified)

```typescript
// components/FunnelResult.tsx

interface FunnelResultProps {
  steps: FunnelStep[];
  autoMode: boolean;
  onToggleMode: () => void;
  sql: string;
  results: QueryResult;
}

export function FunnelResult({
  steps,
  autoMode,
  onToggleMode,
  sql,
  results
}: FunnelResultProps) {
  return (
    <div className="funnel-result">
      <div className="funnel-header">
        <div className="complexity-warning">
          ⚠️ Complex question - using step-by-step analysis
        </div>

        <Toggle
          checked={autoMode}
          onChange={onToggleMode}
          label="Auto-mode"
        />
      </div>

      {/* Vertical steps, not horizontal */}
      <div className="funnel-steps">
        {steps.map((step, i) => (
          <FunnelStepCard
            key={step.id}
            number={i + 1}
            total={steps.length}
            step={step}
            autoMode={autoMode}
          />
        ))}
      </div>

      <div className="final-results">
        <h3>Final Results</h3>
        <ResultsDisplay
          results={results}
          sql={sql}
        />
      </div>
    </div>
  );
}

function FunnelStepCard({
  number,
  total,
  step,
  autoMode
}: FunnelStepCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="funnel-step-card">
      <div
        className="step-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="step-icon">
          {expanded ? "▼" : "▶"}
        </span>

        <span className="step-title">
          Step {number}/{total}: {step.question}
        </span>

        <span className="step-status">
          {step.status === "complete" && `✓ ${step.duration}s`}
          {step.status === "running" && "⏳ running..."}
        </span>
      </div>

      {expanded && (
        <div className="step-details">
          <ThinkingStream
            steps={step.thinking}
            collapsed={false}
          />

          <div className="step-actions">
            <button onClick={() => showSQL(step)}>
              View SQL
            </button>
            <button onClick={() => showData(step)}>
              View Data ({step.results.rows.length} rows)
            </button>
            {!autoMode && (
              <button onClick={() => editQuestion(step)}>
                Edit Question
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

#### 3. DirectResult Component

```typescript
// components/DirectResult.tsx

interface DirectResultProps {
  context: ContextBundle;
  sql: string;
  results: QueryResult;
}

export function DirectResult({
  context,
  sql,
  results
}: DirectResultProps) {
  const [showMappings, setShowMappings] = useState(false);
  const [showSQL, setShowSQL] = useState(false);

  return (
    <div className="direct-result">
      <div className="result-actions">
        <button onClick={() => setShowMappings(!showMappings)}>
          {showMappings ? "Hide" : "Show"} Mappings
        </button>
        <button onClick={() => setShowSQL(!showSQL)}>
          {showSQL ? "Hide" : "Show"} SQL
        </button>
      </div>

      {showMappings && (
        <SemanticMappingsPanel context={context} />
      )}

      {showSQL && (
        <SQLViewer sql={sql} editable={true} />
      )}

      <ResultsDisplay results={results} />
    </div>
  );
}

function SemanticMappingsPanel({ context }: { context: ContextBundle }) {
  return (
    <div className="semantic-mappings-panel">
      <h4>🔍 Semantic Mappings</h4>

      {context.terminology.map(mapping => (
        <div key={mapping.userTerm} className="mapping-card">
          <div className="mapping-header">
            <strong>"{mapping.userTerm}"</strong>
            <ConfidenceBadge score={mapping.confidence} />
          </div>

          <div className="mapping-details">
            <div>→ Concept: {mapping.semanticConcept}</div>
            <div>→ Form: {mapping.formName}</div>
            <div>→ Field: {mapping.fieldName}</div>
            <div>→ Value: "{mapping.fieldValue}"</div>
          </div>
        </div>
      ))}

      <div className="forms-used">
        <h5>📋 Forms Required:</h5>
        <ul>
          {context.forms.map(form => (
            <li key={form.formName}>
              {form.formName} ({form.reason})
            </li>
          ))}
        </ul>
      </div>

      <div className="join-path">
        <h5>🔗 Join Path:</h5>
        <div className="path-visualization">
          {context.joinPaths[0]?.path.join(" → ")}
        </div>
      </div>
    </div>
  );
}
```

---

## Thinking Stream Design

### Real-Time Streaming

```typescript
// lib/services/thinking-stream.service.ts

export class ThinkingStream {
  private steps: ThinkingStep[] = [];
  private subscribers: Set<(step: ThinkingStep) => void> = new Set();

  add(message: string, details?: any): ThinkingStep {
    const step: ThinkingStep = {
      id: uuid(),
      status: "complete",
      message,
      details,
      duration: 0,
      timestamp: Date.now()
    };

    this.steps.push(step);
    this.notify(step);

    return step;
  }

  startStep(message: string): ThinkingStep {
    const step: ThinkingStep = {
      id: uuid(),
      status: "running",
      message,
      timestamp: Date.now()
    };

    this.steps.push(step);
    this.notify(step);

    return step;
  }

  completeStep(stepId: string, message?: string) {
    const step = this.steps.find(s => s.id === stepId);
    if (step) {
      step.status = "complete";
      step.duration = Date.now() - step.timestamp;
      if (message) step.message = message;
      this.notify(step);
    }
  }

  subscribe(callback: (step: ThinkingStep) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(step: ThinkingStep) {
    this.subscribers.forEach(cb => cb(step));
  }

  toJSON() {
    return this.steps;
  }
}
```

### Streaming to Frontend (SSE)

```typescript
// app/api/insights/ask/route.ts

export async function POST(req: Request) {
  const { question, customerId } = await req.json();

  // Use Server-Sent Events for streaming
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const encoder = new TextEncoder();

  // Send thinking steps as they happen
  const thinking = new ThinkingStream();
  thinking.subscribe((step) => {
    writer.write(
      encoder.encode(`data: ${JSON.stringify({ type: "thinking", step })}\n\n`)
    );
  });

  // Process in background
  processQuestion(question, customerId, thinking)
    .then((result) => {
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "complete", result })}\n\n`)
      );
      writer.close();
    })
    .catch((error) => {
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "error", error })}\n\n`)
      );
      writer.close();
    });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
```

### Frontend Streaming Consumer

```typescript
// hooks/useInsightStream.ts

export function useInsightStream(question: string, customerId: string) {
  const [thinking, setThinking] = useState<ThinkingStep[]>([]);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/insights/ask?question=${encodeURIComponent(question)}&customerId=${customerId}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "thinking") {
        setThinking(prev => [...prev, data.step]);
      } else if (data.type === "complete") {
        setResult(data.result);
        eventSource.close();
      } else if (data.type === "error") {
        setError(new Error(data.error));
        eventSource.close();
      }
    };

    return () => eventSource.close();
  }, [question, customerId]);

  return { thinking, result, error };
}
```

---

## Auto-Funnel Pattern

### Complexity Detection

```typescript
// lib/services/complexity-detector.service.ts

interface ComplexityFactors {
  multipleMetrics: number;      // +1 per additional metric
  crossFormFilters: number;      // +2 if filters span multiple forms
  temporalAggregation: number;   // +1 if time-series analysis
  multipleJoins: number;         // +1 per join beyond 2
  customCalculations: number;    // +1 if custom math required
}

export function calculateComplexity(context: ContextBundle): number {
  const factors: ComplexityFactors = {
    multipleMetrics: Math.max(0, context.intent.metrics.length - 1),
    crossFormFilters: context.forms.length > 1 ? 2 : 0,
    temporalAggregation: context.intent.timeRange ? 1 : 0,
    multipleJoins: Math.max(0, context.joinPaths[0]?.joins.length - 2),
    customCalculations: containsCustomCalculation(context) ? 1 : 0
  };

  const score = Object.values(factors).reduce((sum, val) => sum + val, 0);

  return score;
}

// Complexity thresholds:
// 0-2: Simple (direct SQL)
// 3-5: Medium (might need funnel)
// 6+: Complex (definitely use funnel)
```

### Auto-Funnel Generation

```typescript
// lib/services/funnel-generator.service.ts

export async function generateAutoFunnel(
  context: ContextBundle,
  customerId: string
): Promise<FunnelDefinition> {
  const steps: FunnelStep[] = [];

  // Step 1: Filter to cohort (if needed)
  if (context.intent.filters.length > 0) {
    steps.push({
      order: 1,
      question: `Identify ${context.intent.filters[0].userTerm}`,
      type: "filter",
      context: extractFilterContext(context),
      dependencies: []
    });
  }

  // Step 2: Extract intermediate metrics
  if (context.intent.metrics.length > 1) {
    context.intent.metrics.slice(0, -1).forEach((metric, i) => {
      steps.push({
        order: steps.length + 1,
        question: `Calculate ${metric}`,
        type: "metric",
        context: extractMetricContext(context, metric),
        dependencies: steps.length > 0 ? [steps[steps.length - 1].order] : []
      });
    });
  }

  // Final step: Combine and aggregate
  steps.push({
    order: steps.length + 1,
    question: `${context.intent.type} for ${context.intent.metrics.join(", ")}`,
    type: "aggregate",
    context,
    dependencies: steps.map(s => s.order)
  });

  return {
    originalQuestion: context.question,
    steps,
    totalSteps: steps.length,
    estimatedDuration: steps.length * 3000 // 3s per step
  };
}
```

### Vertical Step Layout

```css
/* styles/funnel-result.css */

.funnel-steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1.5rem 0;
}

.funnel-step-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  transition: all 0.2s ease;
}

.funnel-step-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  cursor: pointer;
  user-select: none;
}

.step-icon {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.step-title {
  flex: 1;
  font-weight: 500;
}

.step-status {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.step-status.complete {
  color: var(--success-color);
}

.step-details {
  padding: 0 1rem 1rem 2.5rem;
  border-top: 1px solid var(--border-color-light);
  margin-top: 0.5rem;
}

.step-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

/* Progress indicator for running steps */
.funnel-step-card[data-status="running"] {
  border-left: 3px solid var(--primary-color);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { border-left-color: var(--primary-color); }
  50% { border-left-color: var(--primary-color-light); }
}
```

---

## Visual Design Specifications

### Color System

```css
:root {
  /* Thinking Stream States */
  --thinking-pending: #94a3b8;
  --thinking-running: #3b82f6;
  --thinking-complete: #10b981;
  --thinking-error: #ef4444;

  /* Confidence Levels */
  --confidence-high: #10b981;    /* > 90% */
  --confidence-medium: #f59e0b;  /* 70-90% */
  --confidence-low: #ef4444;     /* < 70% */

  /* Mode Indicators */
  --mode-template: #8b5cf6;
  --mode-direct: #3b82f6;
  --mode-funnel: #f59e0b;
}
```

### Confidence Badge Component

```typescript
// components/ConfidenceBadge.tsx

export function ConfidenceBadge({ score }: { score: number }) {
  const level = score >= 0.9 ? "high" : score >= 0.7 ? "medium" : "low";
  const color = {
    high: "var(--confidence-high)",
    medium: "var(--confidence-medium)",
    low: "var(--confidence-low)"
  }[level];

  return (
    <span
      className={`confidence-badge confidence-${level}`}
      style={{ backgroundColor: color }}
    >
      {(score * 100).toFixed(0)}%
    </span>
  );
}
```

### Typography & Spacing

```css
/* Question Input */
.question-input {
  font-size: 1rem;
  line-height: 1.5;
  padding: 1rem 1.25rem;
  min-height: 100px;
}

/* Thinking Stream */
.thinking-stream {
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 1.5rem 0;
}

.thinking-step {
  padding: 0.5rem 0;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

/* Results Display */
.results-display {
  margin-top: 2rem;
}

.results-metric {
  font-size: 2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.results-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

---

## Migration from Current Design

### Phase 1: Unified Entry (Week 1-2)

**Goal:** Replace dual-mode entry with single unified interface

**Tasks:**
1. Create new `/insights/page.tsx` (replace `/insights/new/page.tsx`)
2. Remove form/database mode selection
3. Add customer selector component
4. Implement simple question input
5. Mock thinking stream (hardcoded messages)
6. Route to existing funnel for now

**Exit Criteria:**
- User can select customer, ask question
- See mock thinking stream
- Still works with current funnel backend

### Phase 2: Semantic Integration (Week 3-4)

**Goal:** Wire semantic layer into new UI

**Tasks:**
1. Connect to context discovery API (Phase 5)
2. Implement real thinking stream from backend
3. Show semantic mappings in expandable panel
4. Template matching UI indicators
5. Direct SQL generation for simple cases

**Exit Criteria:**
- Simple questions work end-to-end
- Semantic mappings displayed accurately
- Template mode shows which template used

### Phase 3: Auto-Funnel (Week 5-6)

**Goal:** Complex questions trigger vertical auto-funnel

**Tasks:**
1. Implement complexity detection
2. Generate funnel steps automatically
3. Vertical step display (replace horizontal scroll)
4. Auto-mode execution
5. Manual override controls

**Exit Criteria:**
- Complex questions break down automatically
- Steps execute without user input
- User can switch to manual mode

### Phase 4: Polish & Streaming (Week 7-8)

**Goal:** Production-ready, delightful UX

**Tasks:**
1. Server-Sent Events for streaming updates
2. Better chart visualizations
3. Template library management UI
4. Export/save capabilities
5. Performance optimization

**Exit Criteria:**
- Streaming updates work smoothly
- < 5s response time for 90% of queries
- Zero layout shift during loading

---

## Success Metrics

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first insight | < 10 seconds | From question submit to results display |
| User satisfaction (NPS) | > 8.0 | Post-interaction survey |
| Question success rate | > 85% | Queries returning valid results |
| Template match rate | > 60% | % of queries using templates |
| Manual intervention rate | < 15% | % requiring SQL edits |

### Technical Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template mode latency | < 1s (p95) | API response time |
| Direct mode latency | < 5s (p95) | API response time |
| Funnel mode latency | < 15s (p95) | Total execution time |
| Streaming latency | < 500ms | Time to first thinking step |
| Error rate | < 2% | Failed queries / total queries |

### Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily active users | +50% | vs. current system |
| Questions per user | +100% | Average daily queries |
| Template reuse | > 40% | Queries using saved templates |
| Customer coverage | 100% | All customers onboarded |

---

## Appendix: Design Rationale

### Why Kill Form Selection?

**Old Pattern:**
```
User → Choose mode → Select form → Ask question
```

**Problem:**
- Users don't know which form contains the data
- Adds cognitive load upfront
- Conflicts with semantic layer vision

**New Pattern:**
```
User → Ask question → System discovers forms
```

**Benefits:**
- Semantic layer handles form discovery automatically
- Users think in terms of questions, not schemas
- Aligns with ChatGPT mental model

### Why Vertical Funnel?

**Old Pattern:** Horizontal scroll through panels

**Problems:**
- Unusual pattern (most apps use vertical scroll)
- Hard to see full context
- Doesn't work well on mobile

**New Pattern:** Vertical collapsible steps

**Benefits:**
- Familiar pattern (like email threads)
- Natural scrolling behavior
- Better mobile support
- Easier to see progress

### Why Three Modes?

**Alternative:** Always use funnel

**Problem:**
- Overkill for simple queries
- Slows down common cases
- Users don't need breakdown when AI is confident

**Solution:** Progressive complexity
- Template: Instant for known patterns
- Direct: Fast for simple semantic queries
- Funnel: Only when complexity demands it

**Result:**
- 90% of queries feel instant
- 10% get extra help when needed
- User always in control

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-31 | Initial design complete | InsightGen Team |

---

**Next Steps:**
- Review with stakeholders
- Create detailed implementation plan (Phase 7 todos)
- Begin Phase 1 migration (Week 1-2)
