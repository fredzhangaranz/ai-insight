import type {
  PatientDetailsPlan,
  ResolvedContext,
  TypedDomainPlan,
  WoundAssessmentPlan,
} from "@/lib/services/domain-pipeline/types";

export class DomainPlanBuilderService {
  build(resolvedContext: ResolvedContext): TypedDomainPlan | null {
    if (resolvedContext.route === "patient_details") {
      return this.buildPatientDetailsPlan(resolvedContext);
    }

    if (resolvedContext.route === "wound_assessment") {
      return this.buildWoundAssessmentPlan(resolvedContext);
    }

    return null;
  }

  private buildPatientDetailsPlan(
    resolvedContext: ResolvedContext
  ): PatientDetailsPlan {
    return {
      domain: "patient_details",
      subject: "patient",
      patientRef: resolvedContext.patientRef,
      select: [
        "patientId",
        "patientDomainId",
        "firstName",
        "lastName",
        "gender",
        "dateOfBirth",
        "unitName",
      ],
      filters: resolvedContext.filters,
      joins: ["rpt.Patient", "rpt.Unit"],
      timeScope: resolvedContext.timeRange,
      sort: ["lastName ASC", "firstName ASC"],
      clarificationsNeeded: [],
      explain: "Fetch patient demographics and care-unit context for one resolved patient.",
    };
  }

  private buildWoundAssessmentPlan(
    resolvedContext: ResolvedContext
  ): WoundAssessmentPlan {
    const assessmentFlavor = inferWoundAssessmentFlavor(resolvedContext);

    return {
      domain: "wound_assessment",
      subject: "wound_assessment",
      patientRef: resolvedContext.patientRef,
      assessmentType: resolvedContext.assessmentType,
      assessmentFlavor,
      select:
        assessmentFlavor === "latest_measurements"
          ? [
              "assessmentId",
              "woundId",
              "woundLabel",
              "anatomyLabel",
              "assessmentDate",
              "area",
              "depth",
            ]
          : ["assessmentId", "woundId", "woundLabel", "anatomyLabel", "assessmentDate"],
      filters: resolvedContext.filters,
      joins:
        assessmentFlavor === "latest_measurements"
          ? ["rpt.Wound", "rpt.Assessment", "rpt.Measurement"]
          : ["rpt.Wound", "rpt.Assessment"],
      timeScope: resolvedContext.timeRange,
      sort: ["assessmentDate DESC"],
      clarificationsNeeded: [],
      explain:
        assessmentFlavor === "latest_per_wound"
          ? "Fetch the latest wound assessment for each wound for one patient."
          : "Fetch wound assessments for one patient, optionally with latest measurement details.",
    };
  }
}

function inferWoundAssessmentFlavor(
  resolvedContext: ResolvedContext
): WoundAssessmentPlan["assessmentFlavor"] {
  const normalizedQuestion = resolvedContext.questionText.toLowerCase();
  if (normalizedQuestion.includes("latest assessment for each wound")) {
    return "latest_per_wound";
  }

  if (
    normalizedQuestion.includes("latest wound assessment") ||
    normalizedQuestion.includes("measurements from the latest wound assessment") ||
    normalizedQuestion.includes("wound measurements")
  ) {
    return "latest_measurements";
  }

  return "list";
}

export function getDomainPlanBuilderService(): DomainPlanBuilderService {
  return new DomainPlanBuilderService();
}
