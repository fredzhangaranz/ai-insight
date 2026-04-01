import { createHash } from "crypto";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { BaseProvider } from "@/lib/ai/providers/base-provider";
import {
  constructQuerySemanticsExtractionPrompt,
  QUERY_SEMANTICS_EXTRACTION_SYSTEM_PROMPT,
  validateQuerySemanticsExtractionResponse,
} from "@/lib/prompts/query-semantics-extraction.prompt";
import type {
  CanonicalClarificationItem,
  CanonicalQuerySemantics,
  CanonicalQueryShape,
  CanonicalSubjectReferenceKind,
  CanonicalSubjectReferenceStatus,
  IntentClassificationResult,
  SubjectRef,
} from "./types";

interface QuerySemanticsExtractorOptions {
  customerId: string;
  question: string;
  intent: IntentClassificationResult;
  modelId?: string;
  signal?: AbortSignal;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class QuerySemanticsExtractorCache {
  private responseCache = new Map<string, CacheEntry<CanonicalQuerySemantics>>();
  private readonly ttlMs = 60 * 60 * 1000;

  private key(input: QuerySemanticsExtractorOptions): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          customerId: input.customerId,
          question: input.question,
          intent: input.intent,
        })
      )
      .digest("hex");
  }

  get(input: QuerySemanticsExtractorOptions): CanonicalQuerySemantics | null {
    const key = this.key(input);
    const entry = this.responseCache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.responseCache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(
    input: QuerySemanticsExtractorOptions,
    value: CanonicalQuerySemantics
  ): void {
    this.responseCache.set(this.key(input), {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function inferQueryShape(intent: IntentClassificationResult): CanonicalQueryShape {
  if (intent.type === "trend_analysis") {
    return "trend";
  }
  if (intent.type === "cohort_comparison") {
    return "comparison";
  }
  if (intent.scope === "individual_patient") {
    return "individual_subject";
  }
  if (intent.scope === "patient_cohort") {
    return "cohort";
  }
  return "aggregate";
}

function inferReferenceKind(text: string): CanonicalSubjectReferenceKind {
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(
      text
    )
  ) {
    return "guid";
  }
  if (/\d/.test(text) || /[-_]/.test(text)) {
    return "domain_id";
  }
  return "name";
}

function inferReferenceStatus(
  ref: SubjectRef
): CanonicalSubjectReferenceStatus {
  if (ref.entityType === "patient") {
    return "requires_resolution";
  }
  return "candidate";
}

export function deriveCanonicalQuerySemanticsFallback(
  question: string,
  intent: IntentClassificationResult
): CanonicalQuerySemantics {
  const frame = intent.semanticFrame;
  const subjectRefs: SubjectRef[] = (frame?.entityRefs || []).map((ref) => {
    const normalized: SubjectRef = {
      entityType:
        ref.type === "assessment_type" ? "assessment_type" : ref.type,
      mentionText: ref.text,
      referenceKind: inferReferenceKind(ref.text),
      status: "candidate",
      confidence: clampConfidence(ref.confidence),
      explicit: ref.explicit,
    };
    normalized.status = inferReferenceStatus(normalized);
    return normalized;
  });

  const clarificationPlan: CanonicalClarificationItem[] = (
    frame?.clarificationNeeds || []
  ).map((need) => ({
    slot: need.slot,
    reason: need.reason,
    question: need.question,
    blocking: true,
    confidence: clampConfidence(need.confidence),
    target: need.target,
  }));

  const requiresPatientResolution = subjectRefs.some(
    (ref) => ref.entityType === "patient" && ref.status === "requires_resolution"
  );

  return {
    version: "v1",
    queryShape: inferQueryShape(intent),
    analyticIntent: intent.type,
    measureSpec: {
      metrics: [...(intent.metrics || [])],
      subject: frame?.subject?.value ?? null,
      grain: frame?.grain?.value ?? null,
      groupBy: [...(frame?.groupBy?.value || [])],
      aggregatePredicates: [...(frame?.aggregatePredicates || [])],
      presentationIntent:
        frame?.presentation?.value ??
        intent.presentationIntent ??
        null,
      preferredVisualization:
        frame?.preferredVisualization?.value ??
        intent.preferredVisualization ??
        null,
    },
    subjectRefs,
    temporalSpec: intent.timeRange
      ? {
          kind: "relative_range",
          unit: intent.timeRange.unit,
          value: intent.timeRange.value,
          rawText: question,
        }
      : {
          kind: "none",
          rawText: null,
        },
    valueSpecs: (frame?.filters || intent.filters || []).map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      userPhrase: filter.userPhrase || filter.userTerm || "",
      value: filter.value,
      resolved: Boolean(filter.value),
    })),
    clarificationPlan,
    executionRequirements: {
      requiresPatientResolution,
      requiredBindings: requiresPatientResolution ? ["patientId1"] : [],
      allowSqlGeneration: !clarificationPlan.some((item) => item.blocking),
      blockReason: clarificationPlan.find((item) => item.blocking)?.reason,
    },
  };
}

async function resolveModelId(modelId?: string): Promise<string> {
  if (modelId?.trim()) {
    return modelId.trim();
  }

  try {
    const configLoader = await import("@/lib/config/ai-config-loader").then((m) =>
      m.AIConfigLoader.getInstance()
    );
    const { providers } = await configLoader.getConfiguration();
    const defaultProvider = providers.find((provider) => provider.isDefault);
    return (
      defaultProvider?.configData.complexQueryModelId ||
      defaultProvider?.configData.modelId ||
      providers[0]?.configData.complexQueryModelId ||
      providers[0]?.configData.modelId ||
      DEFAULT_AI_MODEL_ID
    );
  } catch {
    return DEFAULT_AI_MODEL_ID;
  }
}

export class QuerySemanticsExtractorService {
  private cache = new QuerySemanticsExtractorCache();

  async extract(
    input: QuerySemanticsExtractorOptions
  ): Promise<CanonicalQuerySemantics> {
    const cached = this.cache.get(input);
    if (cached) {
      return cached;
    }

    const fallback = deriveCanonicalQuerySemanticsFallback(
      input.question,
      input.intent
    );

    try {
      const selectedModelId = await resolveModelId(input.modelId);
      const provider = (await getAIProvider(selectedModelId)) as BaseProvider;
      const response = await provider.complete({
        system: QUERY_SEMANTICS_EXTRACTION_SYSTEM_PROMPT,
        userMessage: constructQuerySemanticsExtractionPrompt({
          question: input.question,
          intent: input.intent,
          semanticFrame: input.intent.semanticFrame,
        }),
        maxTokens: 1400,
        temperature: 0,
      });
      const validation = validateQuerySemanticsExtractionResponse(response);
      if (!validation.valid || !validation.result) {
        return fallback;
      }

      const merged: CanonicalQuerySemantics = {
        ...validation.result,
        executionRequirements: {
          ...validation.result.executionRequirements,
          requiredBindings:
            validation.result.executionRequirements.requiresPatientResolution &&
            validation.result.executionRequirements.requiredBindings.length === 0
              ? ["patientId1"]
              : validation.result.executionRequirements.requiredBindings,
        },
      };
      this.cache.set(input, merged);
      return merged;
    } catch (error) {
      console.warn(
        "[QuerySemanticsExtractor] Falling back to deterministic semantics:",
        error
      );
      return fallback;
    }
  }
}

let instance: QuerySemanticsExtractorService | null = null;

export function getQuerySemanticsExtractorService(): QuerySemanticsExtractorService {
  if (!instance) {
    instance = new QuerySemanticsExtractorService();
  }
  return instance;
}
