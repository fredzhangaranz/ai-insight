import { getDomainRouterService } from "@/lib/services/domain-pipeline/router.service";
import { getDomainResolverService } from "@/lib/services/domain-pipeline/resolver.service";
import { getDomainPlanBuilderService } from "@/lib/services/domain-pipeline/plan-builder.service";
import { getDomainValidatorService } from "@/lib/services/domain-pipeline/validator.service";
import { getDomainSqlCompilerService } from "@/lib/services/domain-pipeline/compiler.service";
import { getDomainExecutorService } from "@/lib/services/domain-pipeline/executor.service";
import { getDomainResultMapperService } from "@/lib/services/domain-pipeline/result-mapper.service";
import type {
  TypedDomainPipelineInput,
  TypedDomainPipelineRunResult,
} from "@/lib/services/domain-pipeline/types";

const PHASE1_ROUTES = new Set(["patient_details", "wound_assessment"]);

export async function runTypedDomainPipeline(
  input: TypedDomainPipelineInput
): Promise<TypedDomainPipelineRunResult> {
  const routeResult = getDomainRouterService().route(input.question);
  if (!PHASE1_ROUTES.has(routeResult.route)) {
    return {
      status: "fallback",
      telemetry: {
        routeResult,
        fallbackReason: "route_not_supported_in_phase1",
      },
    };
  }

  const resolvedContext = await getDomainResolverService().resolve(input, routeResult);
  if (!resolvedContext) {
    return {
      status: "fallback",
      telemetry: {
        routeResult,
        fallbackReason: "resolver_returned_null",
      },
    };
  }

  const plan = getDomainPlanBuilderService().build(resolvedContext);
  const validation = getDomainValidatorService().validate(plan);

  if (validation.status === "unsupported" || validation.status === "invalid") {
    return {
      status: "fallback",
      telemetry: {
        routeResult,
        resolvedContext,
        validation,
        fallbackReason: validation.errors[0] || validation.status,
      },
    };
  }

  if (validation.status === "clarification" || !plan) {
    return {
      status: "handled",
      result: getDomainResultMapperService().mapClarification(
        input.question,
        validation,
        resolvedContext
      ),
      telemetry: {
        routeResult,
        resolvedContext,
        validation,
      },
    };
  }

  const compiledQuery = getDomainSqlCompilerService().compile(plan);
  const execution = await getDomainExecutorService().execute(
    input.customerId,
    compiledQuery
  );

  return {
    status: "handled",
    result: getDomainResultMapperService().mapDirect(
      input.question,
      resolvedContext,
      plan,
      validation,
      execution,
      compiledQuery.sql,
      compiledQuery.boundParameters
    ),
    telemetry: {
      routeResult,
      resolvedContext,
      validation,
      compiledQuery,
      execution,
    },
  };
}

export function logTypedDomainPipelineShadowResult(input: {
  source: "ask" | "conversation_send";
  question: string;
  customerId: string;
  legacyResult: {
    mode?: string;
    sql?: string;
    results?: { rows?: any[]; columns?: string[] } | null;
    error?: { message?: string } | null;
  };
  typedResult: TypedDomainPipelineRunResult;
}) {
  const typedPayload = input.typedResult.result;
  console.log("[TypedDomainPipeline][shadow]", {
    source: input.source,
    customerId: input.customerId,
    question: input.question,
    typedStatus: input.typedResult.status,
    typedRoute: input.typedResult.telemetry.routeResult.route,
    typedValidation: input.typedResult.telemetry.validation?.status || null,
    legacyMode: input.legacyResult.mode || null,
    typedMode: typedPayload?.mode || null,
    sameMode: input.legacyResult.mode === typedPayload?.mode,
    sameSql: normalizeSql(input.legacyResult.sql) === normalizeSql(typedPayload?.sql),
    legacyColumnCount: input.legacyResult.results?.columns?.length || 0,
    typedColumnCount: typedPayload?.results?.columns?.length || 0,
    legacyError: input.legacyResult.error?.message || null,
    typedError: typedPayload?.error?.message || null,
    fallbackReason: input.typedResult.telemetry.fallbackReason || null,
  });
}

function normalizeSql(value?: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
