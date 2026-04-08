import {
  extractPatientNameCandidateFromQuestion,
  PatientEntityResolver,
  type PatientResolutionResult,
  toPatientOpaqueRef,
} from "@/lib/services/patient-entity-resolver.service";
import type {
  DomainRouteResult,
  ResolvedContext,
  ResolvedTimeRange,
  TypedDomainPipelineInput,
} from "@/lib/services/domain-pipeline/types";

const MONTH_LOOKUP: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

export class DomainResolverService {
  private readonly patientResolver = new PatientEntityResolver();

  async resolve(
    input: TypedDomainPipelineInput,
    routeResult: DomainRouteResult
  ): Promise<ResolvedContext | null> {
    if (routeResult.route === "legacy_fallback") {
      return null;
    }

    const resolutionTrace: string[] = [`route:${routeResult.route}`];
    const unresolvedSlots: ResolvedContext["unresolvedSlots"] = [];
    const filters: ResolvedContext["filters"] = [];

    const patientRef = await this.resolvePatientRef(input, routeResult.route);
    if (patientRef) {
      resolutionTrace.push(`patient:${patientRef.source}`);
    } else if (
      routeResult.route === "patient_details" ||
      routeResult.route === "wound_assessment" ||
      routeResult.route === "patient_assessment"
    ) {
      unresolvedSlots.push({
        slot: "patient",
        reason: "patient_reference_required",
        question: "Which patient do you want to analyze?",
      });
    }

    const timeRange = parseTimeRange(input.question);
    if (timeRange) {
      resolutionTrace.push(`time_range:${timeRange.kind}`);
    }

    const assessmentType = resolveAssessmentType(input.question, routeResult.route);
    if (routeResult.route === "wound_assessment") {
      if (assessmentType) {
        resolutionTrace.push("assessment_type:wound_assessment");
      } else {
        unresolvedSlots.push({
          slot: "assessment_type",
          reason: "assessment_scope_required",
          question:
            "Do you want wound assessments? The typed pipeline only supports wound assessments right now.",
        });
      }
    }

    return {
      route: routeResult.route,
      questionText: input.question,
      patientRef,
      assessmentType,
      timeRange,
      filters,
      unresolvedSlots,
      resolutionTrace,
    };
  }

  private async resolvePatientRef(
    input: TypedDomainPipelineInput,
    route: DomainRouteResult["route"]
  ): Promise<ResolvedContext["patientRef"] | undefined> {
    if (
      input.threadContextPatient &&
      /\b(this patient|that patient|the patient)\b/i.test(input.question)
    ) {
      return {
        resolvedId: input.threadContextPatient.resolvedId,
        opaqueRef:
          input.threadContextPatient.opaqueRef ||
          toPatientOpaqueRef(input.threadContextPatient.resolvedId),
        displayLabel: input.threadContextPatient.displayLabel || "Patient",
        source: "thread_context",
      };
    }

    if (route !== "patient_details" && route !== "wound_assessment" && route !== "patient_assessment") {
      return undefined;
    }

    const candidateText = extractPatientNameCandidateFromQuestion(input.question);
    if (!candidateText) {
      return undefined;
    }

    const resolution = await this.patientResolver.resolve(
      input.question,
      input.customerId,
      {
        candidateText,
        allowQuestionInference: false,
      }
    );

    return patientResolutionToPatientRef(resolution);
  }
}

function patientResolutionToPatientRef(
  resolution: PatientResolutionResult
): ResolvedContext["patientRef"] | undefined {
  if (
    resolution.status !== "resolved" ||
    !resolution.resolvedId ||
    !resolution.selectedMatch
  ) {
    return undefined;
  }

  return {
    resolvedId: resolution.resolvedId,
    opaqueRef: resolution.opaqueRef,
    displayLabel: resolution.selectedMatch.patientName,
    unitName: resolution.selectedMatch.unitName,
    source: "resolver",
  };
}

function resolveAssessmentType(
  question: string,
  route: DomainRouteResult["route"]
): ResolvedContext["assessmentType"] | undefined {
  if (route !== "wound_assessment") {
    return undefined;
  }

  const normalized = question.toLowerCase();
  if (normalized.includes("wound assessment") || normalized.includes("wound assessments")) {
    return {
      kind: "wound_assessment",
      explicit: true,
      source: "question",
    };
  }

  if (
    normalized.includes("latest assessment for each wound") ||
    normalized.includes("latest wound assessment") ||
    normalized.includes("wound measurements")
  ) {
    return {
      kind: "wound_assessment",
      explicit: false,
      source: "question",
    };
  }

  return undefined;
}

export function parseTimeRange(question: string): ResolvedTimeRange | undefined {
  const normalized = question.trim().toLowerCase();

  const relativeMatch = normalized.match(/\blast\s+(\d+)\s+(day|days|week|weeks|month|months)\b/);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const rawUnit = relativeMatch[2];
    const unit = rawUnit.startsWith("day")
      ? "day"
      : rawUnit.startsWith("week")
        ? "week"
        : "month";
    return {
      kind: "relative",
      amount,
      unit,
      label: `last ${amount} ${unit}${amount === 1 ? "" : "s"}`,
    };
  }

  const betweenMatch = normalized.match(
    /\bbetween\s+([a-z]+)\s+(\d{4})\s+and\s+([a-z]+)\s+(\d{4})\b/
  );
  if (betweenMatch) {
    const startMonth = MONTH_LOOKUP[betweenMatch[1]];
    const endMonth = MONTH_LOOKUP[betweenMatch[3]];
    if (!startMonth || !endMonth) {
      return undefined;
    }

    const start = `${betweenMatch[2]}-${startMonth}-01`;
    const endYear = Number(betweenMatch[4]);
    const endMonthIndex = Number(endMonth);
    const endDate =
      endMonthIndex === 12
        ? `${endYear + 1}-01-01`
        : `${endYear}-${String(endMonthIndex + 1).padStart(2, "0")}-01`;

    return {
      kind: "absolute",
      start,
      end: endDate,
      label: `between ${betweenMatch[1]} ${betweenMatch[2]} and ${betweenMatch[3]} ${betweenMatch[4]}`,
    };
  }

  return undefined;
}

export function getDomainResolverService(): DomainResolverService {
  return new DomainResolverService();
}
