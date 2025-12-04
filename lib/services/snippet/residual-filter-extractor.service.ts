/**
 * Residual Filter Extractor Service (Phase 3)
 *
 * Extracts residual filters from user queries using LLM semantic understanding.
 * This extracts filters NOT already captured by placeholder extraction.
 *
 * Philosophy: LLM-based semantic extraction (not pattern-based)
 * Uses ModelRouterService to respect user's provider selection and admin configuration.
 */

import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { getModelRouterService } from "@/lib/services/semantic/model-router.service";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import type { ResidualFilter } from "./residual-filter-validator.service";

export interface ResidualFilterExtractionInput {
  query: string;
  alreadyExtractedPlaceholders: Record<string, any>; // Placeholders already extracted
  semanticContext: {
    fields?: Array<{ name: string; type?: string }>;
    enums?: Record<string, string[]>;
    assessmentTypes?: string[];
  };
  customerId: string;
  modelId?: string; // User's selected model (for ModelRouter)
}

interface LLMExtractionResponse {
  filters: Array<{
    field: string;
    operator: string;
    value: any;
    originalText: string;
    required: boolean;
    confidence?: number;
  }>;
}

/**
 * Extract residual filters using LLM semantic understanding.
 *
 * This asks the LLM to identify any data constraints in the query
 * that were NOT already captured by placeholder extraction.
 */
export async function extractResidualFiltersWithLLM(
  input: ResidualFilterExtractionInput
): Promise<ResidualFilter[]> {
  const { query, alreadyExtractedPlaceholders, semanticContext } = input;

  console.log(
    `[ResidualFilterExtractor] 🤖 Extracting residual filters from query`
  );

  // If no placeholders extracted, all filters are "residual"
  const placeholderKeys = Object.keys(alreadyExtractedPlaceholders);
  if (placeholderKeys.length === 0) {
    console.log(
      `[ResidualFilterExtractor] ⚠️ No placeholders extracted, skipping residual extraction`
    );
    return [];
  }

  // Build prompt for LLM
  const prompt = buildResidualFilterExtractionPrompt(
    query,
    placeholderKeys,
    semanticContext
  );

  try {
    // Use ModelRouterService to select appropriate model within user's provider family
    const userModelId = input.modelId || DEFAULT_AI_MODEL_ID;
    const modelRouter = getModelRouterService();

    let selectedModelId = userModelId;
    try {
      const modelSelection = await modelRouter.selectModel({
        userSelectedModelId: userModelId,
        complexity: "simple",
        taskType: "clarification", // Filter extraction is a clarification-like task
      });
      selectedModelId = modelSelection.modelId;
      console.log(
        `[ResidualFilterExtractor] 🎯 Model selected: ${selectedModelId} (${modelSelection.rationale})`
      );
    } catch (error) {
      console.warn(
        `[ResidualFilterExtractor] ⚠️ Model router unavailable, using user-selected model: ${userModelId}`,
        error
      );
    }

    const provider = await getAIProvider(selectedModelId);

    const startTime = Date.now();
    const response = await provider.complete({
      system:
        "You are a precise healthcare data query analyzer. Extract data constraints from user queries. Return only valid JSON.",
      userMessage: prompt,
      maxTokens: 1000,
      temperature: 0.1,
    });
    const duration = Date.now() - startTime;

    console.log(`[ResidualFilterExtractor] ✅ LLM responded in ${duration}ms`);

    // Parse response
    const parsed = parseLLMResponse(response);

    if (!parsed || !parsed.filters || parsed.filters.length === 0) {
      console.log(`[ResidualFilterExtractor] ℹ️ No residual filters extracted`);
      return [];
    }

    // Convert to ResidualFilter format
    const residualFilters: ResidualFilter[] = parsed.filters.map((f) => ({
      field: f.field,
      operator: f.operator,
      value: f.value,
      source: "llm_extraction",
      originalText: f.originalText,
      required: f.required || false,
      confidence: f.confidence || 0.8,
    }));

    console.log(
      `[ResidualFilterExtractor] ✅ Extracted ${residualFilters.length} residual filter(s)`
    );

    return residualFilters;
  } catch (error) {
    console.error(`[ResidualFilterExtractor] ❌ Extraction failed:`, error);
    // Return empty array on error (graceful degradation)
    return [];
  }
}

/**
 * Build prompt for LLM residual filter extraction.
 */
function buildResidualFilterExtractionPrompt(
  query: string,
  alreadyExtractedKeys: string[],
  semanticContext: ResidualFilterExtractionInput["semanticContext"]
): string {
  const availableFields =
    semanticContext.fields?.map((f) => `${f.name} (${f.type || "string"})`) ||
    [];
  const enumFields = semanticContext.enums
    ? Object.keys(semanticContext.enums)
    : [];

  return `
Extract data constraints (filters) from this user query that are NOT already captured by these placeholders:

**User Query:** "${query}"

**Already Extracted Placeholders:**
${alreadyExtractedKeys.map((k) => `- ${k}`).join("\n")}

**Available Database Fields:**
${
  availableFields.length > 0
    ? availableFields.map((f) => `- ${f}`).join("\n")
    : "None specified"
}

**Enum Fields (with allowed values):**
${
  enumFields.length > 0
    ? enumFields
        .map((f) => `- ${f}: [${semanticContext.enums![f].join(", ")}]`)
        .join("\n")
    : "None specified"
}

**Task:**
Identify any filters/constraints in the query that are NOT in the "Already Extracted Placeholders" list.

**Examples:**
- Query: "Show area reduction at 12 weeks for female patients"
  - Already extracted: timePointDays=84
  - Residual: patient_gender = "F" (from "female patients")

- Query: "Visits in ICU without billing"
  - Already extracted: assessment_type="visit"
  - Residual: care_unit = "ICU" (from "in ICU")

**Return Format (JSON only):**
{
  "filters": [
    {
      "field": "patient_gender",
      "operator": "=",
      "value": "F",
      "originalText": "female patients",
      "required": true,
      "confidence": 0.9
    }
  ]
}

**Rules:**
1. Only extract filters NOT in already-extracted placeholders
2. Use field names from "Available Database Fields"
3. For enum fields, use values from allowed values list
4. Mark as "required" if user used emphasis words (only, for, in, specifically)
5. Return empty array if no residual filters found
`;
}

/**
 * Parse LLM response into structured format.
 */
function parseLLMResponse(response: string): LLMExtractionResponse | null {
  try {
    // Try to extract JSON from response (may have markdown code blocks)
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/```\s*([\s\S]*?)\s*```/) ||
      response;

    const jsonStr = typeof jsonMatch === "string" ? jsonMatch : jsonMatch[1];
    const parsed = JSON.parse(jsonStr.trim());

    // Validate structure
    if (!parsed.filters || !Array.isArray(parsed.filters)) {
      console.warn(
        `[ResidualFilterExtractor] ⚠️ Invalid response structure: missing filters array`
      );
      return { filters: [] };
    }

    return parsed;
  } catch (error) {
    console.error(
      `[ResidualFilterExtractor] ❌ Failed to parse LLM response:`,
      error
    );
    return null;
  }
}
