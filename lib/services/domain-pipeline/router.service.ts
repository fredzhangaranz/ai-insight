import type { DomainRouteResult } from "@/lib/services/domain-pipeline/types";

const AGGREGATE_TOKENS = [
  "how many",
  "count",
  "average",
  "avg",
  "compare",
  "group by",
  "by clinic",
  "by unit",
  "which clinics",
  "which units",
];

const CORRELATION_TOKENS = [
  "no follow-up",
  "without follow-up",
  "without discharge",
  "no billing",
  "but no",
];

const PATIENT_DETAIL_TOKENS = [
  "patient details",
  "details for",
  "dob",
  "date of birth",
  "gender",
  "address",
  "unit",
];

const WOUND_ASSESSMENT_TOKENS = [
  "wound assessment",
  "wound assessments",
  "latest assessment for each wound",
  "latest wound assessment",
  "wound measurements",
  "measurements from the latest wound assessment",
];

export class DomainRouterService {
  route(question: string): DomainRouteResult {
    const normalized = question.trim().toLowerCase();
    if (!normalized) {
      return {
        route: "legacy_fallback",
        confidence: 0,
        reasons: ["empty_question"],
        unsupportedReasons: ["empty_question"],
      };
    }

    if (CORRELATION_TOKENS.some((token) => normalized.includes(token))) {
      return {
        route: "assessment_correlation",
        confidence: 0.91,
        reasons: ["correlation_phrase_match"],
        unsupportedReasons: [],
      };
    }

    if (AGGREGATE_TOKENS.some((token) => normalized.includes(token))) {
      return {
        route: "aggregate_reporting",
        confidence: 0.92,
        reasons: ["aggregate_phrase_match"],
        unsupportedReasons: [],
      };
    }

    if (
      normalized.includes("patient assessment") ||
      normalized.includes("patient assessments")
    ) {
      return {
        route: "patient_assessment",
        confidence: 0.95,
        reasons: ["patient_assessment_phrase_match"],
        unsupportedReasons: [],
      };
    }

    if (
      WOUND_ASSESSMENT_TOKENS.some((token) => normalized.includes(token)) ||
      (normalized.includes("assessment") &&
        (normalized.includes("wound") ||
          normalized.includes("this patient") ||
          normalized.includes("for this patient") ||
          /\bfor\s+[a-z][a-z'-]+\s+[a-z][a-z'-]+\b/i.test(question)))
    ) {
      return {
        route: "wound_assessment",
        confidence: 0.82,
        reasons: ["wound_assessment_phrase_match"],
        unsupportedReasons: [],
      };
    }

    if (
      PATIENT_DETAIL_TOKENS.some((token) => normalized.includes(token)) &&
      (normalized.includes("patient") ||
        normalized.includes("this patient") ||
        /\bfor\s+[a-z][a-z'-]+\s+[a-z][a-z'-]+\b/i.test(question))
    ) {
      return {
        route: "patient_details",
        confidence: 0.87,
        reasons: ["patient_detail_phrase_match"],
        unsupportedReasons: [],
      };
    }

    return {
      route: "legacy_fallback",
      confidence: 0.35,
      reasons: ["no_supported_domain_match"],
      unsupportedReasons: ["no_supported_domain_match"],
    };
  }
}

export function getDomainRouterService(): DomainRouterService {
  return new DomainRouterService();
}
