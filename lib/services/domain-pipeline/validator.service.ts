import type {
  TypedDomainPlan,
  ValidationResult,
} from "@/lib/services/domain-pipeline/types";

export class DomainValidatorService {
  validate(plan: TypedDomainPlan | null): ValidationResult {
    if (!plan) {
      return {
        status: "unsupported",
        errors: ["unsupported_plan_family"],
        clarifications: [],
        userVisibleMessage:
          "This question is not supported by the typed pipeline yet.",
        validatorTrace: ["plan:null"],
      };
    }

    const validatorTrace = [`domain:${plan.domain}`];

    if (plan.grouping && plan.grouping.length > 0) {
      return {
        status: "unsupported",
        errors: ["grouping_not_supported_in_phase1"],
        clarifications: [],
        userVisibleMessage:
          "Grouped reporting is not supported in the typed pipeline yet.",
        validatorTrace,
      };
    }

    if (!plan.patientRef) {
      return {
        status: "clarification",
        errors: [],
        clarifications: [
          {
            id: `${plan.domain}_patient`,
            ambiguousTerm: "patient",
            question: "Which patient do you want to analyze?",
            options: [],
            allowCustom: true,
            slot: "patient",
            target: "patient",
            reasonCode: "missing_patient",
          },
        ],
        userVisibleMessage: "A patient is required before this query can run.",
        validatorTrace: [...validatorTrace, "missing:patient"],
      };
    }

    if (plan.domain === "wound_assessment" && !plan.assessmentType) {
      return {
        status: "clarification",
        errors: [],
        clarifications: [
          {
            id: "wound_assessment_scope",
            ambiguousTerm: "assessment type",
            question:
              "Do you want wound assessments? The typed pipeline only supports wound assessments right now.",
            options: [],
            allowCustom: true,
            slot: "assessment_type",
            target: "assessment",
            reasonCode: "missing_assessment_scope",
          },
        ],
        userVisibleMessage:
          "An explicit wound assessment scope is required before this query can run.",
        validatorTrace: [...validatorTrace, "missing:assessment_type"],
      };
    }

    return {
      status: "ok",
      errors: [],
      clarifications: [],
      validatorTrace: [...validatorTrace, "ok"],
    };
  }
}

export function getDomainValidatorService(): DomainValidatorService {
  return new DomainValidatorService();
}
