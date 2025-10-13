import type { PlaceholdersSpec } from "@/lib/services/template-validator.service";

export interface TemplateExtractionAiResponse {
  name: string;
  intent: string;
  description: string;
  sqlPattern: string;
  placeholdersSpec?: PlaceholdersSpec | null;
  keywords?: string[];
  tags?: string[];
  examples?: string[];
  warnings?: string[];
}

function sanitizeContext(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function constructTemplateExtractionPrompt(
  questionText: string,
  sqlQuery: string,
  schemaContext: string
): string {
  const question = sanitizeContext(questionText);
  const sql = sqlQuery.trim();
  const schema = schemaContext.trim();

  return `You are an InsightGen template curator. Convert successful SQL into a reusable template that conforms to the Template Catalog schema.

Return ONLY a JSON object with this exact shape:
{
  "name": string,                      // descriptive title developers will recognize
  "intent": string,                    // taxonomy id (aggregation_by_category, time_series_trend, top_k, latest_per_entity, as_of_state, pivot, unpivot, join_analysis, note_collection)
  "description": string,               // 1-2 sentence summary of what the query answers
  "sqlPattern": string,                // same SQL rewritten with {placeholders}; keep MS SQL Server syntax and rpt. prefixes
  "placeholdersSpec": {
    "slots": [
      {
        "name": string,               // camelCase placeholder name used in sqlPattern
        "type": string | null,        // guid | int | string | date | boolean | float | decimal (omit if unknown)
        "semantic": string | null,    // optional semantic hint (patient_id, wound_id, time_window, etc.)
        "required": boolean,          // default true
        "default": any | null,        // SQL-safe default expression or literal
        "validators": string[] | null // optional validators such as "non-empty", "min:1", "max:365"
      }
    ]
  } | null,
  "keywords": string[],               // 5-10 lower-case tokens that help matching (no duplicates)
  "tags": string[],                   // optional UI tags (e.g., "patient-analysis", "time-series")
  "examples": string[],               // 3 example natural language questions for this template
  "warnings": string[]                // optional caveats for reviewers (empty array if none)
}

Guidelines:

## 1. SQL PATTERN SIMPLIFICATION (CRITICAL)
The provided SQL may contain funnel execution scaffolding that must be removed for template reusability:

REMOVE these patterns:
- Multi-step CTE chains named Step1_Results, Step2_Results, Step3_Results, etc.
- Temporary CTEs that only exist for funnel chaining (e.g., CTEs that just SELECT * from previous steps)
- Overly specific joins added for multi-step funnel execution but not core to the analytical intent

PRESERVE these patterns:
- CTEs that represent reusable analytical logic (date range calculations, complex aggregations, window functions)
- Essential subqueries that simplify the query logic
- CTEs that define reusable intermediate results (e.g., ranking, filtering)

TRANSFORMATION EXAMPLE:
❌ BAD (Funnel Scaffolding):
WITH Step1_Results AS (
  SELECT patientFk, woundFk FROM rpt.Assessment WHERE date >= '2024-01-01'
),
Step2_Results AS (
  SELECT patientFk, COUNT(*) AS woundCount FROM Step1_Results GROUP BY patientFk
),
Step3_Results AS (
  SELECT * FROM Step2_Results WHERE woundCount > 5
)
SELECT TOP 1000 * FROM Step3_Results ORDER BY woundCount DESC

✅ GOOD (Clean Template):
SELECT TOP 1000 
  patientFk, 
  COUNT(DISTINCT woundFk) AS woundCount
FROM rpt.Assessment
WHERE date >= {startDate}
GROUP BY patientFk
HAVING COUNT(DISTINCT woundFk) > {minWoundCount}
ORDER BY woundCount DESC

WHEN TO KEEP CTEs:
- Complex date logic: WITH DateRange AS (SELECT DATEADD(day, -{windowDays}, GETUTCDATE()) AS startDate)
- Window functions: WITH Ranked AS (SELECT ..., ROW_NUMBER() OVER (...) AS rn)
- Multiple aggregation levels: WITH CategoryTotals AS (...), OverallTotal AS (...)

## 2. INTENT CLASSIFICATION
Choose the BEST intent category that describes the SQL pattern:

- **aggregation_by_category**: COUNT/SUM/AVG grouped by categorical columns
  Examples: "Count wounds by etiology", "Average healing time by patient age group"
  SQL Pattern: SELECT category, COUNT(*) FROM table GROUP BY category

- **time_series_trend**: Track metrics over time with date-based grouping
  Examples: "Weekly assessment counts", "Wound area reduction over 30 days"
  SQL Pattern: SELECT date, metric FROM table GROUP BY date ORDER BY date

- **top_k**: Ranking queries with TOP N or ROW_NUMBER to find highest/lowest values
  Examples: "Top 10 patients with most wounds", "5 largest wounds"
  SQL Pattern: SELECT TOP N ... ORDER BY metric DESC

- **latest_per_entity**: Get most recent record for each entity using window functions
  Examples: "Latest assessment per patient", "Current wound state per wound"
  SQL Pattern: ROW_NUMBER() OVER (PARTITION BY entity ORDER BY date DESC) WHERE rn = 1

- **as_of_state**: Point-in-time snapshot using date range filters (startDate/endDate)
  Examples: "Active wounds as of 2024-01-01", "Patient status on specific date"
  SQL Pattern: WHERE startDate <= {asOfDate} AND (endDate IS NULL OR endDate > {asOfDate})

- **pivot**: Transform rows into columns (one column per category value)
  Examples: "Measurement types as columns", "One column per wound state"
  SQL Pattern: MAX(CASE WHEN category = 'X' THEN value END) AS X

- **unpivot**: Transform columns into rows (normalize wide data)
  Examples: "Convert column-per-metric to row-per-metric"
  SQL Pattern: UNPIVOT or UNION ALL pattern

- **note_collection**: Gather clinical notes/attributes filtered by AttributeType
  Examples: "Get pain scores", "Collect wound classification notes"
  SQL Pattern: JOIN rpt.Note ... JOIN rpt.AttributeType WHERE variableName IN (...)

- **join_analysis**: Combine data from multiple tables with meaningful joins
  Examples: "Patients with their assessments", "Wounds with measurement history"
  SQL Pattern: Multiple JOINs across rpt.Patient, rpt.Wound, rpt.Assessment, etc.

## 3. PLACEHOLDER & TYPE EXTRACTION
- Replace ALL literal values with {placeholders}: dates, GUIDs, numbers, strings, thresholds
- Prefer camelCase names: {patientId}, {startDate}, {windowDays}, {minCount}, {topK}
- Infer accurate types from SQL context:
  * guid: UUID-like IDs (e.g., patientFk = '...')
  * int: Counts, limits, TOP values, day offsets
  * date: Date literals, DATEADD results
  * string: Text filters, variableName values
  * decimal/float: Measurements, percentages, ratios
- Set semantic hints: patient_id, wound_id, date_filter, time_window, threshold, limit
- Add validators: "non-empty" for required strings, "min:1" for positive numbers, "max:365" for day ranges

## 4. KEYWORD QUALITY (CRITICAL FOR MATCHING)
Focus on DOMAIN-SPECIFIC terms that users naturally say:

✅ GOOD Keywords (domain-specific, user-facing):
- Clinical terms: wound, patient, assessment, measurement, etiology, healing, pain
- Analysis terms: trend, count, average, latest, active, status, history
- Time terms: daily, weekly, monthly, recent, current, as-of
- Attributes: area, depth, exudate, state, type, location

❌ BAD Keywords (generic SQL, too technical):
- SQL terms: select, from, where, join, group, order, top
- Generic: data, table, record, query, result
- Overly technical: cte, partition, rn, fk

AIM FOR: 5-10 distinctive, lower-case keywords/short phrases
INCLUDE: Synonyms users might say (e.g., "recent" + "latest", "count" + "total")

## 5. EXAMPLE QUESTIONS
Generate 3 natural language questions that:
- Paraphrase the original question in different ways
- Cover common variants (different time ranges, entities, thresholds)
- Use natural phrasing developers/analysts would actually type
- Include placeholder hints in curly braces where values vary

Example:
- "How many wounds does each patient have?"
- "Show me the wound count per patient"
- "Which patients have the most wounds?"

## 6. SAFETY & SCHEMA REQUIREMENTS
- Ensure TOP 1000 (or appropriate limit) if not present
- All tables MUST have rpt. prefix (rpt.Patient, rpt.Assessment, rpt.Note)
- Never use double prefixes (NOT rpt.rpt.Patient)
- Preserve table aliases (e.g., FROM rpt.Assessment AS A)

## 7. WARNINGS TO ADD
Add warnings when:
- Unable to determine accurate placeholder types → "Placeholder types inferred; verify accuracy"
- SQL contains Step*_Results but couldn't fully simplify → "May contain funnel scaffolding; manual review needed"
- Intent ambiguous between multiple categories → "Intent classification uncertain; verify"
- Missing TOP clause in original SQL → "Added TOP 1000 for safety"
- Complex nested CTEs preserved → "Template contains complex CTEs; ensure they're essential"

## General Principles
- Ensure every placeholder used in sqlPattern has a corresponding slot in placeholdersSpec
- Do NOT introduce new joins, filters, or logic not present in the original SQL
- If something cannot be inferred confidently, add a warning explaining the gap

Original question:
${question}

Successful SQL query:
${sql}

Schema reference (truncated is acceptable):
${schema}
`;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

export function validateTemplateExtractionResponse(
  value: unknown
): value is TemplateExtractionAiResponse {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  const requiredKeys: Array<keyof TemplateExtractionAiResponse> = [
    "name",
    "intent",
    "description",
    "sqlPattern",
  ];

  for (const key of requiredKeys) {
    if (
      typeof obj[key] !== "string" ||
      (obj[key] as string).trim().length === 0
    ) {
      return false;
    }
  }

  const spec = obj.placeholdersSpec;
  if (spec !== undefined && spec !== null) {
    if (typeof spec !== "object" || spec === null) return false;
    const slots = (spec as PlaceholdersSpec).slots;
    if (!Array.isArray(slots)) return false;
    for (const slot of slots) {
      if (!slot || typeof slot !== "object") return false;
      if (typeof slot.name !== "string" || slot.name.trim().length === 0) {
        return false;
      }
      if (
        slot.type !== undefined &&
        slot.type !== null &&
        typeof slot.type !== "string"
      ) {
        return false;
      }
      if (
        slot.semantic !== undefined &&
        slot.semantic !== null &&
        typeof slot.semantic !== "string"
      ) {
        return false;
      }
      if (slot.required !== undefined && typeof slot.required !== "boolean") {
        return false;
      }
      if (
        slot.validators !== undefined &&
        slot.validators !== null &&
        !isStringArray(slot.validators)
      ) {
        return false;
      }
    }
  }

  if (
    obj.keywords !== undefined &&
    obj.keywords !== null &&
    !isStringArray(obj.keywords)
  ) {
    return false;
  }

  if (obj.tags !== undefined && obj.tags !== null && !isStringArray(obj.tags)) {
    return false;
  }

  if (
    obj.examples !== undefined &&
    obj.examples !== null &&
    !isStringArray(obj.examples)
  ) {
    return false;
  }

  if (
    obj.warnings !== undefined &&
    obj.warnings !== null &&
    !isStringArray(obj.warnings)
  ) {
    return false;
  }

  return true;
}
