/**
 * Field Resolver Service
 * Pre-flight AI call to resolve which patient fields the user's text refers to.
 * Surfaces unknown, ambiguous, and out-of-scope terms before the main interpret call.
 */

import { getAIProvider } from "@/lib/ai/get-provider";
import { fuzzyMatchOption } from "./dropdown-constraint.service";
import type { FieldSchema } from "./generation-spec.types";

export interface MatchedField {
  fieldName: string;
  columnName: string;
}

export interface UnmatchedTerm {
  userTerm: string;
  suggestions: string[];
}

export interface AmbiguousTerm {
  userTerm: string;
  candidates: string[];
}

export interface OutOfScopeTerm {
  userTerm: string;
  reason: string;
}

export interface FieldResolution {
  matched: MatchedField[];
  unmatched: UnmatchedTerm[];
  ambiguous: AmbiguousTerm[];
  outOfScope: OutOfScopeTerm[];
}

const ALWAYS_INCLUDE_COLUMNS = ["firstName", "lastName"];

function buildCompactSchema(schema: FieldSchema[]): string {
  const fieldNameCounts = new Map<string, number>();
  for (const f of schema) {
    const k = f.fieldName.trim();
    fieldNameCounts.set(k, (fieldNameCounts.get(k) ?? 0) + 1);
  }

  return schema
    .map((f) => {
      const displayName =
        (fieldNameCounts.get(f.fieldName.trim()) ?? 0) > 1 && f.patientNoteName
          ? `${f.fieldName} [${f.patientNoteName}]`
          : f.fieldName;
      return `${displayName} | ${f.columnName} | ${f.patientNoteName ?? ""}`;
    })
    .join("\n");
}

function addFuzzySuggestions(
  unmatched: UnmatchedTerm[],
  schema: FieldSchema[]
): UnmatchedTerm[] {
  const fieldNameCounts = new Map<string, number>();
  for (const f of schema) {
    const k = f.fieldName.trim();
    fieldNameCounts.set(k, (fieldNameCounts.get(k) ?? 0) + 1);
  }
  const allDisplayNames = schema.map((f) =>
    (fieldNameCounts.get(f.fieldName.trim()) ?? 0) > 1 && f.patientNoteName
      ? `${f.fieldName} [${f.patientNoteName}]`
      : f.fieldName
  );
  const uniqueNames = [...new Set(allDisplayNames)];

  return unmatched.map((u) => {
    if (u.suggestions.length > 0) return u;
    const { matched, alternatives } = fuzzyMatchOption(u.userTerm, uniqueNames);
    const combined = [matched, ...alternatives].filter(Boolean);
    return { ...u, suggestions: [...new Set(combined)].slice(0, 3) };
  });
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

const SYSTEM_PROMPT_PREFIX = `You are a field resolver for a patient data system.
Given a user's description and a list of available patient fields,
identify which fields the user wants to set.

Rules:
1. Only match against the fields listed above.
2. If a term clearly refers to a field, add it to "matched" with fieldName and columnName from the list.
3. If a term has no match in the list, add it to "unmatched" with userTerm only (suggestions will be added automatically).
4. If a term matches multiple fields (same fieldName, different patientNoteName), add to "ambiguous" with candidates as the full display names from the list.
5. If a term refers to wounds, assessments, or forms (not patient fields), add to "outOfScope" with a brief reason.
6. Output ONLY valid JSON. No markdown, no explanation.

Output format:
{
  "matched": [{ "fieldName": "...", "columnName": "..." }],
  "unmatched": [{ "userTerm": "..." }],
  "ambiguous": [{ "userTerm": "...", "candidates": ["Field [Note]", "Field [Other]"] }],
  "outOfScope": [{ "userTerm": "...", "reason": "..." }]
}`;

export async function resolveFieldsFromText(
  description: string,
  schema: FieldSchema[],
  modelId?: string
): Promise<FieldResolution> {
  const compactSchema = buildCompactSchema(schema);
  const systemPrompt = `Available fields (fieldName | columnName | patientNoteName):
${compactSchema}

${SYSTEM_PROMPT_PREFIX}`;

  const userMessage = description.trim() || "Generate patients with default criteria";

  const provider = await getAIProvider(modelId);
  const raw = await provider.complete({
    system: systemPrompt,
    userMessage,
    temperature: 0.1,
  });

  const jsonStr = extractJson(raw);
  let parsed: {
    matched?: Array<{ fieldName?: string; columnName?: string }>;
    unmatched?: Array<{ userTerm?: string; suggestions?: string[] }>;
    ambiguous?: Array<{ userTerm?: string; candidates?: string[] }>;
    outOfScope?: Array<{ userTerm?: string; reason?: string }>;
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(
      `Failed to parse field resolution: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const schemaByColumn = new Map(schema.map((f) => [f.columnName, f]));
  const matched: MatchedField[] = [];
  for (const m of parsed.matched ?? []) {
    const col = m.columnName?.trim();
    if (!col || !schemaByColumn.has(col)) continue;
    const src = schemaByColumn.get(col)!;
    matched.push({ fieldName: src.fieldName, columnName: src.columnName });
  }

  const alwaysInclude = schema.filter((f) =>
    ALWAYS_INCLUDE_COLUMNS.includes(f.columnName)
  );
  for (const f of alwaysInclude) {
    if (!matched.some((m) => m.columnName === f.columnName)) {
      matched.push({ fieldName: f.fieldName, columnName: f.columnName });
    }
  }

  const unmatched: UnmatchedTerm[] = (parsed.unmatched ?? []).map((u) => ({
    userTerm: String(u.userTerm ?? "").trim(),
    suggestions: Array.isArray(u.suggestions) ? u.suggestions : [],
  }));

  const ambiguous: AmbiguousTerm[] = (parsed.ambiguous ?? []).map((a) => ({
    userTerm: String(a.userTerm ?? "").trim(),
    candidates: Array.isArray(a.candidates) ? a.candidates : [],
  }));

  const outOfScope: OutOfScopeTerm[] = (parsed.outOfScope ?? []).map((o) => ({
    userTerm: String(o.userTerm ?? "").trim(),
    reason: String(o.reason ?? "").trim(),
  }));

  const resolution: FieldResolution = {
    matched,
    unmatched: addFuzzySuggestions(unmatched, schema),
    ambiguous,
    outOfScope,
  };

  return resolution;
}
