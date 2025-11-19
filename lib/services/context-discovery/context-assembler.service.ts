import { randomUUID } from "crypto";
import type {
  ContextBundle,
  ContextBundleMetadata,
  FieldInContext,
  FormInContext,
  AssessmentTypeInContext,
  IntentClassificationResult,
  JoinPath,
  TerminologyMapping,
} from "./types";

const DEFAULT_VERSION = "1.0";

export interface ContextAssemblyParams {
  customerId: string;
  question: string;
  intent: IntentClassificationResult;
  forms?: FormInContext[];
  assessmentTypes?: AssessmentTypeInContext[]; // Phase 5A
  terminology?: TerminologyMapping[];
  joinPaths?: JoinPath[];
  metadataOverrides?: Partial<ContextBundleMetadata>;
  durationMs?: number;
  discoveryRunId?: string;
  version?: string;
}

export class ContextAssemblerService {
  assembleContextBundle(params: ContextAssemblyParams): ContextBundle {
    const {
      customerId,
      question,
      intent,
      metadataOverrides,
      durationMs,
      discoveryRunId,
      version,
    } = params;

    if (!customerId || !customerId.trim()) {
      throw new Error("[ContextAssembler] customerId is required");
    }
    if (!question || !question.trim()) {
      throw new Error("[ContextAssembler] question is required");
    }
    if (!intent) {
      throw new Error("[ContextAssembler] intent result is required");
    }

    const forms = params.forms ? [...params.forms] : [];
    const assessmentTypes = params.assessmentTypes ? [...params.assessmentTypes] : undefined; // Phase 5A
    const terminology = params.terminology ? [...params.terminology] : [];
    const joinPaths = params.joinPaths ? [...params.joinPaths] : [];

    const overallConfidence = this.calculateOverallConfidence(
      intent,
      forms,
      terminology,
      joinPaths
    );

    const metadata = this.buildMetadata({
      overrides: metadataOverrides,
      durationMs,
      discoveryRunId,
      version,
    });

    return {
      customerId,
      question: question.trim(),
      intent,
      forms,
      assessmentTypes, // Phase 5A: Include assessment types if found
      terminology,
      joinPaths,
      overallConfidence,
      metadata,
    };
  }

  private calculateOverallConfidence(
    intent: IntentClassificationResult,
    forms: FormInContext[],
    terminology: TerminologyMapping[],
    joinPaths: JoinPath[]
  ): number {
    const intentScore = this.clamp(intent?.confidence ?? 0);

    const formFieldConfidences = forms.flatMap((form) => {
      const fieldConfidences = (form.fields ?? [])
        .map((field) => this.clamp(field.confidence ?? form.confidence ?? 0))
        .filter((value) => value > 0);
      if (fieldConfidences.length > 0) {
        return fieldConfidences;
      }
      if (typeof form.confidence === "number") {
        return [this.clamp(form.confidence)];
      }
      return [];
    });
    const formsScore = this.average(formFieldConfidences);

    const terminologyScore = this.average(
      terminology.map((entry) => this.clamp(entry.confidence ?? 0))
    );

    const joinPathScore = this.average(
      joinPaths.map((path) => this.clamp(path.confidence ?? 0))
    );

    const rawScore =
      intentScore * 0.3 +
      formsScore * 0.3 +
      terminologyScore * 0.25 +
      joinPathScore * 0.15;

    return this.clamp(rawScore);
  }

  private average(values: number[]): number {
    if (!values || values.length === 0) {
      return 0;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return this.clamp(sum / values.length);
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private buildMetadata({
    overrides,
    durationMs,
    discoveryRunId,
    version,
  }: {
    overrides?: Partial<ContextBundleMetadata>;
    durationMs?: number;
    discoveryRunId?: string;
    version?: string;
  }): ContextBundleMetadata {
    const resolvedDuration =
      typeof durationMs === "number" && durationMs >= 0 ? durationMs : 0;

    return {
      discoveryRunId:
        overrides?.discoveryRunId ??
        discoveryRunId ??
        randomUUID(),
      timestamp: overrides?.timestamp ?? new Date().toISOString(),
      durationMs: overrides?.durationMs ?? resolvedDuration,
      version: overrides?.version ?? version ?? DEFAULT_VERSION,
    };
  }
}

let instance: ContextAssemblerService | null = null;

export function getContextAssemblerService(): ContextAssemblerService {
  if (!instance) {
    instance = new ContextAssemblerService();
  }
  return instance;
}
