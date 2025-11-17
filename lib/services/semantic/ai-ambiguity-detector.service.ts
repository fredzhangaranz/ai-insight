/**
 * AI-Powered Ambiguity Detection Service
 *
 * Uses Gemini Flash to detect and generate clarification options for ambiguous filter terms
 * that cannot be mapped to semantic database fields.
 *
 * Examples:
 * - "young patients" → Age-based options (< 18, < 25, < 40)
 * - "recent assessments" → Temporal options (last 7 days, 30 days, 90 days)
 * - "large wounds" → Size-based options (> 10cm², > 25cm², > 50cm²)
 * - "severe wounds" → Severity options (Stage 3/4, infected, large)
 */

import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import type { ClarificationRequest, ClarificationOption } from "@/lib/prompts/generate-query.prompt";

/**
 * Semantic context about available database schema
 */
export interface SemanticContext {
  availableFields: Array<{
    fieldName: string;
    tableName: string;
    dataType: string;
  }>;
  commonFilters: string[]; // e.g., ["age", "date", "wound_area", "infection_status"]
}

/**
 * Input for AI ambiguity detection
 */
export interface AmbiguityDetectionInput {
  ambiguousTerm: string;
  originalQuestion: string;
  customerId: string;
  semanticContext?: SemanticContext;
  ambiguousMatches?: Array<{
    field: string;
    value: string;
    confidence: number;
  }>;
}

/**
 * AI response structure
 */
interface AIAmbiguityResponse {
  isComputable: boolean;
  category: 'age' | 'temporal' | 'size' | 'severity' | 'status' | 'field_disambiguation' | null;
  reasoning: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    sqlConstraint: string;
    isDefault?: boolean;
  }>;
}

/**
 * Generates AI-powered clarification options for ambiguous filter terms
 */
export async function generateAIClarification(
  input: AmbiguityDetectionInput
): Promise<ClarificationRequest | null> {
  const { ambiguousTerm, originalQuestion, ambiguousMatches } = input;

  console.log(`[AIAmbiguity] 🤖 Analyzing ambiguous term: "${ambiguousTerm}"`);

  try {
    // Use Gemini Flash for fast, cheap ambiguity detection
    const provider = await getAIProvider('gemini-2.5-flash');

    const prompt = buildAmbiguityDetectionPrompt(input);

    const startTime = Date.now();
    const response = await provider.complete({
      system: "You are a precise healthcare data query analyzer. Return only valid JSON.",
      userMessage: prompt,
      maxTokens: 1500,
      temperature: 0.1, // Low temperature for consistent structure
    });
    const duration = Date.now() - startTime;

    console.log(`[AIAmbiguity] ✅ AI responded in ${duration}ms`);

    // Parse and validate AI response
    const parsed = parseAIResponse(response);

    if (!parsed || !parsed.isComputable || !parsed.options || parsed.options.length === 0) {
      console.log(`[AIAmbiguity] ⚠️ AI determined "${ambiguousTerm}" is not computable`);
      return null;
    }

    // Validate SQL constraints for safety
    const validOptions = parsed.options.filter(option => {
      const isValid = validateSQLConstraint(option.sqlConstraint);
      if (!isValid) {
        console.warn(`[AIAmbiguity] ⚠️ Invalid SQL constraint rejected: ${option.sqlConstraint}`);
      }
      return isValid;
    });

    if (validOptions.length === 0) {
      console.warn(`[AIAmbiguity] ❌ All SQL constraints were invalid`);
      return null;
    }

    // Add custom option
    validOptions.push({
      id: 'custom',
      label: 'Something else (enter manually)',
      description: 'Specify your own SQL constraint',
      sqlConstraint: '',
      isDefault: false,
    });

    console.log(`[AIAmbiguity] ✅ Generated ${validOptions.length - 1} valid options for "${ambiguousTerm}"`);

    // Convert to ClarificationRequest format
    return {
      id: `ai_ambiguity_${normalizeId(ambiguousTerm)}`,
      ambiguousTerm,
      question: buildClarificationQuestion(ambiguousTerm, parsed.category, ambiguousMatches),
      options: validOptions,
      allowCustom: true,
    };
  } catch (error) {
    console.error('[AIAmbiguity] ❌ Failed to generate AI clarification:', error);
    return null;
  }
}

/**
 * Builds the prompt for AI ambiguity detection
 */
function buildAmbiguityDetectionPrompt(input: AmbiguityDetectionInput): string {
  const { ambiguousTerm, originalQuestion, ambiguousMatches } = input;

  // Special case: Field disambiguation (multiple semantic fields matched)
  if (ambiguousMatches && ambiguousMatches.length > 0) {
    return buildFieldDisambiguationPrompt(ambiguousTerm, ambiguousMatches);
  }

  // General case: Computable constraint detection
  return `
You are a healthcare data query assistant analyzing an ambiguous filter term.

**Original Question:** "${originalQuestion}"
**Ambiguous Term:** "${ambiguousTerm}"

**Available Database Schema:**
- Patient table (P): id, age, gender, admission_date, discharge_date
- Wound table (W): id, area, depth, stage, infected, healing_rate
- Assessment table (A): id, date, patient_fk, wound_fk
- Note table (N): id, value, field_name, assessment_fk

**Task:**
Determine if "${ambiguousTerm}" can be expressed as a SQL constraint (COMPUTABLE) or not (UNMAPPABLE).

**Categories of Computable Constraints:**

1. **AGE**: Terms like "young", "elderly", "pediatric", "adult", "child", "teenage", "millennial"
   - Generate age thresholds using P.age column
   - Examples: P.age < 18, P.age >= 65, P.age BETWEEN 25 AND 40

2. **TEMPORAL**: Terms like "recent", "old", "new", "latest", "current", "stale"
   - Generate date ranges using A.date column
   - Use DATEADD() function (MS SQL Server syntax)
   - Examples: A.date >= DATEADD(day, -30, GETDATE())

3. **SIZE**: Terms like "large", "small", "big", "tiny", "significant", "substantial"
   - Generate area thresholds using W.area column
   - Examples: W.area > 25, W.area < 5

4. **SEVERITY**: Terms like "serious", "severe", "mild", "moderate", "critical"
   - Generate conditions using W.stage, W.infected, or W.area
   - Examples: W.stage IN (3, 4), W.infected = 1, W.area > 50

5. **STATUS**: Terms like "active", "inactive", "ongoing", "resolved", "healing"
   - Generate conditions using W.healing_rate or date comparisons
   - Examples: W.healing_rate > 0, A.date >= DATEADD(day, -7, GETDATE())

**UNMAPPABLE Examples:**
- Personal references: "my patients", "patients I saw", "Fred"
- Subjective without metrics: "good patients", "interesting cases"
- Unknown attributes: "patients with blue eyes" (not in schema)

**Critical Rules:**
1. ONLY use table aliases: P (Patient), W (Wound), A (Assessment), N (Note)
2. ONLY reference columns that exist in the schema above
3. Use DATEADD(day, -N, GETDATE()) for date calculations
4. Mark the most clinically common threshold as default
5. Generate 3-5 options with varying thresholds
6. Keep SQL constraints simple (single condition per option)

**Return Format (JSON only, no markdown):**
{
  "isComputable": true/false,
  "category": "age" | "temporal" | "size" | "severity" | "status" | null,
  "reasoning": "Brief explanation of decision",
  "options": [
    {
      "id": "unique_id",
      "label": "User-friendly label",
      "description": "Clinical explanation (optional)",
      "sqlConstraint": "Valid SQL WHERE clause",
      "isDefault": true/false
    }
  ]
}

**Example 1 - AGE (Computable):**
Input: "young patients"
Output:
{
  "isComputable": true,
  "category": "age",
  "reasoning": "Age-based filter can be computed using Patient.age column",
  "options": [
    {
      "id": "age_pediatric",
      "label": "Under 18 (pediatric)",
      "description": "Patients under 18 years old",
      "sqlConstraint": "P.age < 18",
      "isDefault": false
    },
    {
      "id": "age_young_adult",
      "label": "Under 25 (young adult)",
      "description": "Common healthcare definition for young patients",
      "sqlConstraint": "P.age < 25",
      "isDefault": true
    },
    {
      "id": "age_under_40",
      "label": "Under 40",
      "description": "Younger adult cohort",
      "sqlConstraint": "P.age < 40",
      "isDefault": false
    }
  ]
}

**Example 2 - TEMPORAL (Computable):**
Input: "recent assessments"
Output:
{
  "isComputable": true,
  "category": "temporal",
  "reasoning": "Temporal filter can be computed using Assessment.date column",
  "options": [
    {
      "id": "temporal_week",
      "label": "Last 7 days",
      "description": "Assessments within the past week",
      "sqlConstraint": "A.date >= DATEADD(day, -7, GETDATE())",
      "isDefault": false
    },
    {
      "id": "temporal_month",
      "label": "Last 30 days",
      "description": "Assessments within the past month",
      "sqlConstraint": "A.date >= DATEADD(day, -30, GETDATE())",
      "isDefault": true
    },
    {
      "id": "temporal_quarter",
      "label": "Last 90 days",
      "description": "Assessments within the past quarter",
      "sqlConstraint": "A.date >= DATEADD(day, -90, GETDATE())",
      "isDefault": false
    }
  ]
}

**Example 3 - UNMAPPABLE:**
Input: "patients I saw yesterday"
Output:
{
  "isComputable": false,
  "category": null,
  "reasoning": "Cannot determine which patients the user saw without user-specific context or tracking data",
  "options": []
}

Now analyze: "${ambiguousTerm}"
Return ONLY the JSON object, no additional text.
`.trim();
}

/**
 * Builds prompt for field disambiguation (when multiple semantic fields matched)
 */
function buildFieldDisambiguationPrompt(
  ambiguousTerm: string,
  ambiguousMatches: Array<{ field: string; value: string; confidence: number }>
): string {
  const matchesDescription = ambiguousMatches
    .map((m, i) => `${i + 1}. Field: "${m.field}", Value: "${m.value}" (confidence: ${m.confidence.toFixed(2)})`)
    .join('\n');

  return `
You are helping disambiguate which database field the user meant.

**User's Term:** "${ambiguousTerm}"

**Multiple Fields Matched:**
${matchesDescription}

**Task:**
Generate clarification options to help the user choose which field they meant.

**Return Format (JSON only):**
{
  "isComputable": true,
  "category": "field_disambiguation",
  "reasoning": "Multiple semantic fields contain similar values",
  "options": [
    {
      "id": "field_0",
      "label": "Field Name: Value",
      "description": "Additional context about this field",
      "sqlConstraint": "FieldName = 'Value'",
      "isDefault": true/false
    }
  ]
}

Mark the highest confidence match as default.
Return ONLY the JSON object.
`.trim();
}

/**
 * Parses AI response and validates structure
 */
function parseAIResponse(response: string): AIAmbiguityResponse | null {
  try {
    // Remove markdown code blocks if present
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanedResponse);

    // Validate required fields
    if (typeof parsed.isComputable !== 'boolean') {
      console.warn('[AIAmbiguity] Invalid response: missing isComputable');
      return null;
    }

    if (!parsed.isComputable) {
      return parsed as AIAmbiguityResponse;
    }

    // Validate computable response has options
    if (!Array.isArray(parsed.options) || parsed.options.length === 0) {
      console.warn('[AIAmbiguity] Invalid response: computable but no options');
      return null;
    }

    // Validate each option
    for (const option of parsed.options) {
      if (!option.id || !option.label || !option.sqlConstraint) {
        console.warn('[AIAmbiguity] Invalid option:', option);
        return null;
      }
    }

    return parsed as AIAmbiguityResponse;
  } catch (error) {
    console.error('[AIAmbiguity] Failed to parse AI response:', error);
    console.error('[AIAmbiguity] Raw response:', response);
    return null;
  }
}

/**
 * Validates SQL constraint for safety
 *
 * Ensures:
 * - No destructive operations (DROP, DELETE, UPDATE, INSERT)
 * - No command execution (EXEC, xp_cmdshell)
 * - Looks like a valid WHERE clause constraint
 */
function validateSQLConstraint(constraint: string): boolean {
  if (!constraint || typeof constraint !== 'string') {
    return false;
  }

  // Forbidden patterns (destructive operations)
  const forbidden = [
    /DROP\s+TABLE/i,
    /DELETE\s+FROM/i,
    /UPDATE\s+\w+\s+SET/i,
    /INSERT\s+INTO/i,
    /EXEC(?:UTE)?/i,
    /xp_cmdshell/i,
    /sp_executesql/i,
    /;/,  // No command chaining
  ];

  if (forbidden.some(pattern => pattern.test(constraint))) {
    return false;
  }

  // Must look like a WHERE clause constraint
  // Valid patterns:
  // - P.age < 18
  // - W.area > 25
  // - A.date >= DATEADD(day, -30, GETDATE())
  // - W.stage IN (3, 4)
  // - W.infected = 1
  const validPatterns = [
    /^[A-Z]\.[a-z_]+ *(=|<|>|<=|>=|!=|<>|LIKE|IN|BETWEEN) *.+$/i,
    /^[A-Z]\.[a-z_]+ *(IS NULL|IS NOT NULL)$/i,
    /^DATEADD\(/i,
    /^[A-Z]\.[a-z_]+ +IN +\(.+\)$/i,
  ];

  return validPatterns.some(pattern => pattern.test(constraint.trim()));
}

/**
 * Normalizes ambiguous term to valid ID
 */
function normalizeId(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/**
 * Builds clarification question based on category
 */
function buildClarificationQuestion(
  ambiguousTerm: string,
  category: AIAmbiguityResponse['category'],
  ambiguousMatches?: Array<{ field: string; value: string; confidence: number }>
): string {
  if (category === 'field_disambiguation') {
    return `Which field did you mean by "${ambiguousTerm}"?`;
  }

  // Default question
  return `What do you mean by "${ambiguousTerm}"?`;
}
