import type { InsightResult } from "@/lib/hooks/useInsights";
import type {
  ExecutionResult,
  ResolvedContext,
  TypedDomainPlan,
  ValidationResult,
} from "@/lib/services/domain-pipeline/types";

export class DomainResultMapperService {
  mapClarification(
    question: string,
    validation: ValidationResult,
    resolvedContext: ResolvedContext
  ): InsightResult {
    return {
      mode: "clarification",
      question,
      thinking: [],
      requiresClarification: true,
      clarifications: validation.clarifications,
      clarificationReasoning:
        validation.userVisibleMessage || "More context is required.",
      context: {
        typedDomainPipeline: {
          route: resolvedContext.route,
          resolutionTrace: resolvedContext.resolutionTrace,
          unresolvedSlots: resolvedContext.unresolvedSlots,
        },
      },
    };
  }

  mapDirect(
    question: string,
    resolvedContext: ResolvedContext,
    plan: TypedDomainPlan,
    validation: ValidationResult,
    execution: ExecutionResult,
    sql: string,
    boundParameters: Record<string, string | number | boolean | null>
  ): InsightResult {
    return {
      mode: "direct",
      question,
      thinking: [],
      sql,
      results: {
        rows: execution.rows,
        columns: execution.columns,
      },
      error: execution.error,
      boundParameters,
      context: {
        typedDomainPipeline: {
          route: resolvedContext.route,
          resolutionTrace: resolvedContext.resolutionTrace,
          planDomain: plan.domain,
          validationStatus: validation.status,
        },
      },
    };
  }
}

export function getDomainResultMapperService(): DomainResultMapperService {
  return new DomainResultMapperService();
}
