# Adaptive Query Resolution: Confidence-Based Clarification System

**Version:** 1.0
**Last Updated:** 2025-11-06
**Status:** Design Complete, Ready for Implementation
**Document Owner:** InsightGen Team
**Related Documents:**
- `semantic_layer_UI_design.md` - Base UI architecture
- `ARCHITECTURE_V2_SUMMARY.md` - System architecture
- Implementation: `docs/todos/in-progress/adaptive-query-resolution-implementation.md`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Design Philosophy](#design-philosophy)
4. [Architecture Overview](#architecture-overview)
5. [Confidence-Based Routing](#confidence-based-routing)
6. [Ambiguity Detection System](#ambiguity-detection-system)
7. [Enhanced LLM Response Schema](#enhanced-llm-response-schema)
8. [UI/UX Flow](#uiux-flow)
9. [API Design](#api-design)
10. [Database Schema](#database-schema)
11. [Integration with Existing Components](#integration-with-existing-components)
12. [Implementation Phases](#implementation-phases)
13. [Success Metrics](#success-metrics)

---

## Executive Summary

### The Vision

Transform InsightGen from a **single-turn query system** into an **adaptive conversation system** that knows when to generate SQL directly vs. when to ask for clarification, dramatically improving accuracy while maintaining a natural user experience.

### Core Problem

**Current Behavior:**
```
User: "Show me patients with serious wounds"
System: *Assumes "serious" means area > 10 cm²*
        *Generates potentially wrong SQL*
        *Returns results user may not trust*
```

**Desired Behavior:**
```
User: "Show me patients with serious wounds"
System: "How would you like to define 'serious'?"
        ○ Wound size (area > 25 cm²)
        ○ Depth (full thickness)
        ○ Duration (open > 30 days)
        ○ Infection status
User: *Selects "Wound size"*
System: *Generates accurate SQL with user-confirmed definition*
        *Returns trusted results*
```

### Key Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Query Accuracy | ~70% | **95%+** |
| User Trust (NPS) | Unknown | **>80** |
| Clarification Rate | 0% (always assumes) | **20-30%** (when needed) |
| Abandonment after Clarification | N/A | **<10%** |

---

## Problem Statement

### 1. **The Assumption Problem**

When users ask ambiguous questions, the LLM makes assumptions that may be incorrect:

**Example 1: Generic Qualifiers**
```
Question: "Show me patients with large wounds"
Ambiguity: "large" is undefined
Current behavior: LLM guesses (area > 10 cm²)
Impact: Results may not match user intent
```

**Example 2: Missing Context**
```
Question: "What's the average healing time?"
Ambiguity: Which wounds? From when?
Current behavior: LLM assumes "all wounds, all time"
Impact: Answer may be meaningless or misleading
```

**Example 3: Multiple Valid Interpretations**
```
Question: "Which patients are doing well?"
Ambiguity: "Doing well" could mean many things
Current behavior: LLM picks one interpretation
Impact: User gets answer to wrong question
```

### 2. **The JSON Parsing Problem**

Current system expects **only one response format**:

```typescript
{
  "generatedSql": "SELECT ...",
  "explanation": "..."
}
```

When LLM wants to ask for clarification, it has no structured way to do so, leading to:
- JSON parsing errors
- Explanation text becoming too long
- No actionable UI for user to respond

### 3. **The Confidence Blind Spot**

System generates confidence scores but **doesn't act on them**:

```
Intent confidence: 0.8  ✅ Medium-high
Semantic search: 0 forms found  ❌ CRITICAL
Terminology mapping: 1 term  ⚠️ LOW
Overall confidence: 0.44  ❌ FAIL

But system still tries to generate SQL!
```

### 4. **Healthcare-Specific Risk**

In healthcare, **incorrect wound analysis → poor clinical decisions**:

- Wrong cohort selection
- Misclassified severity
- Incorrect trend interpretation
- Compliance/regulatory issues

**Principle:** Better to say "I need clarification" than to return confidently wrong results.

---

## Design Philosophy

### 1. **Fail-Safe Over Fail-Guess**

```
❌ Bad: Assume "serious" means area > 10 cm² (might be wrong)
✅ Good: Ask user to define "serious" from clinical options
```

### 2. **Structured Choices Over Open-Ended Questions**

```
❌ Bad: "Can you clarify what you mean by 'serious'?"
       → User must type a paragraph

✅ Good: Present 4-5 radio button options:
       ○ Wound size > 25 cm²
       ○ Full thickness depth
       ○ Infected status
       ○ Open > 30 days
```

### 3. **Transparency in Assumptions**

Even when generating SQL, **make assumptions explicit**:

```
✅ Query generated with these assumptions:
   • "Recent" = Last 30 days
   • "Active patients" = Assessed in last 90 days
   • Excluded archived records

[Edit Assumptions] [Accept & Run]
```

### 4. **Progressive Disclosure**

**Simple questions** → Direct SQL (no friction)
**Ambiguous questions** → Clarification panel (necessary friction)
**Complex questions** → Multiple clarifications (guided process)

---

## Architecture Overview

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   USER ASKS QUESTION                     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│            CONTEXT DISCOVERY PIPELINE                    │
│  (Intent + Semantic Search + Terminology + Joins)       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │   CONFIDENCE GATE ANALYSIS    │
         │                               │
         │  • Overall confidence         │
         │  • Ambiguous terms detected   │
         │  • Semantic search success    │
         │  • Terminology mapping count  │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌────────────────────┐        ┌──────────────────────┐
│  HIGH CONFIDENCE   │        │  LOW/MEDIUM          │
│  (>0.75)           │        │  CONFIDENCE          │
│  + No Ambiguity    │        │  (<0.75)             │
│  + All Entities OK │        │  OR Ambiguous Terms  │
└────────┬───────────┘        └──────────┬───────────┘
         │                               │
         ▼                               ▼
┌────────────────────┐        ┌──────────────────────┐
│  DIRECT MODE       │        │  CLARIFICATION MODE  │
│                    │        │                      │
│  Generate SQL      │        │  LLM detects:        │
│  Return Results    │        │  • Ambiguous terms   │
│                    │        │  • Missing context   │
│  Optional:         │        │  • Multiple meanings │
│  Show assumptions  │        │                      │
└────────────────────┘        └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  CLARIFICATION UI    │
                              │                      │
                              │  Present options:    │
                              │  ○ Option 1          │
                              │  ○ Option 2          │
                              │  ○ Option 3          │
                              │  ○ Custom            │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  USER SELECTS        │
                              │  OPTIONS             │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  GENERATE SQL        │
                              │  WITH CONSTRAINTS    │
                              │  (Using selections)  │
                              └──────────────────────┘
```

### Key Components

| Component | Responsibility | New/Existing |
|-----------|----------------|--------------|
| **ConfidenceGate** | Decide: Direct vs Clarify | 🆕 NEW |
| **AmbiguityDetector** | Identify ambiguous terms | 🆕 NEW |
| **LLM Dual-Mode** | Return SQL OR clarification | 🔄 ENHANCE |
| **ClarificationPanel** | UI for user selection | 🆕 NEW |
| **QueryHistoryWithFailures** | Save failed/clarified queries | 🔄 ENHANCE |
| **ThreeModeOrchestrator** | Route through confidence gate | 🔄 ENHANCE |

---

## Confidence-Based Routing

### Confidence Calculation

```typescript
interface ConfidenceScore {
  // Individual scores (0.0 - 1.0)
  intentClassification: number;
  semanticSearchSuccess: boolean;
  terminologyMappingCount: number;
  joinPathAvailability: boolean;

  // Weighted overall score
  overall: number;

  // Additional flags
  hasAmbiguousTerms: boolean;
  missingRequiredContext: boolean;
}

function calculateConfidence(context: ContextBundle): ConfidenceScore {
  const intentScore = context.intent.confidence || 0;
  const semanticScore = context.forms.length > 0 ? 1.0 : 0.0;
  const terminologyScore = Math.min(context.terminology.length / 3, 1.0);
  const joinScore = context.joinPaths.length > 0 ? 1.0 : 0.5;

  // Weighted average
  const overall = (
    intentScore * 0.4 +
    semanticScore * 0.3 +
    terminologyScore * 0.2 +
    joinScore * 0.1
  );

  return {
    intentClassification: intentScore,
    semanticSearchSuccess: semanticScore === 1.0,
    terminologyMappingCount: context.terminology.length,
    joinPathAvailability: joinScore === 1.0,
    overall,
    hasAmbiguousTerms: detectAmbiguity(context.question),
    missingRequiredContext: detectMissingContext(context),
  };
}
```

### Decision Logic

```typescript
function shouldRequestClarification(
  confidence: ConfidenceScore,
  question: string
): boolean {
  // Trigger clarification if ANY of:
  return (
    confidence.overall < 0.75 ||                    // Low overall confidence
    !confidence.semanticSearchSuccess ||            // No forms/fields found
    (confidence.terminologyMappingCount === 0 &&   // No terminology mapped
     confidence.intentClassification < 0.9) ||     //   AND low intent score
    confidence.hasAmbiguousTerms ||                // Generic qualifiers detected
    confidence.missingRequiredContext              // Missing time/cohort info
  );
}
```

### Thresholds

| Scenario | Threshold | Action |
|----------|-----------|--------|
| High confidence + Clear terms | >0.85 | **Direct SQL** |
| Medium confidence + Reasonable assumptions | 0.75-0.85 | **SQL with assumption display** |
| Medium confidence + Ambiguous terms | 0.60-0.75 | **Request clarification** |
| Low confidence | <0.60 | **Request clarification** |
| Zero semantic results | N/A | **Request clarification** |

---

## Ambiguity Detection System

### Domain-Specific Dictionary

Build a knowledge base of ambiguous healthcare terms:

```typescript
// lib/services/semantic/ambiguity-dictionary.ts

export interface AmbiguityDefinition {
  term: string;
  type: 'quantifier' | 'severity' | 'temporal' | 'status';
  appliesTo: string[];  // ['wound', 'patient', '*']
  clarificationOptions: ClarificationOption[];
}

export interface ClarificationOption {
  id: string;
  label: string;
  description: string;
  sqlConstraint: string;
  isDefault?: boolean;
}

export const AMBIGUITY_DICTIONARY: Record<string, AmbiguityDefinition> = {
  // Size qualifiers
  'large': {
    term: 'large',
    type: 'quantifier',
    appliesTo: ['wound', 'ulcer', 'lesion'],
    clarificationOptions: [
      {
        id: 'size_10',
        label: 'Area > 10 cm²',
        description: 'Wounds with surface area greater than 10 square centimeters',
        sqlConstraint: 'area > 10',
      },
      {
        id: 'size_25',
        label: 'Area > 25 cm²',
        description: 'Wounds with surface area greater than 25 square centimeters',
        sqlConstraint: 'area > 25',
        isDefault: true,
      },
      {
        id: 'size_50',
        label: 'Area > 50 cm²',
        description: 'Very large wounds (>50 cm²)',
        sqlConstraint: 'area > 50',
      },
      {
        id: 'size_percentile',
        label: 'Top 20% largest wounds',
        description: 'Wounds in the top 20th percentile by size',
        sqlConstraint: 'percentile_rank(area) > 0.8',
      },
    ],
  },

  'small': {
    term: 'small',
    type: 'quantifier',
    appliesTo: ['wound', 'ulcer', 'lesion'],
    clarificationOptions: [
      {
        id: 'size_lt_5',
        label: 'Area < 5 cm²',
        description: 'Wounds smaller than 5 square centimeters',
        sqlConstraint: 'area < 5',
        isDefault: true,
      },
      {
        id: 'size_lt_10',
        label: 'Area < 10 cm²',
        description: 'Wounds smaller than 10 square centimeters',
        sqlConstraint: 'area < 10',
      },
      {
        id: 'size_bottom_percentile',
        label: 'Bottom 20% smallest wounds',
        description: 'Wounds in the bottom 20th percentile by size',
        sqlConstraint: 'percentile_rank(area) < 0.2',
      },
    ],
  },

  // Severity qualifiers
  'serious': {
    term: 'serious',
    type: 'severity',
    appliesTo: ['wound', 'condition', 'infection'],
    clarificationOptions: [
      {
        id: 'severity_depth',
        label: 'Full thickness wounds',
        description: 'Wounds that penetrate through all skin layers (Stage 3/4)',
        sqlConstraint: "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')",
        isDefault: true,
      },
      {
        id: 'severity_infection',
        label: 'Infected wounds',
        description: 'Wounds showing signs of infection',
        sqlConstraint: 'infected = true',
      },
      {
        id: 'severity_duration',
        label: 'Non-healing (>60 days)',
        description: 'Wounds that have been open for more than 60 days',
        sqlConstraint: 'daysOpen > 60',
      },
      {
        id: 'severity_size',
        label: 'Large wounds (>25 cm²)',
        description: 'Wounds with area greater than 25 cm²',
        sqlConstraint: 'area > 25',
      },
    ],
  },

  'severe': {
    term: 'severe',
    type: 'severity',
    appliesTo: ['wound', 'condition'],
    clarificationOptions: [
      // Same as 'serious' - they're synonyms
      {
        id: 'severity_depth',
        label: 'Full thickness wounds',
        description: 'Wounds that penetrate through all skin layers (Stage 3/4)',
        sqlConstraint: "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')",
        isDefault: true,
      },
      {
        id: 'severity_infection',
        label: 'Infected wounds',
        description: 'Wounds showing signs of infection',
        sqlConstraint: 'infected = true',
      },
    ],
  },

  // Time qualifiers
  'recent': {
    term: 'recent',
    type: 'temporal',
    appliesTo: ['*'],
    clarificationOptions: [
      {
        id: 'time_7d',
        label: 'Last 7 days',
        description: 'Data from the past week',
        sqlConstraint: "date > NOW() - INTERVAL '7 days'",
      },
      {
        id: 'time_30d',
        label: 'Last 30 days',
        description: 'Data from the past month',
        sqlConstraint: "date > NOW() - INTERVAL '30 days'",
        isDefault: true,
      },
      {
        id: 'time_90d',
        label: 'Last 90 days',
        description: 'Data from the past quarter',
        sqlConstraint: "date > NOW() - INTERVAL '90 days'",
      },
    ],
  },

  'old': {
    term: 'old',
    type: 'temporal',
    appliesTo: ['wound', 'assessment'],
    clarificationOptions: [
      {
        id: 'time_gt_30d',
        label: 'More than 30 days old',
        description: 'Items created more than 30 days ago',
        sqlConstraint: "date < NOW() - INTERVAL '30 days'",
      },
      {
        id: 'time_gt_90d',
        label: 'More than 90 days old',
        description: 'Items created more than 90 days ago',
        sqlConstraint: "date < NOW() - INTERVAL '90 days'",
        isDefault: true,
      },
      {
        id: 'time_gt_180d',
        label: 'More than 6 months old',
        description: 'Items created more than 6 months ago',
        sqlConstraint: "date < NOW() - INTERVAL '180 days'",
      },
    ],
  },

  // Status qualifiers
  'doing well': {
    term: 'doing well',
    type: 'status',
    appliesTo: ['patient', 'wound'],
    clarificationOptions: [
      {
        id: 'status_healing',
        label: 'Wounds are healing',
        description: 'Wound size is decreasing over time',
        sqlConstraint: 'trend_direction = "decreasing"',
        isDefault: true,
      },
      {
        id: 'status_no_infection',
        label: 'No infections present',
        description: 'No wounds showing signs of infection',
        sqlConstraint: 'infected = false',
      },
      {
        id: 'status_compliance',
        label: 'Regular assessments',
        description: 'Patients with assessments in last 30 days',
        sqlConstraint: 'last_assessment_date > NOW() - INTERVAL \'30 days\'',
      },
      {
        id: 'status_no_new_wounds',
        label: 'No new wounds recently',
        description: 'No new wounds created in last 30 days',
        sqlConstraint: 'NOT EXISTS (SELECT 1 FROM rpt.Wound WHERE patientId = p.id AND createdDate > NOW() - INTERVAL \'30 days\')',
      },
    ],
  },

  'improving': {
    term: 'improving',
    type: 'status',
    appliesTo: ['patient', 'wound'],
    clarificationOptions: [
      {
        id: 'improving_size',
        label: 'Wound size decreasing',
        description: 'Wound area is getting smaller',
        sqlConstraint: 'trend_direction = "decreasing"',
        isDefault: true,
      },
      {
        id: 'improving_healed',
        label: 'Wounds healing/closing',
        description: 'Wounds transitioning to healed status',
        sqlConstraint: 'status = "Healed" OR healedDate IS NOT NULL',
      },
    ],
  },
};

// Detection function
export function detectAmbiguousTerms(question: string): string[] {
  const lowerQuestion = question.toLowerCase();
  const found: string[] = [];

  for (const [term, _] of Object.entries(AMBIGUITY_DICTIONARY)) {
    if (lowerQuestion.includes(term)) {
      found.push(term);
    }
  }

  return found;
}

// Get clarification for a term
export function getClarificationForTerm(
  term: string,
  context: string = ''
): AmbiguityDefinition | null {
  const definition = AMBIGUITY_DICTIONARY[term.toLowerCase()];
  if (!definition) return null;

  // Filter options based on context if needed
  // For now, return all options
  return definition;
}
```

### Ambiguity Detection Service

```typescript
// lib/services/semantic/ambiguity-detector.service.ts

import { detectAmbiguousTerms, getClarificationForTerm, AMBIGUITY_DICTIONARY } from './ambiguity-dictionary';
import type { ContextBundle } from '../context-discovery/types';

export interface AmbiguityAnalysis {
  hasAmbiguity: boolean;
  ambiguousTerms: string[];
  clarifications: ClarificationRequest[];
  missingContext: MissingContextType[];
}

export interface ClarificationRequest {
  id: string;
  ambiguousTerm: string;
  question: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    sqlConstraint: string;
  }>;
  allowCustom: boolean;
}

export type MissingContextType =
  | 'time_window'      // No time range for trends/averages
  | 'cohort'           // No patient/wound subset defined
  | 'aggregation_type' // Plural without "how many" or "average"
  | 'metric_definition'; // Ambiguous metric (e.g., "healing")

export function analyzeAmbiguity(
  question: string,
  context: ContextBundle
): AmbiguityAnalysis {
  const ambiguousTerms = detectAmbiguousTerms(question);
  const clarifications: ClarificationRequest[] = [];

  // Generate clarifications for each ambiguous term
  for (const term of ambiguousTerms) {
    const definition = getClarificationForTerm(term, question);
    if (definition) {
      clarifications.push({
        id: `clarify_${term.replace(/\s+/g, '_')}`,
        ambiguousTerm: term,
        question: `How would you like to define "${term}"?`,
        options: definition.clarificationOptions,
        allowCustom: true,
      });
    }
  }

  // Detect missing context
  const missingContext = detectMissingContext(question, context);

  // Add clarifications for missing context
  if (missingContext.includes('time_window')) {
    clarifications.push({
      id: 'clarify_time_window',
      ambiguousTerm: 'time range',
      question: 'What time period should I analyze?',
      options: [
        {
          id: 'time_7d',
          label: 'Last 7 days',
          description: 'Most recent week of data',
          sqlConstraint: "date > NOW() - INTERVAL '7 days'",
        },
        {
          id: 'time_30d',
          label: 'Last 30 days',
          description: 'Past month',
          sqlConstraint: "date > NOW() - INTERVAL '30 days'",
        },
        {
          id: 'time_90d',
          label: 'Last 90 days',
          description: 'Past quarter',
          sqlConstraint: "date > NOW() - INTERVAL '90 days'",
        },
        {
          id: 'time_all',
          label: 'All available data',
          description: 'No time restriction',
          sqlConstraint: "1=1",
        },
      ],
      allowCustom: false,
    });
  }

  if (missingContext.includes('cohort')) {
    clarifications.push({
      id: 'clarify_cohort',
      ambiguousTerm: 'patient group',
      question: 'Which patients should I include?',
      options: [
        {
          id: 'cohort_all',
          label: 'All patients',
          description: 'No patient filtering',
          sqlConstraint: "1=1",
        },
        {
          id: 'cohort_active',
          label: 'Active patients only',
          description: 'Patients with assessments in last 90 days',
          sqlConstraint: "EXISTS (SELECT 1 FROM rpt.Assessment WHERE patientId = p.id AND date > NOW() - INTERVAL '90 days')",
        },
        {
          id: 'cohort_current_wounds',
          label: 'Patients with current wounds',
          description: 'Patients with open/active wounds',
          sqlConstraint: "EXISTS (SELECT 1 FROM rpt.Wound WHERE patientId = p.id AND (status != 'Healed' OR healedDate IS NULL))",
        },
      ],
      allowCustom: false,
    });
  }

  return {
    hasAmbiguity: clarifications.length > 0,
    ambiguousTerms,
    clarifications,
    missingContext,
  };
}

function detectMissingContext(
  question: string,
  context: ContextBundle
): MissingContextType[] {
  const missing: MissingContextType[] = [];
  const lowerQuestion = question.toLowerCase();

  // Check for temporal queries without time specification
  const temporalKeywords = ['average', 'trend', 'over time', 'change', 'rate'];
  const hasTemporalIntent = temporalKeywords.some(kw => lowerQuestion.includes(kw));
  const hasTimeSpec = /last \d+|past \d+|recent|since|from.*to/i.test(lowerQuestion);

  if (hasTemporalIntent && !hasTimeSpec) {
    missing.push('time_window');
  }

  // Check for queries that need cohort definition
  const generalTerms = ['patients', 'wounds', 'assessments'];
  const hasGeneralTerm = generalTerms.some(term => lowerQuestion.includes(term));
  const hasSpecificFilter = context.intent.filters && context.intent.filters.length > 0;

  if (hasGeneralTerm && !hasSpecificFilter && !lowerQuestion.includes('all')) {
    missing.push('cohort');
  }

  return missing;
}
```

---

## Enhanced LLM Response Schema

### Dual-Mode Response Type

```typescript
// lib/prompts/generate-query.prompt.ts (enhanced)

export type LLMResponseType = 'sql' | 'clarification';

export interface LLMSQLResponse {
  responseType: 'sql';
  generatedSql: string;
  explanation: string;
  confidence: number;
  assumptions?: Assumption[];  // What was assumed
}

export interface Assumption {
  term: string;
  assumedValue: string;
  reasoning: string;
  confidence: number;
}

export interface LLMClarificationResponse {
  responseType: 'clarification';
  clarifications: ClarificationRequest[];
  reasoning: string;  // Why clarification is needed
  partialContext?: {  // What we DO understand
    intent: string;
    formsIdentified: string[];
    termsUnderstood: string[];
  };
}

export type LLMResponse = LLMSQLResponse | LLMClarificationResponse;
```

### Updated System Prompt

```typescript
export const GENERATE_QUERY_PROMPT_V2 = `
You are a healthcare data SQL generator that prioritizes accuracy over speed.

# Core Principle: Fail-Safe Over Fail-Guess

NEVER make assumptions about ambiguous terms. When in doubt, ASK for clarification.

# Response Decision Tree

Your response must be a JSON object with EITHER:

## Option A: Direct SQL Generation

Use when:
- All terms are clearly defined
- Confidence > 0.8
- All necessary forms/fields found
- No ambiguous qualifiers

Response format:
{
  "responseType": "sql",
  "generatedSql": "SELECT ...",
  "explanation": "Clear explanation of what the query does",
  "confidence": 0.85,
  "assumptions": [
    {
      "term": "active patients",
      "assumedValue": "patients with assessments in last 90 days",
      "reasoning": "Standard clinical definition of patient activity",
      "confidence": 0.9
    }
  ]
}

## Option B: Request Clarification

Use when:
- Ambiguous terms detected (large, serious, recent, etc.)
- Missing required context (time window, cohort)
- Multiple valid interpretations
- Confidence < 0.75
- Semantic search found no relevant forms

Response format:
{
  "responseType": "clarification",
  "clarifications": [
    {
      "id": "clarify_serious",
      "ambiguousTerm": "serious wound",
      "question": "How would you like to define a 'serious' wound?",
      "options": [
        {
          "id": "size_based",
          "label": "By size (area > 25 cm²)",
          "description": "Wounds with surface area greater than 25 square centimeters",
          "sqlConstraint": "area > 25"
        },
        {
          "id": "depth_based",
          "label": "By depth (full thickness)",
          "description": "Full thickness wounds that penetrate through all skin layers",
          "sqlConstraint": "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')"
        },
        {
          "id": "infection_based",
          "label": "By infection status",
          "description": "Wounds showing signs of infection",
          "sqlConstraint": "infected = true"
        },
        {
          "id": "duration_based",
          "label": "By duration (open > 30 days)",
          "description": "Non-healing wounds open for more than 30 days",
          "sqlConstraint": "daysOpen > 30"
        }
      ],
      "allowCustom": true
    }
  ],
  "reasoning": "The term 'serious' is not a standard medical classification in the database schema. Multiple clinical metrics could define wound severity. Asking for clarification ensures we provide accurate results aligned with your clinical intent.",
  "partialContext": {
    "intent": "Identify patients with severe wounds",
    "formsIdentified": ["Wound Assessment", "Patient Demographics"],
    "termsUnderstood": ["wounds", "patients"]
  }
}

# Ambiguity Detection Guide

ALWAYS request clarification for these terms:

**Size qualifiers:** large, small, big, tiny, significant
- Ask user to specify: exact threshold, percentile, or clinical definition

**Severity qualifiers:** serious, severe, mild, moderate, critical
- Offer options: size-based, depth-based, infection status, duration

**Time qualifiers:** recent, old, new, current, latest
- Ask for specific time window: 7d, 30d, 90d, all time

**Status qualifiers:** doing well, improving, worsening, stable
- Define what "doing well" means: healing trend, no infection, compliance, etc.

**Vague aggregations:** average, typical, usual, normal
- Ask for time window and cohort definition

# Examples

## Example 1: Ambiguous Query

User: "Show me patients with large wounds"

CORRECT Response:
{
  "responseType": "clarification",
  "clarifications": [{
    "id": "clarify_large",
    "ambiguousTerm": "large",
    "question": "How would you like to define 'large' wounds?",
    "options": [...]
  }],
  "reasoning": "..."
}

WRONG Response:
{
  "responseType": "sql",
  "generatedSql": "SELECT * FROM ... WHERE area > 10",  // ❌ Assumption!
  ...
}

## Example 2: Clear Query with Minor Assumption

User: "Show me active patients in the AML clinic"

CORRECT Response:
{
  "responseType": "sql",
  "generatedSql": "SELECT ...",
  "confidence": 0.85,
  "assumptions": [
    {
      "term": "active patients",
      "assumedValue": "patients with assessments in last 90 days",
      "reasoning": "Standard definition of patient activity",
      "confidence": 0.9
    }
  ]
}

This is acceptable because:
- "Active" has a reasonable clinical definition
- "AML clinic" is specific and found in data
- Assumption is surfaced for user review

# Important Notes

1. If confidence < 0.75, ALWAYS use "clarification" mode
2. If semantic search found 0 forms, ALWAYS clarify
3. If user question has ANY term from the ambiguity list, ALWAYS clarify
4. Multiple clarifications are OK (show them all in one response)
5. Provide 3-5 options per clarification (not too many, not too few)
6. Options should cover the most common clinical interpretations
7. Always include "allowCustom": true to let users type their own definition

REMEMBER: A system that admits uncertainty is more trustworthy than one that guesses confidently.
`;
```

---

## UI/UX Flow

### Clarification Panel Component

```typescript
// app/insights/new/components/ClarificationPanel.tsx

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { AlertCircle, HelpCircle } from "lucide-react";

export interface ClarificationPanelProps {
  clarifications: Array<{
    id: string;
    ambiguousTerm: string;
    question: string;
    options: Array<{
      id: string;
      label: string;
      description?: string;
      sqlConstraint: string;
    }>;
    allowCustom: boolean;
  }>;
  reasoning: string;
  partialContext?: {
    intent: string;
    formsIdentified: string[];
    termsUnderstood: string[];
  };
  onSubmit: (selections: Record<string, string>) => void;
  onCancel: () => void;
}

export function ClarificationPanel({
  clarifications,
  reasoning,
  partialContext,
  onSubmit,
  onCancel,
}: ClarificationPanelProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const allQuestionsAnswered = clarifications.every(
    (c) => selections[c.id] !== undefined
  );

  const handleSubmit = () => {
    const finalSelections: Record<string, string> = {};

    for (const clarification of clarifications) {
      const selection = selections[clarification.id];

      if (selection === 'custom') {
        finalSelections[clarification.id] = customValues[clarification.id] || '';
      } else {
        const option = clarification.options.find((opt) => opt.id === selection);
        finalSelections[clarification.id] = option?.sqlConstraint || '';
      }
    }

    onSubmit(finalSelections);
  };

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6 my-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle className="h-6 w-6 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 text-lg">
            I need some clarification before generating results
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            {reasoning}
          </p>
        </div>
      </div>

      {/* Partial Context (what we DO understand) */}
      {partialContext && (
        <div className="bg-white/50 rounded p-3 mb-4 text-sm">
          <p className="font-medium text-gray-700 mb-2">✓ What I understand so far:</p>
          <ul className="text-gray-600 space-y-1">
            <li>• Intent: {partialContext.intent}</li>
            {partialContext.formsIdentified.length > 0 && (
              <li>• Forms: {partialContext.formsIdentified.join(', ')}</li>
            )}
            {partialContext.termsUnderstood.length > 0 && (
              <li>• Terms: {partialContext.termsUnderstood.join(', ')}</li>
            )}
          </ul>
        </div>
      )}

      {/* Clarification Questions */}
      <div className="space-y-6">
        {clarifications.map((clarification, idx) => (
          <div key={clarification.id} className="bg-white rounded-lg border border-amber-200 p-4">
            <Label className="text-base font-medium text-gray-900 mb-3 block">
              {idx + 1}. {clarification.question}
            </Label>

            <RadioGroup
              value={selections[clarification.id]}
              onValueChange={(val) => setSelections({ ...selections, [clarification.id]: val })}
              className="space-y-3"
            >
              {clarification.options.map((option) => (
                <div key={option.id} className="flex items-start gap-3">
                  <RadioGroupItem
                    value={option.id}
                    id={`${clarification.id}-${option.id}`}
                    className="mt-1"
                  />
                  <Label
                    htmlFor={`${clarification.id}-${option.id}`}
                    className="font-normal cursor-pointer flex-1"
                  >
                    <div className="font-medium text-gray-900">{option.label}</div>
                    {option.description && (
                      <div className="text-xs text-gray-500 mt-1">
                        {option.description}
                      </div>
                    )}
                  </Label>
                </div>
              ))}

              {clarification.allowCustom && (
                <div className="flex items-start gap-3">
                  <RadioGroupItem
                    value="custom"
                    id={`${clarification.id}-custom`}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={`${clarification.id}-custom`}
                      className="font-medium text-gray-900 cursor-pointer block mb-2"
                    >
                      Custom definition
                    </Label>
                    {selections[clarification.id] === 'custom' && (
                      <Input
                        placeholder="Enter your definition (e.g., area > 15)"
                        value={customValues[clarification.id] || ''}
                        onChange={(e) => setCustomValues({
                          ...customValues,
                          [clarification.id]: e.target.value
                        })}
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>
              )}
            </RadioGroup>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t border-amber-200">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="text-amber-700 hover:text-amber-900"
        >
          Cancel
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={!allQuestionsAnswered}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          Generate Query with These Selections
        </Button>
      </div>

      {/* Helper Text */}
      <div className="flex items-start gap-2 mt-4 text-xs text-amber-700">
        <HelpCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          Your selections will be used to generate an accurate SQL query. You can always
          refine the results after seeing them.
        </p>
      </div>
    </div>
  );
}
```

### Complete User Flow

**Scenario: User asks "Show me patients with serious wounds"**

```
Step 1: User Input
┌──────────────────────────────────────────┐
│ Q: Show me patients with serious wounds  │
│                                 [Ask →]  │
└──────────────────────────────────────────┘

Step 2: Thinking Stream (Visible)
┌──────────────────────────────────────────┐
│ ▼ Understanding your question... (1.2s)  │
│   ✓ Intent: patient_cohort_analysis      │
│   ✓ Forms: Wound Assessment              │
│   ⚠ Ambiguous term detected: "serious"   │
└──────────────────────────────────────────┘

Step 3: Clarification Panel (Expanded)
┌──────────────────────────────────────────┐
│ 🔶 I need clarification                  │
│                                          │
│ Your question contains the ambiguous     │
│ term "serious". Let me help you define   │
│ it precisely.                            │
│                                          │
│ 1. How would you like to define          │
│    "serious" wounds?                     │
│                                          │
│ ○ By size (area > 25 cm²)               │
│   Wounds larger than 25 cm²              │
│                                          │
│ ○ By depth (full thickness)              │
│   Stage 3/4 wounds                       │
│                                          │
│ ○ By infection status                    │
│   Wounds showing infection               │
│                                          │
│ ○ By duration (open > 30 days)           │
│   Non-healing wounds                     │
│                                          │
│ ○ Custom definition                      │
│   [Enter your own criteria]              │
│                                          │
│        [Cancel]  [Generate Query →]      │
└──────────────────────────────────────────┘

Step 4: User Selects "By depth"
(Selection stored in conversation state)

Step 5: Query Generated with Constraint
┌──────────────────────────────────────────┐
│ ▼ Generating query... (0.8s)             │
│   ✓ Using: depth IN ('Full Thickness',  │
│             'Stage 3', 'Stage 4')        │
│   ✓ SQL validated                        │
└──────────────────────────────────────────┘

Step 6: Results Displayed
┌──────────────────────────────────────────┐
│ Results (42 patients)                    │
│                                          │
│ Showing patients with serious wounds     │
│ (defined as: full thickness depth)       │
│                                          │
│ [Table showing 42 patients]              │
│                                          │
│ [Chart] [Save] [Export] [Refine]        │
└──────────────────────────────────────────┘
```

---

## API Design

### Enhanced Ask Endpoint

```typescript
// app/api/insights/ask/route.ts (enhanced)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ThreeModeOrchestrator } from "@/lib/services/semantic/three-mode-orchestrator.service";
import { analyzeAmbiguity } from "@/lib/services/semantic/ambiguity-detector.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { question, customerId, modelId, clarifications } = await req.json();

    if (!question || !customerId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const orchestrator = new ThreeModeOrchestrator();

    // If clarifications provided, this is a follow-up request
    if (clarifications) {
      // Re-run with clarifications applied
      const result = await orchestrator.askWithClarifications(
        question,
        customerId,
        clarifications,
        modelId
      );

      return NextResponse.json(result);
    }

    // Initial request
    const result = await orchestrator.ask(question, customerId, modelId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/insights/ask] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
```

### Orchestrator Enhancement

```typescript
// lib/services/semantic/three-mode-orchestrator.service.ts (enhanced)

import { analyzeAmbiguity } from './ambiguity-detector.service';
import type { LLMResponse } from '@/lib/prompts/generate-query.prompt';

export interface OrchestrationResult {
  mode: QueryMode;
  question: string;
  thinking: ThinkingStep[];

  // SQL mode response
  sql?: string;
  results?: {
    rows: any[];
    columns: string[];
  };
  assumptions?: Assumption[];
  confidence?: number;

  // Clarification mode response
  requiresClarification?: boolean;
  clarifications?: ClarificationRequest[];
  clarificationReasoning?: string;
  partialContext?: any;

  // Common fields
  template?: string;
  context?: any;
  funnel?: any;
}

export class ThreeModeOrchestrator {
  async ask(
    question: string,
    customerId: string,
    modelId?: string
  ): Promise<OrchestrationResult> {
    const thinking: ThinkingStep[] = [];
    const startTime = Date.now();

    // Step 1: Context Discovery (unchanged)
    const context = await this.contextDiscovery.discoverContext({
      customerId,
      question,
      userId: 1,
      modelId,
    });

    // Step 2: Ambiguity Analysis (NEW)
    thinking.push({
      id: "ambiguity_check",
      status: "running",
      message: "Checking for ambiguous terms...",
    });

    const ambiguityAnalysis = analyzeAmbiguity(question, context);

    if (ambiguityAnalysis.hasAmbiguity) {
      thinking[thinking.length - 1].status = "complete";
      thinking[thinking.length - 1].details = {
        ambiguousTerms: ambiguityAnalysis.ambiguousTerms,
        clarificationCount: ambiguityAnalysis.clarifications.length,
      };

      // Return clarification request
      return {
        mode: "clarification",
        question,
        thinking,
        requiresClarification: true,
        clarifications: ambiguityAnalysis.clarifications,
        clarificationReasoning: `Found ${ambiguityAnalysis.ambiguousTerms.length} ambiguous terms: ${ambiguityAnalysis.ambiguousTerms.join(', ')}`,
        partialContext: {
          intent: context.intent.type,
          formsIdentified: context.forms?.map(f => f.formName) || [],
          termsUnderstood: context.terminology?.map(t => t.userTerm) || [],
        },
      };
    }

    thinking[thinking.length - 1].status = "complete";
    thinking[thinking.length - 1].message = "No ambiguity detected";

    // Continue with normal flow...
    // (existing template/direct/funnel logic)
  }

  async askWithClarifications(
    originalQuestion: string,
    customerId: string,
    clarifications: Record<string, string>,
    modelId?: string
  ): Promise<OrchestrationResult> {
    // Augment the question with clarification constraints
    const constrainedQuestion = this.applyClari fications(
      originalQuestion,
      clarifications
    );

    // Re-run discovery with constraints
    const context = await this.contextDiscovery.discoverContext({
      customerId,
      question: constrainedQuestion,
      userId: 1,
      modelId,
      additionalConstraints: clarifications, // Pass constraints to LLM
    });

    // Generate SQL with clarifications applied
    const { sql, executionPlan, assumptions } = await generateSQLWithLLM(
      context,
      customerId,
      modelId,
      clarifications // Pass to LLM prompt
    );

    // Execute and return results
    const results = await this.executeSQL(sql, customerId);

    return {
      mode: "direct",
      question: originalQuestion,
      thinking: [], // Simplified for clarified queries
      sql,
      results,
      assumptions,
      confidence: 0.95, // High confidence when user confirmed
      context: {
        clarificationsApplied: clarifications,
      },
    };
  }

  private applyClari fications(
    question: string,
    clarifications: Record<string, string>
  ): string {
    // Transform clarifications into constraint text
    let augmented = question;

    for (const [key, constraint] of Object.entries(clarifications)) {
      augmented += ` [CONSTRAINT: ${key} = ${constraint}]`;
    }

    return augmented;
  }
}
```

---

## Database Schema

### Conversation State Tracking

```sql
-- Migration 027: Add conversation state for clarifications
-- Purpose: Track multi-turn clarification conversations
-- Dependencies: 023_create_query_history.sql

BEGIN;

-- Conversation thread table
CREATE TABLE IF NOT EXISTS "ConversationThread" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "originalQuestion" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL CHECK ("status" IN ('pending_clarification', 'clarified', 'completed', 'abandoned')),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Clarification responses
CREATE TABLE IF NOT EXISTS "ClarificationResponse" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThread"(id) ON DELETE CASCADE,
  "clarificationId" TEXT NOT NULL,  -- e.g., 'clarify_serious'
  "selectedOption" TEXT NOT NULL,    -- Option ID or custom value
  "sqlConstraint" TEXT NOT NULL,     -- The SQL constraint applied
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_thread_user_customer
ON "ConversationThread" ("userId", "customerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_thread_status
ON "ConversationThread" ("status", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_clarification_response_thread
ON "ClarificationResponse" ("threadId");

-- Comments
COMMENT ON TABLE "ConversationThread" IS 'Tracks multi-turn clarification conversations';
COMMENT ON TABLE "ClarificationResponse" IS 'Stores user responses to clarification questions';

COMMIT;
```

---

## Integration with Existing Components

### 1. **Three-Mode Orchestrator**

**Current:** Routes through Template → Direct → Funnel
**Enhancement:** Add ambiguity gate before mode selection

```typescript
// BEFORE
ask() {
  match = matchTemplate();
  if (match) return executeTemplate();

  complexity = analyzeComplexity();
  if (complexity === 'simple') return executeDirect();
  return executeFunnel();
}

// AFTER
ask() {
  match = matchTemplate();
  if (match) return executeTemplate();

  // NEW: Ambiguity gate
  ambiguity = analyzeAmbiguity();
  if (ambiguity.hasAmbiguity) return requestClarification();

  complexity = analyzeComplexity();
  if (complexity === 'simple') return executeDirect();
  return executeFunnel();
}
```

### 2. **Context Discovery Pipeline**

**Current:** Returns ContextBundle with confidence scores
**Enhancement:** Add ambiguity analysis to context

```typescript
// BEFORE
interface ContextBundle {
  intent: Intent;
  forms: Form[];
  fields: Field[];
  terminology: Terminology[];
  joinPaths: JoinPath[];
  overallConfidence: number;
}

// AFTER
interface ContextBundle {
  intent: Intent;
  forms: Form[];
  fields: Field[];
  terminology: Terminology[];
  joinPaths: JoinPath[];
  overallConfidence: number;

  // NEW
  ambiguityAnalysis?: AmbiguityAnalysis;
  suggestedClarifications?: ClarificationRequest[];
}
```

### 3. **LLM SQL Generator**

**Current:** Returns only SQL
**Enhancement:** Can return SQL OR clarification request

```typescript
// BEFORE
async function generateSQLWithLLM(context): Promise<{ sql: string }> {
  const response = await llm.complete(prompt);
  return { sql: response.generatedSql };
}

// AFTER
async function generateSQLWithLLM(
  context,
  clarifications?: Record<string, string>
): Promise<LLMResponse> {
  const prompt = buildPrompt(context, clarifications);
  const response = await llm.complete(prompt);

  if (response.responseType === 'clarification') {
    return response; // Return clarification request
  }

  return response; // Return SQL
}
```

### 4. **Query History**

**Current:** Saves only successful queries
**Enhancement:** Also save clarified queries with context

```sql
-- Add clarification context to QueryHistory
ALTER TABLE "QueryHistory"
ADD COLUMN "clarificationsApplied" JSONB NULL;

COMMENT ON COLUMN "QueryHistory"."clarificationsApplied"
IS 'User selections from clarification dialog (if any)';
```

### 5. **UI Components**

**Reuse:**
- `ThinkingStream.tsx` - Add ambiguity check step
- `InsightResults.tsx` - Show clarification-applied badge
- `ActionsPanel.tsx` - Add "Edit Clarifications" button

**New:**
- `ClarificationPanel.tsx` - Main clarification UI
- `AssumptionsPanel.tsx` - Show LLM assumptions

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Core infrastructure without UI

**Tasks:**
1. Create ambiguity dictionary (`ambiguity-dictionary.ts`)
2. Implement ambiguity detector service
3. Add confidence gate logic to orchestrator
4. Update LLM prompt to support dual-mode response
5. Add database migration for conversation state
6. Write unit tests for ambiguity detection

**Exit Criteria:**
- [ ] Ambiguity dictionary covers 20+ common terms
- [ ] Detector identifies ambiguous questions correctly
- [ ] Confidence gate makes correct route decisions
- [ ] LLM prompt generates clarification responses
- [ ] All tests pass

### Phase 2: API Enhancement (Week 3)

**Goal:** API supports clarification flow

**Tasks:**
1. Enhance `/api/insights/ask` to handle clarifications
2. Add `askWithClarifications()` to orchestrator
3. Implement constraint application logic
4. Add conversation state persistence
5. Test multi-turn conversations
6. Add logging for clarification metrics

**Exit Criteria:**
- [ ] API accepts clarification responses
- [ ] SQL generated with constraints applied
- [ ] Conversation state persisted correctly
- [ ] Postman tests pass for clarification flow

### Phase 3: UI Implementation (Week 4-5)

**Goal:** User-facing clarification experience

**Tasks:**
1. Create `ClarificationPanel.tsx` component
2. Add clarification state management to `useInsights` hook
3. Integrate panel into insights page
4. Add "Edit Clarifications" action
5. Show applied clarifications in results
6. Add assumptions display panel
7. Design loading states for clarification mode

**Exit Criteria:**
- [ ] Clarification panel renders correctly
- [ ] User can select options and submit
- [ ] Custom values supported
- [ ] UI shows what constraints were applied
- [ ] Mobile-responsive design

### Phase 4: Domain Expansion (Week 6)

**Goal:** Expand ambiguity coverage

**Tasks:**
1. Add 30+ more healthcare-specific terms
2. Add compound clarifications (multiple terms)
3. Add context-aware option filtering
4. Implement "smart defaults" based on customer
5. Add clarification templates for common scenarios

**Exit Criteria:**
- [ ] Dictionary covers 50+ ambiguous terms
- [ ] Complex questions handled (2-3 clarifications)
- [ ] Smart defaults reduce clicks by 30%

### Phase 5: Intelligence & Learning (Week 7-8)

**Goal:** System learns from user selections

**Tasks:**
1. Track which clarifications users select most
2. Build customer-specific default preferences
3. Implement "Remember my preference" feature
4. Add A/B testing for clarification options
5. Create analytics dashboard for clarification metrics

**Exit Criteria:**
- [ ] User preferences stored and reused
- [ ] Clarification rate decreases over time
- [ ] Analytics show improvement trends

---

## Success Metrics

### Accuracy Metrics

| Metric | Baseline | 3 Months | 6 Months | Target |
|--------|----------|----------|----------|--------|
| SQL Accuracy | 70% | 85% | 92% | **95%+** |
| Queries Requiring Clarification | 0% | 25% | 22% | 20-30% |
| User Satisfaction (NPS) | Unknown | 65 | 75 | **80+** |

### Efficiency Metrics

| Metric | Target |
|--------|--------|
| Average Time to Final SQL (including clarification) | <90 seconds |
| Clarification Abandonment Rate | <10% |
| Repeat Clarification Rate (same user, same term) | <5% |

### Trust Metrics

| Metric | Target |
|--------|--------|
| % Users Who Accept Results Without Editing SQL | >80% |
| % Users Who Save Clarified Queries | >60% |
| Repeat Usage Rate (weekly active users) | >70% |

### Quality Indicators

- **Assumption Accuracy:** % of assumptions users accept without editing
- **Clarification Effectiveness:** % of clarified queries that run successfully
- **User Learning Curve:** Time to first successful query (new vs. returning users)

---

## Appendix

### A. Example Ambiguous Questions

**Simple Ambiguity:**
1. "Show me large wounds" → Size definition needed
2. "What's the recent infection rate?" → Time window needed
3. "Which patients are doing well?" → "Doing well" definition needed

**Complex Ambiguity:**
4. "Show me patients with serious wounds who are improving" → 2 clarifications
5. "What's the average healing time for large diabetic wounds?" → Size + time window

**Missing Context:**
6. "Show me wound trends" → Time window + metric definition needed
7. "Compare healing rates" → Cohorts to compare + time window needed

### B. Clarification UI Examples

See wireframes in `/docs/design/semantic_layer/clarification-ui-mockups.png`

### C. LLM Prompt Examples

Full prompts available in `/lib/prompts/generate-query-v2.prompt.ts`

---

**Document History:**
- v1.0 (2025-11-06): Initial design document created
