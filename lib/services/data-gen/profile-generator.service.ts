/**
 * Profile Generator Service
 * Generates trajectory-aware field value distributions via AI (or deterministic fallback)
 * Server-only: imports getAIProvider. For client fallback use profile-fallback.ts.
 */

import { getAIProvider } from "@/lib/ai/get-provider";
import type { FieldSchema } from "./generation-spec.types";
import type {
  FieldProfileSet,
  TrajectoryFieldProfile,
  TrajectoryPhaseProfile,
} from "./trajectory-field-profile.types";
import type { WoundProgressionStyle } from "./generation-spec.types";
import {
  buildFallbackProfiles,
  buildSingleFallbackProfile,
  buildFallbackPhase,
} from "./profile-fallback";

const TRAJECTORY_STYLES: WoundProgressionStyle[] = [
  "Exponential",
  "JaggedLinear",
  "JaggedFlat",
  "NPTraditionalDisposable",
];

const TRAJECTORY_DESCRIPTIONS: Record<WoundProgressionStyle, string> = {
  Exponential:
    "Fast-healing wound — area halves every ~2 weeks, typically healed within 4 weeks",
  JaggedLinear:
    "Slow healing — gradual improvement over time, may not fully heal within assessment period",
  JaggedFlat:
    "Non-healing / chronic — wound area stable or increasing, no improvement",
  NPTraditionalDisposable:
    "Treatment change — starts flat/deteriorating, then area decreases after treatment switch",
  NPDisposable: "Treatment change variant — similar to NPTraditionalDisposable",
};

export interface GenerateProfilesInput {
  formSchema: FieldSchema[];
  woundBaselineAreaRange?: [number, number];
  modelId?: string;
}

/**
 * Generate trajectory-aware field profiles via AI.
 * Returns 4 profiles (one per WoundProgressionStyle) with early/mid/late phases.
 */
export async function generateFieldProfiles(
  input: GenerateProfilesInput,
): Promise<FieldProfileSet> {
  const schema = input.formSchema.filter((f) => f.dataType !== "ImageCapture");
  if (schema.length === 0) return buildFallbackProfiles(input.formSchema);

  const schemaJson = JSON.stringify(
    schema.map((f) => ({
      fieldName: f.fieldName,
      columnName: f.columnName,
      dataType: f.dataType,
      options: f.options,
    })),
    null,
    2,
  );

  const trajectoryContext = TRAJECTORY_STYLES.map(
    (s) => `- ${s}: ${TRAJECTORY_DESCRIPTIONS[s]}`,
  ).join("\n");

  const areaRange = input.woundBaselineAreaRange ?? [5, 50];

  const systemPrompt = `You are a clinical data generation assistant. Given a wound assessment form schema and wound healing trajectory types, produce a FieldProfileSet (JSON array) with one profile per trajectory style.

Each profile must have:
- trajectoryStyle: one of Exponential, JaggedLinear, JaggedFlat, NPTraditionalDisposable
- clinicalSummary: brief description of that trajectory
- phases: array of 3 objects (early, mid, late) with:
  - phase: "early" | "mid" | "late"
  - description: e.g. "Weeks 1-3: active wound, heavy exudate"
  - fieldDistributions: array of { fieldName, columnName, weights } where weights is { "optionValue": 0.5, ... } summing to 1

Rules:
1. wound_state / healing_status / wound_status fields MUST align with trajectory at each phase (e.g. late-phase healing wound → Healing/Healed; late-phase deteriorating → Active/Deteriorating)
2. ONLY use option values from the schema options array
3. For SingleSelectList/MultiSelectList, every option in the schema must appear in weights (can be 0)
4. For Text/Decimal/Integer, omit from fieldDistributions (handled separately)
5. early = first 33% of assessments, mid = 33-66%, late = 66-100%
6. Output ONLY valid JSON. No markdown, no explanation.`;

  const userMessage = `Form schema:
${schemaJson}

Trajectory types:
${trajectoryContext}

Baseline area range: ${areaRange[0]}-${areaRange[1]} cm²

Produce a FieldProfileSet JSON array with 4 profiles (Exponential, JaggedLinear, JaggedFlat, NPTraditionalDisposable). Each profile has 3 phases (early, mid, late) with fieldDistributions for each dropdown/select field.`;

  try {
    const provider = await getAIProvider(input.modelId);
    const raw = await provider.complete({
      system: systemPrompt,
      userMessage,
      temperature: 0.2,
    });

    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as FieldProfileSet;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return buildFallbackProfiles(input.formSchema);
    }

    return normalizeProfiles(parsed, schema);
  } catch {
    return buildFallbackProfiles(input.formSchema);
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    return "[" + trimmed.slice(objStart, objEnd + 1) + "]";
  }
  return trimmed;
}

function normalizeProfiles(
  raw: FieldProfileSet,
  schema: FieldSchema[],
): FieldProfileSet {
  const schemaByColumn = new Map(schema.map((f) => [f.columnName, f]));
  const result: FieldProfileSet = [];

  for (const style of TRAJECTORY_STYLES) {
    const existing = raw.find((p) => p.trajectoryStyle === style);
    const profile: TrajectoryFieldProfile = existing
      ? { ...existing, trajectoryStyle: style }
      : buildSingleFallbackProfile(style, schema);

    const phases: TrajectoryPhaseProfile[] = ["early", "mid", "late"].map(
      (phase) => {
        const phaseData = profile.phases?.find((p) => p.phase === phase);
        return phaseData ?? buildFallbackPhase(phase, schema);
      },
    );
    profile.phases = phases;
    result.push(profile);
  }

  return result;
}
