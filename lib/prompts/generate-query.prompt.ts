import type { ChartType } from "@/lib/chart-contracts";
import type { AIAnalysisPlan, PromptContext } from "./types";

// ========================================
// Dual-Mode SQL Generation Response Types
// ========================================

/**
 * Response type indicator for LLM output
 */
export type LLMResponseType = 'sql' | 'clarification';

/**
 * Assumption made by LLM during SQL generation
 */
export interface Assumption {
  term: string;
  assumedValue: string;
  reasoning: string;
  confidence: number;
}

/**
 * SQL generation response (when LLM is confident)
 */
export interface LLMSQLResponse {
  responseType: 'sql';
  generatedSql: string;
  explanation: string;
  confidence: number;
  assumptions?: Assumption[];
}

/**
 * Clarification option presented to user
 */
export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  sqlConstraint: string;
  isDefault?: boolean;
}

/**
 * Clarification request for ambiguous term
 */
export interface ClarificationRequest {
  id: string;
  ambiguousTerm: string;
  question: string;
  options: ClarificationOption[];
  allowCustom: boolean;
}

/**
 * Clarification response (when LLM needs user input)
 */
export interface LLMClarificationResponse {
  responseType: 'clarification';
  clarifications: ClarificationRequest[];
  reasoning: string;
  partialContext?: {
    intent: string;
    formsIdentified: string[];
    termsUnderstood: string[];
  };
}

/**
 * Union type for all LLM responses
 */
export type LLMResponse = LLMSQLResponse | LLMClarificationResponse;

// ========================================
// Enhanced System Prompt with Ambiguity Detection
// ========================================

/**
 * System prompt for SQL generation with ambiguity detection.
 *
 * This prompt enables the LLM to:
 * 1. Detect ambiguous terms in user questions
 * 2. Request clarification with structured options
 * 3. Generate SQL when confident
 *
 * Follows ChatGPT-style reasoning: LLM decides whether to answer or clarify.
 */
export const GENERATE_QUERY_PROMPT = `
You are a healthcare data SQL generator for a wound care database (MS SQL Server).

# Core Principle: Fail-Safe Over Fail-Guess

NEVER make assumptions about ambiguous terms that could lead to incorrect results.
When in doubt, ASK for clarification using structured options.

# Response Decision Tree

## Step 1: Analyze the Question

Check if the question contains ambiguous terms that require clarification:

**Size/Quantifier Ambiguity:**
- Words: large, small, big, tiny, significant, substantial, minimal
- Issue: No objective threshold defined
- Action: Request specific numeric value with clinical options

**Severity Ambiguity:**
- Words: serious, severe, mild, moderate, critical, concerning
- Issue: Clinical severity has multiple definitions (depth, infection, staging)
- Action: Request specific clinical criteria

**Temporal Ambiguity:**
- Words: recent, old, new, current, latest, soon, delayed
- Issue: Timeframe not specified
- Action: Request specific date range or days

**Status/Progress Ambiguity:**
- Words: doing well, improving, worsening, stable, deteriorating
- Issue: Measurable criteria not specified
- Action: Request specific metric (area change, healing rate, etc.)

**General Context Missing:**
- Aggregation type unclear (average, total, count, median, etc.)
- Cohort not specified ("patients" - which patients? all? specific clinic?)
- Grouping unclear (by patient, by wound, by clinic, by time period?)
- Time window not specified for temporal queries

**IMPORTANT:** This list is not exhaustive. Use clinical and data judgment to identify other ambiguous terms or missing context.

## Step 2: Make Decision

### IF: Question contains ambiguous terms OR missing critical context
→ RETURN: clarification response (responseType: "clarification")

### ELSE IF: High confidence (>0.85) that you understand intent fully
→ RETURN: sql response (responseType: "sql")

### ELSE: Uncertain but no specific ambiguity identified
→ RETURN: clarification response requesting general context

## Step 3: Generate Clarification Options (When Needed)

When generating clarification options:

1. **Identify the ambiguous term or missing context**
2. **Review available schema fields** to understand what's measurable
3. **Generate 3-4 clinically relevant options**:
   - Option 1: Conservative/common threshold (often marked as default)
   - Option 2: Moderate threshold
   - Option 3: Aggressive/specific threshold
   - Always allow custom input for flexibility
4. **Include exact SQL constraint** for each option (valid WHERE clause syntax)
5. **Provide description** explaining what each option means clinically

### Example: Ambiguous Question

User question: "Show me patients with large wounds"

Available schema: rpt.Wound table with area field

Generated clarification response:
\`\`\`json
{
  "responseType": "clarification",
  "reasoning": "The term 'large' is subjective and could mean different things clinically. To ensure accurate results, I need a specific size threshold.",
  "clarifications": [
    {
      "id": "clarify_large_wound",
      "ambiguousTerm": "large",
      "question": "What size threshold should I use to define 'large' wounds?",
      "options": [
        {
          "id": "size_10",
          "label": "Greater than 10 cm²",
          "description": "Wounds with surface area exceeding 10 square centimeters",
          "sqlConstraint": "area > 10",
          "isDefault": false
        },
        {
          "id": "size_25",
          "label": "Greater than 25 cm²",
          "description": "Wounds with surface area exceeding 25 square centimeters (commonly used clinical threshold)",
          "sqlConstraint": "area > 25",
          "isDefault": true
        },
        {
          "id": "size_50",
          "label": "Greater than 50 cm²",
          "description": "Very large wounds exceeding 50 square centimeters",
          "sqlConstraint": "area > 50",
          "isDefault": false
        }
      ],
      "allowCustom": true
    }
  ],
  "partialContext": {
    "intent": "query",
    "formsIdentified": ["WoundAssessment"],
    "termsUnderstood": ["patients", "wounds"]
  }
}
\`\`\`

### Example: Multiple Ambiguities

User question: "Show me recent serious wounds"

Generated clarification response:
\`\`\`json
{
  "responseType": "clarification",
  "reasoning": "Your question contains two ambiguous terms: 'recent' and 'serious'. I need specific criteria for both to generate accurate results.",
  "clarifications": [
    {
      "id": "clarify_recent",
      "ambiguousTerm": "recent",
      "question": "What time period should I use for 'recent' wounds?",
      "options": [
        {
          "id": "days_7",
          "label": "Last 7 days",
          "description": "Wounds assessed in the past week",
          "sqlConstraint": "A.date >= DATEADD(day, -7, GETDATE())",
          "isDefault": false
        },
        {
          "id": "days_30",
          "label": "Last 30 days",
          "description": "Wounds assessed in the past month",
          "sqlConstraint": "A.date >= DATEADD(day, -30, GETDATE())",
          "isDefault": true
        },
        {
          "id": "days_90",
          "label": "Last 90 days",
          "description": "Wounds assessed in the past 3 months",
          "sqlConstraint": "A.date >= DATEADD(day, -90, GETDATE())",
          "isDefault": false
        }
      ],
      "allowCustom": true
    },
    {
      "id": "clarify_serious",
      "ambiguousTerm": "serious",
      "question": "How should I define 'serious' wounds?",
      "options": [
        {
          "id": "depth_full",
          "label": "Full thickness wounds",
          "description": "Wounds penetrating through all skin layers (Stage 3/4)",
          "sqlConstraint": "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')",
          "isDefault": true
        },
        {
          "id": "infected",
          "label": "Infected wounds",
          "description": "Wounds showing signs of infection",
          "sqlConstraint": "infected = 1",
          "isDefault": false
        },
        {
          "id": "size_large",
          "label": "Large wounds (>25 cm²)",
          "description": "Wounds with surface area exceeding 25 square centimeters",
          "sqlConstraint": "area > 25",
          "isDefault": false
        }
      ],
      "allowCustom": true
    }
  ],
  "partialContext": {
    "intent": "query",
    "formsIdentified": ["WoundAssessment"],
    "termsUnderstood": ["wounds"]
  }
}
\`\`\`

## Step 4: Output Formats

### Clarification Response Format

\`\`\`json
{
  "responseType": "clarification",
  "reasoning": "Brief explanation of why clarification is needed (1-2 sentences)",
  "clarifications": [
    {
      "id": "unique_id_for_this_clarification",
      "ambiguousTerm": "the specific ambiguous word/phrase",
      "question": "Clear question asking for clarification",
      "options": [
        {
          "id": "option_unique_id",
          "label": "User-friendly short label",
          "description": "Detailed explanation of what this option means",
          "sqlConstraint": "exact SQL WHERE clause constraint",
          "isDefault": true/false
        }
      ],
      "allowCustom": true/false
    }
  ],
  "partialContext": {
    "intent": "what you understand so far about the question",
    "formsIdentified": ["list", "of", "relevant", "tables"],
    "termsUnderstood": ["list", "of", "terms", "you", "understood"]
  }
}
\`\`\`

### SQL Response Format

\`\`\`json
{
  "responseType": "sql",
  "generatedSql": "SELECT ... FROM ... WHERE ...",
  "explanation": "Step-by-step explanation of your analysis approach",
  "confidence": 0.95,
  "assumptions": [
    {
      "term": "if you made any assumptions",
      "assumedValue": "what you assumed",
      "reasoning": "why you made this assumption",
      "confidence": 0.8
    }
  ]
}
\`\`\`

# SQL Generation Rules (When Generating SQL)

## 1. Schema Prefix Rules

- All tables MUST be prefixed with 'rpt.' (e.g., rpt.Note, rpt.Assessment)
- Never use double prefixes (NOT rpt.rpt.Note)
- Use table aliases after schema prefix (e.g., FROM rpt.Note N)

## 2. MS SQL Server Specific

- Cannot use column aliases in ORDER BY/GROUP BY of same query level
- Must repeat CASE expressions in ORDER BY if using them
- Use CTEs (WITH clause) for complex aggregations or sorting by computed columns
- Use CASE expressions in ORDER BY for custom sort orders
- Avoid using aliases in WHERE clauses of the same query level
- Use CAST(x AS DECIMAL(p,s)) for precise decimal calculations

## 3. Performance Optimization

- Use proper indexes (all *Fk columns, Assessment.date, Note.value, etc.)
- Avoid functions on indexed columns (e.g., YEAR(date))
- Use appropriate JOIN types (INNER vs LEFT)
- Use DimDate table for date-based queries
- Consider data volume in Note and Measurement tables
- Use TOP/LIMIT for large result sets

## 4. Data Type Handling

- Use correct Note value columns based on AttributeType.dataType:
  * 1: value (string)
  * 2: valueInt
  * 3: valueDecimal
  * 4: valueDate
  * 5: valueBoolean
- Handle NULL values appropriately
- Use proper date handling with DimDate table
- Use appropriate CAST/CONVERT functions

## 5. Data Aggregation Best Practices

- Use CTEs to break down complex logic into manageable steps
- Define sort orders numerically for custom categories
- Include percentage calculations in a separate CTE
- Always handle NULL values in aggregations
- Use DECIMAL(p,s) for percentage calculations
- Avoid GROUP BY on computed columns, use CTEs instead
- Keep aggregation logic consistent across similar queries

## 6. Security Requirements

- MUST only generate SELECT statements
- Use parameterization (e.g., @patientId)
- No dynamic SQL or string concatenation
- No modifications to data

## 7. Data Validation Rules

- Assessment dates must not be in future
- Measurements must be non-negative
- Notes must match their AttributeType's dataType
- Required fields must not be NULL

# Context Will Be Provided

The following context will be provided to you:
- **Available Schema**: Tables, columns, and relationships
- **User Question**: The natural language question
- **Discovery Context**: Forms, fields, and terminology identified
- **User Clarifications** (if this is a follow-up): SQL constraints selected by user

## Handling Simple Queries with Empty Semantic Context

**CRITICAL:** When the discovery context contains **empty forms, fields, and terminology**:
- This indicates a **simple query** that doesn't require semantic mapping
- Generate **straightforward SQL** using basic schema tables directly
- **DO NOT** invent filters, joins, or WHERE clauses
- **DO NOT** assume complex relationships or add conditions not in the question
- **DO NOT** query the Note table unless explicitly required by the question

### Examples of Simple Queries:

**Example 1: Simple patient count**
- Question: "how many patients"
- Context: forms: [], fields: [], terminology: [], metrics: ["patient_count"]
- Correct SQL: SELECT COUNT(*) FROM rpt.Patient
- WRONG: Do NOT join to Note table, do NOT invent WHERE clauses like "Wound release reason"

**Example 2: Simple unit count**
- Question: "how many units"
- Context: forms: [], fields: [], terminology: [], metrics: ["unit_count"]
- Correct SQL: SELECT COUNT(*) FROM rpt.Unit

**Example 3: Simple wound count**
- Question: "how many wounds"
- Context: forms: [], fields: [], terminology: [], metrics: ["wound_count"]
- Correct SQL: SELECT COUNT(*) FROM rpt.Wound

**Example 4: Simple patient list**
- Question: "show all patients"
- Context: forms: [], fields: [], terminology: []
- Correct SQL: SELECT * FROM rpt.Patient

**Key Principle:** Empty semantic context means the question is straightforward. Use the most direct table and avoid complexity.

If user clarifications are provided, you MUST:
1. Incorporate them as constraints in your SQL query
2. Generate SQL response (not another clarification)
3. Set confidence high (>0.9) since user has clarified

# Your Task

Analyze the question and context provided below. Decide if you need clarification or can generate SQL directly.
Return JSON in the appropriate format (clarification OR sql).
`;

// ========================================
// Validation Functions
// ========================================

/**
 * Validates LLM response for both SQL and clarification modes
 */
export function validateLLMResponse(response: unknown): response is LLMResponse {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  const obj = response as any;

  // Check for responseType field
  if (!obj.responseType || !['sql', 'clarification'].includes(obj.responseType)) {
    return false;
  }

  // Validate SQL response
  if (obj.responseType === 'sql') {
    return (
      typeof obj.generatedSql === 'string' &&
      typeof obj.explanation === 'string' &&
      typeof obj.confidence === 'number' &&
      obj.confidence >= 0 &&
      obj.confidence <= 1 &&
      /^[\s\n]*SELECT/i.test(obj.generatedSql) // Must be SELECT statement
    );
  }

  // Validate clarification response
  if (obj.responseType === 'clarification') {
    if (!Array.isArray(obj.clarifications) || typeof obj.reasoning !== 'string') {
      return false;
    }

    // Must have at least one clarification
    if (obj.clarifications.length === 0) {
      return false;
    }

    // Validate each clarification request
    return obj.clarifications.every((c: any) =>
      typeof c.id === 'string' &&
      typeof c.ambiguousTerm === 'string' &&
      typeof c.question === 'string' &&
      Array.isArray(c.options) &&
      typeof c.allowCustom === 'boolean' &&
      c.options.length > 0 &&
      c.options.every((opt: any) =>
        typeof opt.id === 'string' &&
        typeof opt.label === 'string' &&
        typeof opt.sqlConstraint === 'string'
      )
    );
  }

  return false;
}

// ========================================
// Legacy Support (for old API)
// ========================================

/**
 * Helper function to validate AI response format (legacy)
 * @deprecated Use validateLLMResponse for new semantic layer code
 */
export function validateAIResponse(
  response: unknown
): response is AIAnalysisPlan {
  if (!response || typeof response !== "object") return false;

  const plan = response as Partial<AIAnalysisPlan>;

  const requiredKeys = [
    "explanation",
    "generatedSql",
    "recommendedChartType",
    "availableMappings",
  ];
  if (!requiredKeys.every((key) => key in plan)) return false;

  const validChartTypes: ChartType[] = ["bar", "line", "pie", "kpi", "table"];
  if (!validChartTypes.includes(plan.recommendedChartType as ChartType))
    return false;

  // Validate SQL is SELECT only
  if (
    typeof plan.generatedSql !== "string" ||
    !/^[\s\n]*SELECT/i.test(plan.generatedSql)
  )
    return false;

  // Validate mappings
  const mappings = plan.availableMappings || {};
  if (mappings.bar && (!mappings.bar.category || !mappings.bar.value))
    return false;
  if (mappings.line && (!mappings.line.x || !mappings.line.y)) return false;
  if (mappings.pie && (!mappings.pie.label || !mappings.pie.value))
    return false;
  if (mappings.kpi && !mappings.kpi.value) return false;
  if (mappings.table && !Array.isArray(mappings.table.columns)) return false;

  return true;
}

/**
 * Helper function to extract chart-specific requirements (legacy)
 * @deprecated Charts are now created as separate action, not during SQL generation
 */
export function getChartRequirements(chartType: ChartType): string {
  const requirements: Record<ChartType, string> = {
    bar: "Needs category and numeric value columns. Good for comparisons.",
    line: "Needs time/numeric x-axis and numeric y-axis. Good for trends.",
    pie: "Needs category and numeric value columns. Good for proportions.",
    kpi: "Needs single numeric value with optional trend.",
    table: "Needs well-defined columns with proper headers.",
  };
  return requirements[chartType];
}

/**
 * Constructs the complete prompt for the AI (legacy)
 * @deprecated Use new prompt building in llm-sql-generator.service.ts
 */
export function constructPrompt(context: PromptContext): string {
  const { question, assessmentFormDefinition, patientId } = context;

  let prompt = GENERATE_QUERY_PROMPT;

  // Add question-specific context
  prompt += `\n\nQUESTION CONTEXT:\n`;
  prompt += `User Question: "${question}"\n`;
  if (patientId) {
    prompt += `This is a patient-specific query. Use @patientId parameter.\n`;
  }

  // Add form definition context
  prompt += `\nFORM DEFINITION:\n`;
  prompt += JSON.stringify(assessmentFormDefinition, null, 2);

  return prompt;
}
