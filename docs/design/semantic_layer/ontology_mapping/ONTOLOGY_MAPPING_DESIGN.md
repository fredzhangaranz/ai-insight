# Ontology Mapping Design - Comprehensive Specification

**Version:** 1.0
**Date:** 2025-11-17
**Status:** Design Proposal
**Authors:** Architecture Team

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Intended Design](#intended-design)
4. [Current Implementation Issues](#current-implementation-issues)
5. [Proposed Improvements](#proposed-improvements)
6. [Implementation Phases](#implementation-phases)
7. [Technical Specifications](#technical-specifications)
8. [Edge Cases and Solutions](#edge-cases-and-solutions)
9. [Testing Strategy](#testing-strategy)
10. [Performance Considerations](#performance-considerations)

---

## Overview

### Purpose

Ontology mapping (also called terminology mapping) bridges the gap between **user's natural language** and **database-specific terminology** by:

1. Recognizing medical synonyms (e.g., "foot ulcer" = "diabetic foot ulcer")
2. Expanding abbreviations (e.g., "DFU" = "diabetic foot ulcer")
3. Handling regional/specialty variations (e.g., "pressure sore" = "pressure ulcer")
4. Providing context-aware term disambiguation

### Goals

- ✅ Allow users to ask questions using common clinical terminology
- ✅ Map user terms to exact database values without LLM guessing
- ✅ Reduce clarification requests when database uses different terminology
- ✅ Maintain high confidence in mapped values
- ✅ Handle ambiguity gracefully with user clarification

---

## Problem Statement

### Scenario: User vs Database Terminology Mismatch

**Example 1: Medical Synonyms**
```
User Question: "How many patients have foot ulcer?"
Database Field: "Wound Type" with value "Diabetic Foot Ulcer"

WITHOUT ontology mapping:
  → Search semantic index for "foot ulcer" → NOT FOUND
  → LLM asks: "What do you mean by 'foot ulcer'?" ❌

WITH ontology mapping:
  → Search semantic index for "foot ulcer" → NOT FOUND
  → Check ontology: "foot ulcer" → synonyms: ["diabetic foot ulcer", "DFU"]
  → Re-search for "diabetic foot ulcer" → FOUND ✅
  → Generate SQL: WHERE WoundType = 'Diabetic Foot Ulcer'
```

**Example 2: Abbreviations**
```
User Question: "Patients with VLU"
Database: "Venous Leg Ulcer"

WITHOUT ontology:
  → Search for "VLU" → NOT FOUND
  → Clarification needed ❌

WITH ontology:
  → "VLU" → expands to "venous leg ulcer"
  → Re-search → FOUND ✅
```

**Example 3: Regional Variations**
```
User Question: "Show pressure sores" (UK terminology)
Database: "Pressure Ulcer" (US terminology)

WITHOUT ontology:
  → NOT FOUND → Clarification ❌

WITH ontology:
  → "pressure sore" → synonym: "pressure ulcer"
  → FOUND ✅
```

---

## Intended Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: Intent Classification                                 │
│ ─────────────────────────────────────────────────────────────── │
│ User: "patients with foot ulcer"                                │
│ Output: filters=[{userPhrase: "foot ulcer", value: null}]      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: Terminology Mapping (Ontology-Aware)                  │
│ ─────────────────────────────────────────────────────────────── │
│ LEVEL 1: Direct Search                                          │
│   → Search semantic index for "foot ulcer"                      │
│   → NOT FOUND                                                   │
│                                                                  │
│ LEVEL 2: Single-Level Synonym Expansion                         │
│   → Lookup ontology for "foot ulcer"                            │
│   → Synonyms: ["diabetic foot ulcer", "DFU", "foot wound"]      │
│   → Re-search for each synonym                                  │
│   → FOUND "diabetic foot ulcer" in field "Wound Type" ✅        │
│                                                                  │
│ LEVEL 3: Multi-Level Expansion (if needed)                      │
│   → Expand synonyms recursively (max 2 levels)                  │
│   → Apply confidence degradation                                │
│                                                                  │
│ Output: {field: "Wound Type", value: "Diabetic Foot Ulcer"}    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: SQL Generation                                         │
│ ─────────────────────────────────────────────────────────────── │
│ Filters: [                                                       │
│   {                                                              │
│     field: "Wound Type",                                         │
│     value: "Diabetic Foot Ulcer",                                │
│     mappingConfidence: 0.85,                                     │
│     mappingNote: "Matched via synonym: foot ulcer"               │
│   }                                                              │
│ ]                                                                │
│                                                                  │
│ SQL: WHERE WoundType = 'Diabetic Foot Ulcer' ✅                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Current Implementation Issues

### Issue 1: Duplicate Mapping Systems ❌

**Problem:** Two parallel systems both trying to map terms:

1. **`mapFilters()`** (NEW - Fixed Today)
   - Searches ALL semantic fields
   - Finds exact/fuzzy matches
   - Populates `filter.value` directly
   - ✅ Works correctly

2. **`mapUserTerms()`** (OLD - Legacy)
   - Also searches semantic options
   - Creates separate `TerminologyMapping` objects
   - ❌ Conflicts with filter values
   - ❌ Caused "Simple Bandage" → "Compression Bandage" bug

**Result:** Both systems find matches, but sometimes DIFFERENT matches, causing contradictions.

**Example of Bug:**
```json
// Filter (correct):
{
  "field": "Treatment Applied",
  "value": "Simple Bandage"
}

// TerminologyMapping (wrong - from legacy system):
{
  "fieldName": "Treatment Applied",
  "fieldValue": "Compression Bandage",
  "userTerm": "Simple Bandage"
}

// LLM sees BOTH and gets confused!
// Generates: WHERE value = 'Compression Bandage' ❌
```

**Fix Applied:** Skip terminology section when filters have values (2025-11-17)

---

### Issue 2: No Ontology Integration ❌

**Current State:**
```typescript
// Abbreviations defined but not used effectively
private static ABBREVIATIONS: Record<string, string> = {
  dfu: "diabetic foot ulcer",
  vlu: "venous leg ulcer",
  pi: "pressure injury",
  npwt: "negative pressure wound therapy",
  hba1c: "hemoglobin a1c",
};
```

**Problem:** Abbreviations are expanded, but:
- No synonym lookup (e.g., "foot ulcer" → "diabetic foot ulcer")
- No re-search after expansion
- No ontology database integration
- Just fuzzy string matching

**What's Missing:**
```typescript
// Should have:
async function lookupSynonyms(term: string): Promise<string[]> {
  // Query ClinicalOntology table
  // Return: ["diabetic foot ulcer", "DFU", "foot wound"]
}

// Should use ontology for re-search:
if (directMatchNotFound) {
  const synonyms = await lookupSynonyms(term);
  for (const synonym of synonyms) {
    const match = await searchSemanticIndex(synonym);
    if (match) return match;
  }
}
```

---

### Issue 3: TerminologyMapping Used Incorrectly ❌

**Intended Use:**
```
TerminologyMapping: "foot ulcer" → "diabetic foot ulcer" (synonym hint)
    ↓ (Use to enhance search)
Re-query semantic index with synonym
    ↓
Find: field="Wound Type", value="Diabetic Foot Ulcer"
    ↓
Populate filter.value = "Diabetic Foot Ulcer"
    ↓ (ONLY send filter to LLM)
LLM generates SQL: WHERE WoundType = 'Diabetic Foot Ulcer'
```

**Current (Buggy) Use:**
```
TerminologyMapping: created with WRONG value
Filter: created with CORRECT value
    ↓ (BOTH sent to LLM)
LLM confused by contradictory information
    ↓
LLM picks wrong value ❌
```

---

## Proposed Improvements

### Core Architecture Changes

#### 1. Single Unified Mapping Pipeline ✅

```typescript
// ONE function to rule them all
async function mapFiltersWithOntology(
  filters: IntentFilter[],
  customerId: string,
  questionContext: string
): Promise<MappedFilter[]> {

  for (const filter of filters) {
    // LEVEL 1: Direct semantic search
    let matches = await searchSemanticIndex(filter.userPhrase, customerId);

    if (matches.length > 0) {
      filter.value = selectBestMatch(matches);
      filter.mappingConfidence = 1.0;
      continue;
    }

    // LEVEL 2: Single-level synonym expansion
    const synonyms = await lookupOntologySynonyms(
      filter.userPhrase,
      customerId,
      { maxLevels: 1, questionContext }
    );

    for (const synonym of synonyms) {
      matches = await searchSemanticIndex(synonym, customerId);
      if (matches.length > 0) {
        filter.value = selectBestMatch(matches);
        filter.mappingConfidence = 0.85; // Reduced for synonym
        filter.mappingNote = `Via synonym: "${filter.userPhrase}" → "${synonym}"`;
        break;
      }
    }

    if (filter.value) continue;

    // LEVEL 3: Two-level expansion (more aggressive)
    const expandedSynonyms = await expandSynonymsRecursively(
      filter.userPhrase,
      customerId,
      { maxDepth: 2, questionContext }
    );

    for (const synonym of expandedSynonyms) {
      matches = await searchSemanticIndex(synonym, customerId);
      if (matches.length > 0) {
        filter.value = selectBestMatch(matches);
        filter.mappingConfidence = 0.70; // Lower confidence
        filter.validationWarning = `Low confidence: multi-level synonym`;
        break;
      }
    }

    // No match found - leave null for LLM clarification
    if (!filter.value) {
      filter.mappingError = `No match in semantic index or ontology`;
      filter.mappingConfidence = 0.0;
    }
  }

  return filters;
}
```

#### 2. Deprecate Legacy `mapUserTerms()` ✅

**Option A: Remove Completely**
- If not used elsewhere, delete it
- Simplifies codebase

**Option B: Refactor for Synonym Suggestions**
```typescript
// Rename and repurpose:
async function suggestSynonyms(
  term: string,
  customerId: string
): Promise<string[]> {
  // Return synonym suggestions for disambiguation
  // NOT final mappings
}
```

---

## Edge Cases and Solutions

### Edge Case 1: Multiple Synonym Matches (Disambiguation)

**Problem:**
```
User: "pressure injury"
Synonyms: ["pressure ulcer", "bed sore", "decubitus ulcer"]

Semantic search finds:
  ✅ "Pressure Ulcer" in field "Wound Type"
  ✅ "Pressure Injury Stage 1" in field "PI Classification"
  ✅ "Bed Sore Prevention" in field "Intervention"
```

**Which one to use?**

**Solution: Multi-Factor Scoring**

```typescript
function selectBestMatch(
  matches: SemanticMatch[],
  userPhrase: string,
  questionContext: string
): SemanticMatch {

  // Score each match
  const scored = matches.map(match => ({
    match,
    score: calculateMatchScore(match, userPhrase, questionContext)
  }));

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondBest = scored[1];

  // If ambiguous (close scores), ask clarification
  if (secondBest && (best.score - secondBest.score) < 0.15) {
    return {
      ambiguous: true,
      options: scored.slice(0, 3).map(s => s.match),
      needsClarification: true
    };
  }

  return best.match;
}

function calculateMatchScore(
  match: SemanticMatch,
  userPhrase: string,
  questionContext: string
): number {
  let score = match.confidence; // Base score from fuzzy matching

  // Factor 1: Exact synonym match (not substring)
  if (match.matchType === 'exact_synonym') {
    score += 0.2;
  }

  // Factor 2: Field semantic relevance
  if (isRelevantFieldForQuestion(match.field, questionContext)) {
    score += 0.15;
  }

  // Factor 3: Usage frequency (if tracked)
  if (match.usageFrequency > 0.5) {
    score += 0.1;
  }

  // Factor 4: Preferred term (not deprecated)
  if (!match.deprecated) {
    score += 0.05;
  }

  return score;
}
```

**Decision Matrix:**

| Score Difference | Action |
|------------------|--------|
| > 0.2 | Use best match (clear winner) |
| 0.1 - 0.2 | Use best match but flag for review |
| < 0.1 | Ask clarification (ambiguous) |

---

### Edge Case 2: Synonym Chain Explosion

**Problem:**
```
User: "DFU"
  → "diabetic foot ulcer"
    → "diabetic" + "foot" + "ulcer"
      → "diabetes mellitus" + "pedal" + "wound"
        → Infinite expansion...
```

**Solution: Limit Expansion Depth**

```typescript
async function expandSynonymsRecursively(
  term: string,
  customerId: string,
  options: {
    maxDepth: number;
    currentDepth?: number;
    questionContext?: string;
  }
): Promise<string[]> {

  const currentDepth = options.currentDepth || 0;

  // STOP: Max depth reached
  if (currentDepth >= options.maxDepth) {
    return [term];
  }

  // Get immediate synonyms
  const synonyms = await lookupOntologySynonyms(term, customerId, options);

  if (currentDepth === 0) {
    // Level 1: Return synonyms as-is
    return synonyms;
  }

  // Level 2+: Recursively expand each synonym
  const expanded: string[] = [];
  for (const synonym of synonyms) {
    const subSynonyms = await expandSynonymsRecursively(
      synonym,
      customerId,
      {
        ...options,
        currentDepth: currentDepth + 1
      }
    );
    expanded.push(...subSynonyms);
  }

  // Remove duplicates
  return [...new Set(expanded)];
}
```

**Configuration:**

```typescript
const SYNONYM_EXPANSION_CONFIG = {
  maxDepth: 2,           // Maximum 2 levels
  maxSynonymsPerTerm: 5, // Limit breadth
  maxTotalSynonyms: 20   // Prevent explosion
};
```

**Example:**
```
Level 0: "DFU"
Level 1: ["diabetic foot ulcer", "foot ulcer", "pedal ulcer"]  → 3 terms
Level 2: [
  "diabetic foot ulcer" → ["DM foot wound", "diabetes foot lesion"],
  "foot ulcer" → ["pedal wound"],
  "pedal ulcer" → ["lower extremity ulcer"]
]  → 7 additional terms
STOP at Level 2 (total: 10 terms)
```

---

### Edge Case 3: Context-Dependent Abbreviations

**Problem:**
```
User: "patients with PI"

Possible meanings:
  - "Pressure Injury" (wound care context)
  - "Principal Investigator" (research context)
  - "Perfusion Index" (vascular assessment)
```

**Solution: Context-Aware Expansion**

```typescript
interface AbbreviationExpansion {
  abbreviation: string;
  expansions: Array<{
    value: string;
    contextKeywords: string[];
    frequency: number;       // How often this meaning is used
    domain: string;          // "wound_care", "research", "vascular"
  }>;
}

const CLINICAL_ABBREVIATIONS: AbbreviationExpansion[] = [
  {
    abbreviation: "PI",
    expansions: [
      {
        value: "pressure injury",
        contextKeywords: ["wound", "ulcer", "stage", "patient", "healing", "bed"],
        frequency: 0.75,
        domain: "wound_care"
      },
      {
        value: "principal investigator",
        contextKeywords: ["research", "study", "trial", "investigator", "protocol"],
        frequency: 0.15,
        domain: "research"
      },
      {
        value: "perfusion index",
        contextKeywords: ["vascular", "blood flow", "circulation", "perfusion"],
        frequency: 0.10,
        domain: "vascular"
      }
    ]
  }
];

function expandAbbreviationWithContext(
  abbreviation: string,
  questionContext: string
): string[] {
  const abbr = CLINICAL_ABBREVIATIONS.find(a =>
    a.abbreviation.toLowerCase() === abbreviation.toLowerCase()
  );

  if (!abbr) return [abbreviation];

  // Score each expansion based on context
  const scored = abbr.expansions.map(exp => ({
    value: exp.value,
    score: calculateContextScore(exp, questionContext)
  }));

  scored.sort((a, b) => b.score - a.score);

  // Return top 3 most relevant expansions
  return scored.slice(0, 3).map(s => s.value);
}

function calculateContextScore(
  expansion: AbbreviationExpansion['expansions'][0],
  questionContext: string
): number {
  const contextLower = questionContext.toLowerCase();

  // Count matching keywords
  const matchingKeywords = expansion.contextKeywords.filter(kw =>
    contextLower.includes(kw)
  ).length;

  // Weighted score
  const keywordScore = matchingKeywords / expansion.contextKeywords.length;
  const frequencyScore = expansion.frequency;

  return (keywordScore * 0.7) + (frequencyScore * 0.3);
}
```

**Example:**
```typescript
// Question: "patients with PI stage 2"
expandAbbreviationWithContext("PI", "patients with PI stage 2")
  → Matches: ["wound", "stage", "patient"]
  → Scores: {
      "pressure injury": 0.85,     ← Winner (high context match)
      "principal investigator": 0.1,
      "perfusion index": 0.05
    }
  → Returns: ["pressure injury", "principal investigator", "perfusion index"]
  → Search in order of confidence
```

---

### Edge Case 4: Partial Synonym Matches (Phrase Boundary)

**Problem:**
```
User: "diabetic patients with foot wounds"

Should we match:
  A) "diabetic" (separate) + "foot wounds" (separate)?
  B) "diabetic foot wounds" (as one phrase)?
```

**Solution: N-Gram Matching (Longest Match First)**

```typescript
async function findBestPhraseMatch(
  phrase: string,
  customerId: string
): Promise<SemanticMatch | null> {

  // Generate n-grams from longest to shortest
  const ngrams = generateNGrams(phrase, { maxN: 4, minN: 1 });

  // Example:
  // "diabetic patients with foot wounds"
  // → [
  //     "diabetic patients with foot wounds",  // 5-gram
  //     "diabetic patients with foot",         // 4-gram
  //     "patients with foot wounds",           // 4-gram
  //     "diabetic foot wounds",                // 3-gram ← Match!
  //     ...
  //   ]

  // Try each n-gram from longest to shortest
  for (const ngram of ngrams) {
    // Try direct match
    let match = await searchSemanticIndex(ngram, customerId);
    if (match) return match;

    // Try ontology synonym match
    const synonyms = await lookupOntologySynonyms(ngram, customerId);
    for (const synonym of synonyms) {
      match = await searchSemanticIndex(synonym, customerId);
      if (match) return match;
    }
  }

  return null;
}

function generateNGrams(
  text: string,
  options: { maxN: number; minN: number }
): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const ngrams: string[] = [];

  // Generate n-grams from maxN down to minN
  for (let n = options.maxN; n >= options.minN; n--) {
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
  }

  return ngrams;
}
```

**Example Flow:**
```
Input: "diabetic patients with foot wounds"

Step 1: Try full phrase
  "diabetic patients with foot wounds" → NOT FOUND

Step 2: Try 4-grams
  "diabetic patients with foot" → NOT FOUND
  "patients with foot wounds" → NOT FOUND

Step 3: Try 3-grams
  "diabetic patients with" → NOT FOUND
  "patients with foot" → NOT FOUND
  "with foot wounds" → NOT FOUND
  "diabetic foot wounds" → Check ontology
    → Synonym: "diabetic foot ulcer"
    → Search for "diabetic foot ulcer" → FOUND! ✅

Result: Match "diabetic foot ulcer" (extracted 3-gram phrase)
```

---

### Edge Case 5: Confidence Degradation

**Problem:**
```
Direct match:      "Simple Bandage" → confidence: ???
1-level synonym:   "foot ulcer" → "diabetic foot ulcer" → confidence: ???
2-level synonym:   "DFU" → "diabetic foot ulcer" → "DM foot wound" → confidence: ???
```

**Solution: Confidence Scoring Model**

```typescript
interface MatchConfidence {
  baseConfidence: number;      // From fuzzy matching
  synonymLevelPenalty: number; // Degradation per level
  contextBonus: number;        // Boost from context match
  ambiguityPenalty: number;    // Penalty if multiple matches
  finalConfidence: number;     // Calculated final score
}

function calculateMappingConfidence(
  match: SemanticMatch,
  mappingPath: {
    levels: number;          // 0 = direct, 1 = 1-level synonym, 2 = 2-level
    ambiguousMatches: number; // Number of similar matches
    contextRelevance: number; // 0-1 score
  }
): number {

  const baseConfidence = match.fuzzyMatchConfidence || 1.0;

  // Penalty for synonym levels
  const levelPenalty = mappingPath.levels * 0.15;

  // Penalty for ambiguity
  const ambiguityPenalty = Math.min(
    (mappingPath.ambiguousMatches - 1) * 0.10,
    0.30  // Max 0.30 penalty
  );

  // Bonus for context relevance
  const contextBonus = mappingPath.contextRelevance * 0.10;

  // Calculate final confidence
  let confidence = baseConfidence - levelPenalty - ambiguityPenalty + contextBonus;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}
```

**Confidence Thresholds:**

| Confidence | Interpretation | Action |
|------------|----------------|--------|
| **0.90 - 1.0** | Very High | Auto-use without warning |
| **0.75 - 0.89** | High | Use with note to user |
| **0.60 - 0.74** | Medium | Flag for user review |
| **0.40 - 0.59** | Low | Ask clarification with suggestion |
| **< 0.40** | Very Low | Ask clarification without suggestion |

**Examples:**

```typescript
// Example 1: Direct match
{
  baseConfidence: 1.0,
  levels: 0,
  ambiguousMatches: 1,
  contextRelevance: 0.8
}
→ finalConfidence: 1.0 - 0 - 0 + 0.08 = 1.0 (clamped)

// Example 2: 1-level synonym
{
  baseConfidence: 1.0,
  levels: 1,
  ambiguousMatches: 1,
  contextRelevance: 0.6
}
→ finalConfidence: 1.0 - 0.15 - 0 + 0.06 = 0.91 ✅ High confidence

// Example 3: 2-level synonym with ambiguity
{
  baseConfidence: 0.85,
  levels: 2,
  ambiguousMatches: 3,
  contextRelevance: 0.4
}
→ finalConfidence: 0.85 - 0.30 - 0.20 + 0.04 = 0.39 ⚠️ Need clarification
```

---

### Edge Case 6: Regional/Specialty Terminology

**Problem:**
```
UK:        "pressure sore"
US:        "pressure ulcer"
Clinical:  "pressure injury"
Informal:  "bed sore"
```

**Solution: Ontology with Regional/Specialty Context**

```typescript
interface ClinicalOntologyEntry {
  id: string;
  preferred_term: string;      // Modern clinical standard
  category: string;             // "wound_type", "treatment", etc.
  synonyms: Array<{
    value: string;
    region?: "US" | "UK" | "AU" | "any";
    specialty?: "wound_care" | "dermatology" | "surgery";
    formality: "clinical" | "informal" | "deprecated";
    confidence: number;         // How close to preferred term
  }>;
  related_terms?: string[];     // Broader/narrower terms
}

const PRESSURE_INJURY_ONTOLOGY: ClinicalOntologyEntry = {
  id: "pressure_injury_001",
  preferred_term: "pressure injury",
  category: "wound_type",
  synonyms: [
    {
      value: "pressure ulcer",
      region: "US",
      formality: "clinical",
      confidence: 0.95
    },
    {
      value: "pressure sore",
      region: "UK",
      formality: "clinical",
      confidence: 0.90
    },
    {
      value: "decubitus ulcer",
      region: "any",
      formality: "deprecated",
      confidence: 0.70
    },
    {
      value: "bed sore",
      region: "any",
      formality: "informal",
      confidence: 0.60
    }
  ],
  related_terms: [
    "pressure injury stage 1",
    "pressure injury stage 2",
    "pressure injury stage 3",
    "pressure injury stage 4",
    "unstageable pressure injury"
  ]
};

async function lookupOntologySynonyms(
  term: string,
  customerId: string,
  options: {
    preferredRegion?: string;
    includeDeprecated?: boolean;
    includeInformal?: boolean;
  } = {}
): Promise<string[]> {

  const entry = await queryOntology(term, customerId);
  if (!entry) return [term];

  // Start with preferred term
  const synonyms: string[] = [entry.preferred_term];

  // Add synonyms based on filters
  for (const syn of entry.synonyms) {
    // Skip deprecated if not allowed
    if (syn.formality === 'deprecated' && !options.includeDeprecated) {
      continue;
    }

    // Skip informal if not allowed
    if (syn.formality === 'informal' && !options.includeInformal) {
      continue;
    }

    // Prioritize regional match
    if (options.preferredRegion && syn.region === options.preferredRegion) {
      synonyms.unshift(syn.value); // Add to front
    } else {
      synonyms.push(syn.value);
    }
  }

  return synonyms;
}
```

**Usage:**

```typescript
// Example: User asks "patients with pressure sores"
const synonyms = await lookupOntologySynonyms("pressure sores", customerId, {
  preferredRegion: "UK",
  includeDeprecated: false,
  includeInformal: true
});

// Returns (in order):
// [
//   "pressure injury",      // Preferred term
//   "pressure sore",        // Regional match (UK)
//   "pressure ulcer"        // US clinical
//   // "decubitus ulcer" excluded (deprecated)
//   // "bed sore" included (informal allowed)
// ]
```

---

### Edge Case 7: NOT Operators (Negation)

**Problem:**
```
User: "patients WITHOUT diabetic foot ulcer"

Synonym expansion:
  "diabetic foot ulcer" → ["DFU", "foot ulcer", "pedal ulcer"]

Should we search for:
  NOT "diabetic foot ulcer" ✅
  NOT "DFU" ✅
  NOT "foot ulcer" ❌ Too broad! Excludes ALL foot ulcers
```

**Solution: Specificity-Aware Expansion**

```typescript
async function expandForNegation(
  term: string,
  customerId: string
): Promise<string[]> {

  const synonyms = await lookupOntologySynonyms(term, customerId);

  // For negation, use ONLY synonyms at same or MORE SPECIFIC level
  const specificSynonyms = await filterBySpecificity(
    term,
    synonyms,
    { direction: 'equal_or_more_specific' }
  );

  return specificSynonyms;
}

interface TermSpecificity {
  term: string;
  specificity: 'general' | 'specific' | 'very_specific';
  hierarchy: string[]; // From general to specific
}

// Example hierarchy:
const WOUND_HIERARCHY = {
  "wound": {                     // Most general
    specificity: 'general',
    children: [
      "ulcer",                   // More specific
      "laceration",
      "burn"
    ]
  },
  "ulcer": {
    specificity: 'specific',
    children: [
      "foot ulcer",              // Even more specific
      "leg ulcer",
      "pressure ulcer"
    ]
  },
  "foot ulcer": {
    specificity: 'very_specific',
    children: [
      "diabetic foot ulcer",     // Most specific
      "neuropathic foot ulcer",
      "ischemic foot ulcer"
    ]
  }
};

function filterBySpecificity(
  term: string,
  synonyms: string[],
  options: { direction: 'equal_or_more_specific' | 'equal_or_less_specific' }
): string[] {

  const termLevel = getSpecificityLevel(term);

  return synonyms.filter(syn => {
    const synLevel = getSpecificityLevel(syn);

    if (options.direction === 'equal_or_more_specific') {
      return synLevel >= termLevel;
    } else {
      return synLevel <= termLevel;
    }
  });
}
```

**Example:**

```typescript
// Positive filter (equals): Expand broadly
User: "patients with foot ulcer"
Synonyms: [
  "diabetic foot ulcer",  ← More specific ✅
  "foot ulcer",           ← Same level ✅
  "ulcer",                ← Less specific ✅ (might catch it)
  "wound"                 ← Too general ❌
]

// Negative filter (NOT): Use only specific
User: "patients WITHOUT diabetic foot ulcer"
Synonyms: [
  "diabetic foot ulcer",  ← Same level ✅
  "DFU",                  ← Abbreviation (same) ✅
  "foot ulcer"            ← LESS specific ❌ (would exclude too much)
]

SQL: WHERE WoundType NOT IN ('Diabetic Foot Ulcer', 'DFU')
```

---

### Edge Case 8: Multi-Word Query with Multiple Abbreviations

**Problem:**
```
User: "patients with DFU and VLU"

"DFU" → "diabetic foot ulcer"
"VLU" → "venous leg ulcer"

But what about:
  "patients with DFU assessment" → "DFU" = "diabetic foot ulcer" ✅
  "DFU clinic referral" → "DFU" = "Diabetic Foot Unit" (place, not wound) ❌
```

**Solution: Context-Specific Expansion per Token**

```typescript
async function expandQueryWithContext(
  query: string,
  customerId: string
): Promise<Map<string, string[]>> {

  const tokens = tokenizeQuery(query);
  const expansions = new Map<string, string[]>();

  for (const token of tokens) {
    // Get surrounding context (3 words before/after)
    const context = getLocalContext(query, token.position, 3);

    // Expand with context
    const synonyms = await expandAbbreviationWithContext(
      token.value,
      context
    );

    expansions.set(token.value, synonyms);
  }

  return expansions;
}

function getLocalContext(
  query: string,
  position: number,
  windowSize: number
): string {
  const words = query.split(/\s+/);
  const start = Math.max(0, position - windowSize);
  const end = Math.min(words.length, position + windowSize + 1);

  return words.slice(start, end).join(' ');
}
```

**Example:**

```typescript
Query: "patients with DFU and VLU assessments"

Token 1: "DFU"
  Context: "patients with DFU and VLU"
  Keywords: ["patients", "assessments"]
  Expansion: ["diabetic foot ulcer"] ← Wound context

Token 2: "VLU"
  Context: "with DFU and VLU assessments"
  Keywords: ["assessments"]
  Expansion: ["venous leg ulcer"] ← Wound context

---

Query: "referred to DFU clinic"

Token: "DFU"
  Context: "referred to DFU clinic"
  Keywords: ["referred", "clinic"]
  Expansion: ["Diabetic Foot Unit"] ← Place context
```

---

## Implementation Phases

### Phase 1: Foundation (Immediate - 1-2 weeks)

**Goals:**
- Fix immediate bugs (DONE - 2025-11-17)
- Basic ontology lookup
- Single-level synonym expansion
- Confidence scoring

**Deliverables:**

1. ✅ **Remove Terminology Section Conflict** (DONE)
   - Skip terminology mappings when filters have values
   - Prevents LLM confusion

2. **Create ClinicalOntology Schema**
   ```sql
   CREATE TABLE "ClinicalOntology" (
     id UUID PRIMARY KEY,
     preferred_term VARCHAR(255) NOT NULL,
     category VARCHAR(100),
     synonyms JSONB,           -- Array of synonym objects
     abbreviations JSONB,      -- Array of abbreviation objects
     related_terms JSONB,      -- Array of related terms
     metadata JSONB,           -- Regional, specialty info
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX idx_ontology_preferred ON "ClinicalOntology"(preferred_term);
   CREATE INDEX idx_ontology_category ON "ClinicalOntology"(category);
   CREATE INDEX idx_ontology_synonyms ON "ClinicalOntology" USING GIN(synonyms);
   ```

3. **Implement `lookupOntologySynonyms()`**
   ```typescript
   async function lookupOntologySynonyms(
     term: string,
     customerId: string,
     options?: {
       maxLevels?: number;
       questionContext?: string;
     }
   ): Promise<string[]>
   ```

4. **Update `mapFilters()` with Ontology Integration**
   - Level 1: Direct search
   - Level 2: Single-level synonym expansion
   - Confidence scoring

5. **Populate Initial Ontology Data**
   - Common wound types
   - Treatment terminology
   - Basic abbreviations (DFU, VLU, PI, NPWT, etc.)

**Testing:**
- Unit tests for synonym lookup
- Integration tests for filter mapping
- End-to-end tests with sample queries

**Success Metrics:**
- "foot ulcer" → finds "diabetic foot ulcer"
- "VLU" → finds "venous leg ulcer"
- "PI" → finds "pressure injury"
- Confidence scores accurate (0.85 for 1-level synonyms)

---

### Phase 2: Enhancement (2-3 weeks)

**Goals:**
- Context-aware disambiguation
- Multi-level expansion
- Phrase-level matching
- NOT operator handling

**Deliverables:**

1. **Context-Aware Abbreviation Expansion**
   - Implement context scoring
   - Build abbreviation expansion database
   - Add context keywords to ontology

2. **Multi-Level Synonym Expansion**
   - Implement recursive expansion (max 2 levels)
   - Add explosion prevention (max breadth/depth limits)
   - Confidence degradation per level

3. **N-Gram Phrase Matching**
   - Implement phrase boundary detection
   - Longest-match-first strategy
   - Integration with synonym lookup

4. **Disambiguation Logic**
   - Multi-factor scoring for match selection
   - Clarification generation for ambiguous cases
   - Top-3 options presentation to user

5. **NOT Operator Specificity Handling**
   - Implement specificity hierarchy
   - Filter synonyms by specificity for negation
   - Prevent over-broad exclusions

**Testing:**
- Context disambiguation tests
- Multi-level expansion tests
- Phrase matching tests
- NOT operator tests

**Success Metrics:**
- "PI" disambiguated correctly based on context
- "diabetic patients with foot wounds" → matches "diabetic foot ulcer"
- "patients WITHOUT DFU" → excludes only specific term
- Multi-level expansion limited and scored correctly

---

### Phase 3: Advanced Features (3-4 weeks)

**Goals:**
- Regional/specialty variants
- Usage tracking
- Performance optimization
- Advanced analytics

**Deliverables:**

1. **Regional/Specialty Ontology**
   - Add region/specialty metadata to ontology
   - Implement customer preference detection
   - Prioritize regional terms in expansion

2. **Usage Frequency Tracking**
   ```sql
   CREATE TABLE "TermUsageStats" (
     customer_id UUID,
     term VARCHAR(255),
     field_name VARCHAR(255),
     usage_count INTEGER DEFAULT 0,
     last_used_at TIMESTAMP,
     PRIMARY KEY (customer_id, term, field_name)
   );
   ```
   - Track which terms are actually used
   - Prioritize frequently-used terms
   - Deprecate unused terms

3. **Performance Optimization**
   - Caching strategy for ontology lookups
   - Batch processing for multiple filters
   - Database query optimization

4. **Analytics Dashboard**
   - Synonym mapping success rate
   - Most common unmapped terms
   - Clarification request patterns
   - Confidence score distributions

5. **Ontology Management UI**
   - Admin interface for managing ontology
   - Add/edit/deprecate terms
   - Test synonym mappings
   - Import/export ontology data

**Testing:**
- Performance benchmarks
- Load testing with large ontologies
- User acceptance testing

**Success Metrics:**
- < 100ms avg ontology lookup time
- > 80% filter mapping success rate
- < 15% clarification request rate
- Regional terms prioritized correctly

---

## Technical Specifications

### Database Schema

#### ClinicalOntology Table

```sql
CREATE TABLE "ClinicalOntology" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core fields
  preferred_term VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,  -- "wound_type", "treatment", "assessment", etc.

  -- Synonyms with metadata
  synonyms JSONB NOT NULL DEFAULT '[]',
  -- Example:
  -- [
  --   {
  --     "value": "pressure ulcer",
  --     "region": "US",
  --     "formality": "clinical",
  --     "confidence": 0.95
  --   }
  -- ]

  -- Abbreviations
  abbreviations JSONB DEFAULT '[]',
  -- Example:
  -- [
  --   {
  --     "value": "DFU",
  --     "context_keywords": ["wound", "ulcer", "patient"],
  --     "frequency": 0.85
  --   }
  -- ]

  -- Related terms (broader/narrower)
  related_terms JSONB DEFAULT '[]',
  -- Example: ["pressure injury stage 1", "pressure injury stage 2"]

  -- Metadata
  metadata JSONB DEFAULT '{}',
  -- Example:
  -- {
  --   "specialty": "wound_care",
  --   "clinical_domain": "pressure_injuries",
  --   "deprecated": false
  -- }

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,

  -- Constraints
  CONSTRAINT preferred_term_unique UNIQUE (preferred_term, category)
);

-- Indexes
CREATE INDEX idx_ontology_preferred ON "ClinicalOntology"(preferred_term);
CREATE INDEX idx_ontology_category ON "ClinicalOntology"(category);
CREATE INDEX idx_ontology_synonyms ON "ClinicalOntology" USING GIN(synonyms);
CREATE INDEX idx_ontology_abbreviations ON "ClinicalOntology" USING GIN(abbreviations);
CREATE INDEX idx_ontology_metadata ON "ClinicalOntology" USING GIN(metadata);

-- Full-text search index
CREATE INDEX idx_ontology_fts ON "ClinicalOntology"
  USING GIN(to_tsvector('english', preferred_term));
```

#### TermUsageStats Table

```sql
CREATE TABLE "TermUsageStats" (
  customer_id UUID NOT NULL,
  term VARCHAR(255) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  form_name VARCHAR(255),

  -- Usage metrics
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  first_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Success metrics
  mapping_success_count INTEGER DEFAULT 0,
  mapping_failure_count INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,2),

  PRIMARY KEY (customer_id, term, field_name)
);

-- Indexes
CREATE INDEX idx_usage_customer ON "TermUsageStats"(customer_id);
CREATE INDEX idx_usage_last_used ON "TermUsageStats"(last_used_at DESC);
CREATE INDEX idx_usage_count ON "TermUsageStats"(usage_count DESC);
```

---

### API Interfaces

#### Core Functions

```typescript
/**
 * Lookup synonyms from clinical ontology
 */
async function lookupOntologySynonyms(
  term: string,
  customerId: string,
  options?: {
    maxLevels?: number;           // Default: 1
    questionContext?: string;     // For context-aware expansion
    preferredRegion?: string;     // "US", "UK", etc.
    includeDeprecated?: boolean;  // Default: false
    includeInformal?: boolean;    // Default: true
  }
): Promise<string[]>;

/**
 * Expand abbreviations with context awareness
 */
async function expandAbbreviationWithContext(
  abbreviation: string,
  questionContext: string,
  customerId: string
): Promise<string[]>;

/**
 * Map filters with ontology-aware synonym expansion
 */
async function mapFiltersWithOntology(
  filters: IntentFilter[],
  customerId: string,
  questionContext: string
): Promise<MappedFilter[]>;

/**
 * Find best match with disambiguation
 */
function selectBestMatch(
  matches: SemanticMatch[],
  userPhrase: string,
  questionContext: string,
  options?: {
    ambiguityThreshold?: number;  // Default: 0.15
    minConfidence?: number;       // Default: 0.5
  }
): SemanticMatch | DisambiguationRequest;

/**
 * Calculate mapping confidence
 */
function calculateMappingConfidence(
  match: SemanticMatch,
  mappingPath: {
    levels: number;
    ambiguousMatches: number;
    contextRelevance: number;
  }
): number;

/**
 * Track term usage for analytics
 */
async function trackTermUsage(
  customerId: string,
  term: string,
  fieldName: string,
  success: boolean,
  confidence: number
): Promise<void>;
```

#### Type Definitions

```typescript
interface MappedFilter extends IntentFilter {
  field?: string;
  value: string | null;
  mappingConfidence: number;
  mappingNote?: string;
  validationWarning?: string;
  mappingError?: string;

  // Ontology mapping metadata
  mappingPath?: {
    originalTerm: string;
    synonymsUsed: string[];
    levelsTraversed: number;
    matchedVia: 'direct' | 'synonym' | 'abbreviation' | 'phrase';
  };
}

interface SemanticMatch {
  field: string;
  value: string;
  formName?: string;
  confidence: number;
  matchType: 'exact' | 'exact_synonym' | 'fuzzy' | 'phrase' | 'abbreviation';
  usageFrequency?: number;
  deprecated?: boolean;
}

interface DisambiguationRequest {
  ambiguous: true;
  options: Array<{
    field: string;
    value: string;
    confidence: number;
    description: string;
  }>;
  question: string;
}

interface ClinicalOntologyEntry {
  id: string;
  preferred_term: string;
  category: string;
  synonyms: Array<{
    value: string;
    region?: string;
    specialty?: string;
    formality: 'clinical' | 'informal' | 'deprecated';
    confidence: number;
  }>;
  abbreviations: Array<{
    value: string;
    context_keywords: string[];
    frequency: number;
    domain: string;
  }>;
  related_terms: string[];
  metadata: Record<string, any>;
}
```

---

## Testing Strategy

### Unit Tests

**Ontology Lookup Tests:**
```typescript
describe('lookupOntologySynonyms', () => {
  it('should find direct synonym', async () => {
    const synonyms = await lookupOntologySynonyms('foot ulcer', customerId);
    expect(synonyms).toContain('diabetic foot ulcer');
  });

  it('should expand abbreviations', async () => {
    const synonyms = await lookupOntologySynonyms('DFU', customerId);
    expect(synonyms).toContain('diabetic foot ulcer');
  });

  it('should respect max levels', async () => {
    const synonyms = await lookupOntologySynonyms('DFU', customerId, {
      maxLevels: 1
    });
    expect(synonyms.length).toBeLessThanOrEqual(5);
  });

  it('should use context for abbreviations', async () => {
    const synonyms = await expandAbbreviationWithContext(
      'PI',
      'patients with PI stage 2',
      customerId
    );
    expect(synonyms[0]).toBe('pressure injury');
  });
});
```

**Confidence Scoring Tests:**
```typescript
describe('calculateMappingConfidence', () => {
  it('should give 1.0 for direct match', () => {
    const confidence = calculateMappingConfidence(match, {
      levels: 0,
      ambiguousMatches: 1,
      contextRelevance: 0.8
    });
    expect(confidence).toBe(1.0);
  });

  it('should degrade confidence for synonym levels', () => {
    const confidence1 = calculateMappingConfidence(match, { levels: 1, ... });
    const confidence2 = calculateMappingConfidence(match, { levels: 2, ... });
    expect(confidence1).toBeGreaterThan(confidence2);
  });

  it('should penalize ambiguity', () => {
    const conf1 = calculateMappingConfidence(match, { ambiguousMatches: 1, ... });
    const conf2 = calculateMappingConfidence(match, { ambiguousMatches: 3, ... });
    expect(conf1).toBeGreaterThan(conf2);
  });
});
```

**Disambiguation Tests:**
```typescript
describe('selectBestMatch', () => {
  it('should return clear winner', () => {
    const matches = [
      { field: 'Wound Type', value: 'Diabetic Foot Ulcer', confidence: 0.95 },
      { field: 'Treatment', value: 'Foot Care', confidence: 0.60 }
    ];
    const result = selectBestMatch(matches, 'foot ulcer', context);
    expect(result.ambiguous).toBeUndefined();
    expect(result.value).toBe('Diabetic Foot Ulcer');
  });

  it('should request clarification for ambiguous matches', () => {
    const matches = [
      { field: 'Wound Type', value: 'Pressure Ulcer', confidence: 0.85 },
      { field: 'PI Classification', value: 'Pressure Injury', confidence: 0.82 }
    ];
    const result = selectBestMatch(matches, 'pressure injury', context);
    expect(result.ambiguous).toBe(true);
    expect(result.options.length).toBe(2);
  });
});
```

---

### Integration Tests

**End-to-End Filter Mapping:**
```typescript
describe('mapFiltersWithOntology - E2E', () => {
  it('should map "foot ulcer" to database value', async () => {
    const filters = [{
      userPhrase: 'foot ulcer',
      operator: 'equals',
      value: null
    }];

    const mapped = await mapFiltersWithOntology(
      filters,
      customerId,
      'patients with foot ulcer'
    );

    expect(mapped[0].value).toBe('Diabetic Foot Ulcer');
    expect(mapped[0].field).toBe('Wound Type');
    expect(mapped[0].mappingConfidence).toBeGreaterThan(0.8);
  });

  it('should handle multiple filters', async () => {
    const filters = [
      { userPhrase: 'DFU', operator: 'equals', value: null },
      { userPhrase: 'VLU', operator: 'equals', value: null }
    ];

    const mapped = await mapFiltersWithOntology(filters, customerId, 'DFU and VLU');

    expect(mapped[0].value).toContain('Diabetic Foot');
    expect(mapped[1].value).toContain('Venous Leg');
  });

  it('should fall back to clarification when no match', async () => {
    const filters = [{
      userPhrase: 'xyz unknown term',
      operator: 'equals',
      value: null
    }];

    const mapped = await mapFiltersWithOntology(filters, customerId, 'xyz');

    expect(mapped[0].value).toBeNull();
    expect(mapped[0].mappingError).toBeDefined();
    expect(mapped[0].mappingConfidence).toBe(0);
  });
});
```

---

### Performance Tests

```typescript
describe('Performance', () => {
  it('should lookup synonym in < 100ms', async () => {
    const start = Date.now();
    await lookupOntologySynonyms('foot ulcer', customerId);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });

  it('should handle 100 filters in < 5s', async () => {
    const filters = Array(100).fill({
      userPhrase: 'foot ulcer',
      operator: 'equals',
      value: null
    });

    const start = Date.now();
    await mapFiltersWithOntology(filters, customerId, 'query');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
  });

  it('should use cache for repeated lookups', async () => {
    // First lookup
    const start1 = Date.now();
    await lookupOntologySynonyms('DFU', customerId);
    const duration1 = Date.now() - start1;

    // Second lookup (cached)
    const start2 = Date.now();
    await lookupOntologySynonyms('DFU', customerId);
    const duration2 = Date.now() - start2;

    expect(duration2).toBeLessThan(duration1 * 0.2); // 5x faster
  });
});
```

---

## Performance Considerations

### Caching Strategy

**1. In-Memory Cache**
```typescript
class OntologyCache {
  private synonymCache = new Map<string, CachedSynonyms>();
  private embeddingCache = new Map<string, number[]>();
  private TTL = 30 * 60 * 1000; // 30 minutes

  getSynonyms(term: string): string[] | undefined {
    const cached = this.synonymCache.get(term);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.synonyms;
    }
    return undefined;
  }

  setSynonyms(term: string, synonyms: string[]): void {
    this.synonymCache.set(term, {
      synonyms,
      expiresAt: Date.now() + this.TTL
    });
  }
}
```

**2. Database Query Optimization**
```sql
-- Use materialized view for frequently accessed ontology data
CREATE MATERIALIZED VIEW mv_frequent_ontology AS
SELECT *
FROM "ClinicalOntology"
WHERE id IN (
  SELECT ontology_id
  FROM (
    SELECT
      o.id as ontology_id,
      COUNT(*) as usage_count
    FROM "ClinicalOntology" o
    JOIN "TermUsageStats" t ON t.term = o.preferred_term
    GROUP BY o.id
    ORDER BY usage_count DESC
    LIMIT 1000
  ) frequent
);

-- Refresh periodically
REFRESH MATERIALIZED VIEW mv_frequent_ontology;
```

**3. Batch Processing**
```typescript
async function batchLookupSynonyms(
  terms: string[],
  customerId: string
): Promise<Map<string, string[]>> {
  // Single database query for all terms
  const result = await pool.query(`
    SELECT preferred_term, synonyms
    FROM "ClinicalOntology"
    WHERE preferred_term = ANY($1)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(synonyms) syn
         WHERE syn->>'value' = ANY($1)
       )
  `, [terms]);

  // Build map
  const synonymMap = new Map<string, string[]>();
  for (const row of result.rows) {
    for (const term of terms) {
      if (matchesTerm(row, term)) {
        synonymMap.set(term, extractSynonyms(row));
      }
    }
  }

  return synonymMap;
}
```

---

### Scalability Considerations

**1. Horizontal Scaling**
- Ontology data replicated across read replicas
- Cache distributed using Redis
- Load balanced API endpoints

**2. Async Processing**
- Queue-based synonym lookup for non-real-time queries
- Background jobs for ontology updates
- Incremental cache warming

**3. Monitoring**
```typescript
// Track performance metrics
interface OntologyMetrics {
  lookupLatency: Histogram;
  cacheHitRate: Counter;
  disambiguationRate: Gauge;
  mappingSuccessRate: Gauge;
}

// Alert on degradation
if (metrics.lookupLatency.p95 > 200) {
  alert('Ontology lookup slow - check database');
}

if (metrics.cacheHitRate.value < 0.6) {
  alert('Low cache hit rate - increase TTL or cache size');
}
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Filter Mapping Success Rate** | > 80% | % of filters successfully mapped to DB values |
| **Clarification Request Rate** | < 15% | % of queries requiring user clarification |
| **Ontology Lookup Latency (P95)** | < 100ms | 95th percentile response time |
| **Confidence Accuracy** | > 90% | % of high-confidence mappings that are correct |
| **Synonym Coverage** | > 85% | % of clinical terms with synonyms in ontology |

### Monitoring Dashboard

```typescript
// Real-time metrics
const metrics = {
  // Performance
  avgLookupTime: 45ms,
  p95LookupTime: 85ms,
  cacheHitRate: 72%,

  // Accuracy
  mappingSuccessRate: 83%,
  clarificationRate: 12%,
  avgConfidence: 0.87,

  // Coverage
  ontologyTermCount: 1247,
  synonymCount: 4893,
  abbreviationCount: 234,

  // Usage
  dailyLookups: 8432,
  topUnmappedTerms: ['xyz', 'abc', 'def']
};
```

---

## Migration Plan

### Phase 1: Parallel Running (2 weeks)

1. Deploy new ontology system alongside legacy
2. Run both systems, compare results
3. Log discrepancies for analysis
4. Gradually increase traffic to new system

### Phase 2: Cutover (1 week)

1. Route 100% traffic to new system
2. Keep legacy system as fallback
3. Monitor for regressions
4. Fix any issues immediately

### Phase 3: Cleanup (1 week)

1. Remove legacy `mapUserTerms()` function
2. Delete deprecated code paths
3. Update documentation
4. Archive legacy system

---

## Appendix

### A. Sample Ontology Data

```json
[
  {
    "id": "ont_wound_type_001",
    "preferred_term": "diabetic foot ulcer",
    "category": "wound_type",
    "synonyms": [
      {
        "value": "foot ulcer",
        "formality": "clinical",
        "confidence": 0.85
      },
      {
        "value": "pedal ulcer",
        "formality": "clinical",
        "confidence": 0.80
      },
      {
        "value": "DFU",
        "formality": "clinical",
        "confidence": 0.95
      }
    ],
    "abbreviations": [
      {
        "value": "DFU",
        "context_keywords": ["wound", "ulcer", "patient", "foot", "diabetic"],
        "frequency": 0.90,
        "domain": "wound_care"
      }
    ],
    "related_terms": [
      "neuropathic foot ulcer",
      "ischemic foot ulcer",
      "neuro-ischemic foot ulcer"
    ],
    "metadata": {
      "specialty": "wound_care",
      "clinical_domain": "diabetic_complications",
      "icd10_codes": ["E11.621", "E10.621"]
    }
  },
  {
    "id": "ont_wound_type_002",
    "preferred_term": "pressure injury",
    "category": "wound_type",
    "synonyms": [
      {
        "value": "pressure ulcer",
        "region": "US",
        "formality": "clinical",
        "confidence": 0.95
      },
      {
        "value": "pressure sore",
        "region": "UK",
        "formality": "clinical",
        "confidence": 0.90
      },
      {
        "value": "decubitus ulcer",
        "formality": "deprecated",
        "confidence": 0.70
      },
      {
        "value": "bed sore",
        "formality": "informal",
        "confidence": 0.60
      }
    ],
    "abbreviations": [
      {
        "value": "PI",
        "context_keywords": ["wound", "stage", "patient", "pressure", "bed"],
        "frequency": 0.75,
        "domain": "wound_care"
      }
    ],
    "related_terms": [
      "pressure injury stage 1",
      "pressure injury stage 2",
      "pressure injury stage 3",
      "pressure injury stage 4",
      "unstageable pressure injury",
      "deep tissue pressure injury"
    ],
    "metadata": {
      "specialty": "wound_care",
      "clinical_domain": "pressure_injuries",
      "staging_system": "NPUAP"
    }
  }
]
```

### B. Common Clinical Abbreviations

| Abbreviation | Expansion | Context Keywords |
|--------------|-----------|------------------|
| DFU | Diabetic Foot Ulcer | wound, ulcer, diabetic, foot |
| VLU | Venous Leg Ulcer | venous, leg, ulcer, vascular |
| PI | Pressure Injury | pressure, stage, bed, skin |
| NPWT | Negative Pressure Wound Therapy | therapy, vacuum, wound |
| HbA1c | Hemoglobin A1c | diabetes, glucose, blood |
| DVT | Deep Vein Thrombosis | vascular, clot, leg |
| MRSA | Methicillin-Resistant Staphylococcus Aureus | infection, bacteria |

### C. Related Documentation

- [Semantic Layer Design](../semantic_layer_design.md)
- [Filter Value Generation](../discovery/FILTER_VALUE_GENERATION_INVESTIGATION.md)
- [Intent Classification Fix](../../../todos/INTENT_CLASSIFICATION_FIX.md)
- [Form Discovery Schema Fix](../../../todos/done/FORM_DISCOVERY_SCHEMA_FIX.md)

---

**End of Document**
