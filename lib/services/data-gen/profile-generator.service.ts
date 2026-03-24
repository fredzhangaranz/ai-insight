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
  sanitizeFieldProfiles,
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
  /**
   * Specific trajectory styles to generate.
   * If omitted, all 4 styles are generated (backward compat).
   * If provided, only these styles are generated.
   */
  selectedStyles?: WoundProgressionStyle[];
}

/**
 * Generate trajectory-aware field profiles via AI.
 * Fires one request per selected trajectory style in parallel for faster wall-clock time.
 * When selectedStyles is provided, only generates those profiles (Tier 2 optimization).
 * When selectedStyles is omitted, generates all 4 styles for backward compatibility.
 */
export async function generateFieldProfiles(
  input: GenerateProfilesInput,
): Promise<FieldProfileSet> {
  const schema = input.formSchema.filter((f) => f.dataType !== "ImageCapture");
  if (schema.length === 0) return buildFallbackProfiles(input.formSchema);

  const provider = await getAIProvider(input.modelId);
  const stylesToGenerate = input.selectedStyles ?? TRAJECTORY_STYLES;

  const results = await Promise.allSettled(
    stylesToGenerate.map((style) =>
      generateSingleProfile(style, schema, input.woundBaselineAreaRange ?? [5, 50], provider),
    ),
  );

  const profiles: FieldProfileSet = stylesToGenerate.map((style, i) => {
    const result = results[i];
    if (result.status === "fulfilled") return result.value;
    console.warn(`[generateFieldProfiles] style=${style} failed, using fallback:`, result.reason);
    return buildSingleFallbackProfile(style, schema);
  });

  return sanitizeFieldProfiles(
    normalizeProfiles(profiles, schema, stylesToGenerate),
    schema,
  );
}

const SYSTEM_PROMPT = `You are a clinical data generation assistant. Given a wound assessment form schema and a single wound healing trajectory, produce ONE TrajectoryFieldProfile as a JSON object.

The object must have:
- trajectoryStyle: the exact style name provided
- clinicalSummary: brief description of that trajectory
- phases: array of 3 objects (early, mid, late) with:
  - phase: "early" | "mid" | "late"
  - description: e.g. "Weeks 1-3: active wound, heavy exudate"
  - fieldDistributions: array of { fieldName, columnName, weights } where weights is { "optionValue": 0.5, ... } summing to 1

Rules:
1. wound_state / healing_status / wound_status fields MUST align with the trajectory at each phase
2. ONLY use option values from the schema options array
3. For SingleSelectList/MultiSelectList, every option must appear in weights (can be 0)
4. For Text/Decimal/Integer, omit from fieldDistributions
5. early = first 33% of assessments, mid = 33-66%, late = 66-100%
6. Output ONLY valid JSON. No markdown, no explanation.`;

async function generateSingleProfile(
  style: WoundProgressionStyle,
  schema: FieldSchema[],
  areaRange: [number, number],
  provider: Awaited<ReturnType<typeof getAIProvider>>,
): Promise<TrajectoryFieldProfile> {
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

  const userMessage = `Form schema:
${schemaJson}

Trajectory style: ${style}
Description: ${TRAJECTORY_DESCRIPTIONS[style]}
Baseline area range: ${areaRange[0]}-${areaRange[1]} cm²

Produce a single TrajectoryFieldProfile JSON object for the "${style}" trajectory. Include 3 phases (early, mid, late) with fieldDistributions for each dropdown/select field.`;

  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    userMessage,
    temperature: 0.2,
  });

  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr) as TrajectoryFieldProfile;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid profile response for style=${style}`);
  }
  return { ...parsed, trajectoryStyle: style };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    return trimmed.slice(objStart, objEnd + 1);
  }
  return trimmed;
}

function normalizeProfiles(
  raw: FieldProfileSet,
  schema: FieldSchema[],
  styles: WoundProgressionStyle[] = TRAJECTORY_STYLES,
): FieldProfileSet {
  const result: FieldProfileSet = [];

  for (const style of styles) {
    const existing = raw.find((p) => p.trajectoryStyle === style);
    const profile: TrajectoryFieldProfile = existing
      ? { ...existing, trajectoryStyle: style }
      : buildSingleFallbackProfile(style, schema);

    const phases: TrajectoryPhaseProfile[] = (["early", "mid", "late"] as const).map(
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
