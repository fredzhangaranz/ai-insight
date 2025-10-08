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
- Replace literal IDs, dates, numbers, and text filters with meaningful {placeholders}.
- Prefer camelCase placeholder names (patientId, windowDays, endDate, topK).
- Ensure every placeholder used in sqlPattern has a corresponding slot in placeholdersSpec.
- Keep the original intent of the SQL; do not introduce new joins or filters.
- Use schema hints to pick accurate semantic types; include default TOP 1000 if it was missing.
- Keywords should be distinct, lower-case words or short phrases.
- Examples should paraphrase the original question and cover common variants.
- If something cannot be inferred confidently, add a warning explaining the gap.

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
    if (typeof obj[key] !== "string" || (obj[key] as string).trim().length === 0) {
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
      if (slot.type !== undefined && slot.type !== null && typeof slot.type !== "string") {
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

  if (obj.keywords !== undefined && obj.keywords !== null && !isStringArray(obj.keywords)) {
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
