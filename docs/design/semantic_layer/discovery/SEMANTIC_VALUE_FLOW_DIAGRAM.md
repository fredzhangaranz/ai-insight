# Semantic Value Flow Diagram
## Tracing "simple bandage" → "simple_bandage" → Query

---

## End-to-End Data Flow

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ USER INPUT                                                     ┃
┃ "How many patients have simple bandage?"                       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: INTENT CLASSIFICATION (LLM)                           │
│ File: lib/prompts/intent-classification.prompt.ts              │
│ Service: IntentClassifierService                               │
├─────────────────────────────────────────────────────────────────┤
│ INPUT:                                                          │
│   • System Prompt: "Extract intent from natural language"      │
│   • Clinical Ontology: Top 30 concepts (NO form options!)      │
│   • User Message: Formatted question with context              │
│                                                                 │
│ LLM PROCESSING:                                                 │
│   1. Recognizes: "simple bandage" is a treatment type          │
│   2. No specific guidance on format                            │
│   3. Applies heuristic: lowercase + underscore = semantic code │
│   4. Generates value: "simple_bandage"                         │
│                                                                 │
│ OUTPUT:                                                         │
│   {                                                             │
│     "type": "outcome_analysis",                                │
│     "scope": "aggregate",                                      │
│     "metrics": ["patient_count"],                              │
│     "filters": [{                                              │
│       "concept": "treatment_type",                             │
│       "userTerm": "simple bandage",     ← Original phrase      │
│       "value": "simple_bandage"         ← LLM's guess ❌       │
│     }],                                                         │
│     "confidence": 0.9,                                         │
│     "reasoning": "Count of patients..."                        │
│   }                                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ CONTEXT DISCOVERY FLOW                                          │
│ Service: ContextDiscoveryService                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Step 1: Extract User Terms (Line 497-522)                      │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ const terms = ["simple bandage", "simple_bandage"]      │  │
│ │ (extracts both userTerm and value from filters)         │  │
│ └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│ Step 2: Call Terminology Mapper                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ mapUserTerms(["simple bandage", "simple_bandage"], ...) │  │
│ └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│ Step 3: Terminology Mapper Process                             │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ For each term:                                           │  │
│ │   1. Normalize: "simple bandage" → "simple bandage"      │  │
│ │   2. Search SemanticIndexOption:                         │  │
│ │      - Patterns: ["%simple bandage%", "%simple%", ...]  │  │
│ │      - Query: SELECT * FROM SemanticIndexOption          │  │
│ │               WHERE option_value ILIKE patterns          │  │
│ │   3. Results: Found "Simple Bandage" ✅                  │  │
│ │   4. Calculate confidence: 0.95 (high similarity)        │  │
│ │   5. Return: {                                           │  │
│ │        userTerm: "simple bandage",                       │  │
│ │        fieldValue: "Simple Bandage",  ← Correct! ✅      │  │
│ │        semanticConcept: "treatment_type",                │  │
│ │        fieldName: "Treatment Applied",                   │  │
│ │        source: "form_option",                            │  │
│ │        confidence: 0.95                                  │  │
│ │      }                                                    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│ Step 4: Assemble Context Bundle                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Bundle contains:                                         │  │
│ │ • intent.filters[0].value = "simple_bandage" (from LLM) │  │
│ │ • terminology[0].fieldValue = "Simple Bandage" (from    │  │
│ │   semantic index) ✅ But not used! ⚠️                    │  │
│ │                                                          │  │
│ │ Key Issue: The correct value is discovered but ignored! │  │
│ └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: SQL GENERATION (LLM)                                  │
│ Service: LLMSQLGeneratorService                                │
│ File: lib/services/semantic/llm-sql-generator.service.ts       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Build User Prompt (Line 140-200):                              │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ # Question Context                                       │  │
│ │ **User Question:** "How many patients have simple..."    │  │
│ │                                                          │  │
│ │ **Intent Analysis:**                                     │  │
│ │ - Type: outcome_analysis                                │  │
│ │ - Scope: aggregate                                      │  │
│ │ - Metrics: ["patient_count"]                            │  │
│ │ - Confidence: 0.9                                       │  │
│ │                                                          │  │
│ │ **Filters:**                                             │  │
│ │ - treatment_type: simple bandage = "simple_bandage"     │  │
│ │   ↑ Uses filter.value from intent ❌                     │  │
│ │                                                          │  │
│ │ **Terminology:**                                         │  │
│ │ - userTerm: "simple bandage"                            │  │
│ │   fieldValue: "Simple Bandage"                          │  │
│ │   semanticConcept: "treatment_type"                     │  │
│ │   confidence: 0.95                                      │  │
│ │                                                          │  │
│ │ **Forms:**                                               │  │
│ │ [Treatment Assessment form metadata...]                 │  │
│ │                                                          │  │
│ │ **Schema Context:**                                      │  │
│ │ [Detailed rpt.* schema...]                              │  │
│ └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│ LLM Generation (formatFiltersSection Line 202-219):            │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ /**Filters:**                                            │  │
│ │ - treatment_type: simple bandage = "simple_bandage"     │  │
│ │                                                          │  │
│ │ Reading this, LLM generates WHERE clause:               │  │
│ │ WHERE N.value = 'simple_bandage'  ← LLM uses provided  │  │
│ │ ❌ But actual database value is 'Simple Bandage'        │  │
│ └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ GENERATED SQL QUERY                                             ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ SELECT                                                          ┃
┃   COUNT(DISTINCT P.id) AS NumberOfPatientsWithSimpleBandage    ┃
┃ FROM                                                            ┃
┃   rpt.Patient AS P                                              ┃
┃ JOIN                                                            ┃
┃   rpt.Note AS N ON P.id = N.patientFk                           ┃
┃ JOIN                                                            ┃
┃   rpt.AttributeType AS AT ON N.attributeTypeFk = AT.id          ┃
┃ WHERE                                                           ┃
┃   AT.name = 'Treatment Applied'                                ┃
┃   AND N.value = 'simple_bandage'   ← ❌ WRONG VALUE             ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE QUERY EXECUTION                                        │
│ SQL Server (rpt.*)                                              │
├─────────────────────────────────────────────────────────────────┤
│ Searching for:                                                  │
│   WHERE AT.name = 'Treatment Applied'                           │
│     AND N.value = 'simple_bandage'                              │
│                                                                 │
│ Actual data in rpt.Note:                                        │
│   N.value = 'Simple Bandage'        ← Title Case, not snake_case
│                                                                 │
│ String Comparison Result:                                       │
│   'simple_bandage' = 'Simple Bandage' ?                         │
│   FALSE ❌                                                       │
│   (Case-sensitive, format mismatch)                             │
│                                                                 │
│ RESULT: 0 rows ❌                                               │
│ EXPECTED: N rows (actual count)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Parallel Comparison: What SHOULD Happen

```
CORRECT FLOW:
━━━━━━━━━━━━

User Input: "simple bandage"
    ↓
Intent Classification: {value: null}  ← Leave empty
    ↓
Terminology Mapper: Search SemanticIndexOption
    ↓
Match Found: "Simple Bandage" (exact database value)
    ↓
SQL Generation: WHERE N.value = 'Simple Bandage'
    ↓
Database Match: ✅ FOUND


ACTUAL FLOW:
━━━━━━━━━━━

User Input: "simple bandage"
    ↓
Intent Classification: {value: "simple_bandage"}  ← LLM guesses
    ↓
Terminology Mapper: Not applied to value (already populated)
    ↓
SQL Generation: WHERE N.value = 'simple_bandage'
    ↓
Database Match: ❌ NOT FOUND
```

---

## Terminology Mapper Deep Dive

### Search Pattern Generation

**Input:** "simple bandage"  
**Normalized:** "simple bandage" (lowercase, no underscores!)  
**Search patterns generated:**
- `%simple bandage%`
- `%simple% %bandage%`
- `%simple%`
- `%bandage%`

### SemanticIndexOption Query

```sql
SELECT
  opt.option_value,
  opt.option_code,
  opt.semantic_category,
  opt.confidence,
  field.field_name,
  field.semantic_concept,
  idx.form_name
FROM "SemanticIndexOption" opt
JOIN "SemanticIndexField" field 
  ON opt.semantic_index_field_id = field.id
JOIN "SemanticIndex" idx 
  ON field.semantic_index_id = idx.id
WHERE idx.customer_id = $1
  AND (
    COALESCE(opt.option_value, '') ILIKE ANY($2)  ← Patterns
    OR COALESCE(opt.semantic_category, '') ILIKE ANY($2)
    OR LOWER(COALESCE(opt.option_code, '')) = $3   ← Normalized code
  )
ORDER BY opt.confidence DESC NULLS LAST, opt.option_value ASC
LIMIT 50
```

### Matching Logic

```
For term "simple bandage":
┌────────────────────────────────────────────────────┐
│ Candidate: option_value = "Simple Bandage"         │
├────────────────────────────────────────────────────┤
│ 1. Normalize both:                                 │
│    Term:      "simple bandage"                     │
│    Candidate: "simple bandage" (lowercased)        │
│                                                    │
│ 2. Lexical Similarity (Levenshtein):               │
│    Distance = 0                                    │
│    Similarity = 1.0 ✅                             │
│                                                    │
│ 3. Token Overlap:                                  │
│    Term tokens: ["simple", "bandage"]              │
│    Candidate tokens: ["simple", "bandage"]         │
│    Overlap = 2/2 = 1.0 ✅                          │
│                                                    │
│ 4. Confidence Score:                               │
│    confidence * 0.55 + lexical * 0.3 + overlap    │
│    0.96 * 0.55 + 1.0 * 0.3 + 1.0 * 0.1            │
│    = 0.528 + 0.3 + 0.1                            │
│    = 0.928 ≥ 0.7 (threshold) ✅                   │
│                                                    │
│ RESULT: Match found with confidence 0.928         │
│ fieldValue = "Simple Bandage" ✅                   │
└────────────────────────────────────────────────────┘
```

---

## Data Storage Layer

### Form Discovery Pipeline

```
Silhouette Database (SQL Server)
        ↓
dbo.AttributeLookup
  ├─ id: 1
  ├─ text: "Simple Bandage"
  ├─ code: "SB"
  └─ attributeTypeFk: 456
        ↓
Form Discovery Service (form-discovery.service.ts)
  - Query: "SELECT id, [text], [code] FROM dbo.AttributeLookup"
  - Extract: text="Simple Bandage", code="SB"
  - Get embedding for "Simple Bandage"
  - Match against ClinicalOntology → semantic_category
        ↓
PostgreSQL InsightGen Database
        ↓
SemanticIndexOption
  ├─ id: uuid-123
  ├─ semantic_index_field_id: uuid-456
  ├─ option_value: "Simple Bandage"  ✅ EXACT match
  ├─ option_code: "SB"
  ├─ semantic_category: "treatment_type"
  └─ confidence: 0.96
```

---

## Key Values at Each Stage

| Stage | Value | Format | Source | Status |
|-------|-------|--------|--------|--------|
| **User Input** | simple bandage | Natural language | User | ✅ Correct |
| **Intent Filter - userTerm** | simple bandage | As-is | Preserved by LLM | ✅ Correct |
| **Intent Filter - value** | simple_bandage | LLM guess | LLM output | ❌ Wrong |
| **Terminology Mapping - found** | Simple Bandage | From database | SemanticIndexOption | ✅ Correct |
| **SQL Generation** | simple_bandage | From intent | Filter value | ❌ Wrong |
| **SQL WHERE clause** | 'simple_bandage' | String literal | SQL | ❌ Wrong |
| **Database - actual** | Simple Bandage | Title Case | Silhouette data | ✅ Correct |
| **Query Result** | 0 rows | No match | WHERE mismatch | ❌ Wrong |

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: User Interface                                      │
│ Input: "How many patients have simple bandage?"             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: Intent Classification (AI)                         │
│ Output: IntentFilter { value: "simple_bandage" }            │
│ ⚠️ Issues: LLM guesses without semantic database context     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Semantic Mapping                                   │
│ Purpose: Find actual database values                        │
│ Status: ✅ Works correctly but INPUT is already wrong      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4: SQL Generation (AI)                                │
│ Input: Filter value from Layer 2 (wrong)                    │
│ Output: WHERE N.value = 'simple_bandage'                    │
│ ⚠️ Issue: Incorrect value propagates from Layer 2           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 5: Database Query                                     │
│ Result: 0 rows (no match with 'Simple Bandage')             │
│ Root cause: Incorrect value from Layer 2                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 6: Data (SQL Server)                                  │
│ Actual value: 'Simple Bandage' (Title Case)                │
│ Status: ✅ Data is correct, usage is wrong                  │
└─────────────────────────────────────────────────────────────┘
```

---

## The Three-Layer Problem

```
LAYER A: Intent Classification
  Generate filter.value = "simple_bandage" (LLM guess)
  
  ⚠️ PROBLEM: No context from SemanticIndexOption
     LLM doesn't know what values exist in database

LAYER B: Semantic Mapping  
  Finds correct value = "Simple Bandage" in database
  
  ⚠️ PROBLEM: Intent filter already has value
     Terminology mapper designed to ENRICH, not OVERRIDE

LAYER C: SQL Generation
  Uses Layer A value "simple_bandage" (wrong)
  Doesn't use Layer B value "Simple Bandage" (right)
  
  ⚠️ PROBLEM: No validation that generated SQL will match data
```

**Result:** Correct data exists, but wrong value flows through system.


