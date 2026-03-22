import { describe, expect, it } from "vitest";
import { WorkspacePlannerService } from "@/lib/workspace/workspace-planner.service";
import { PatientContextAssembler } from "@/lib/workspace/patient-context-assembler.service";
import { ClinicalIntentFrameService } from "@/lib/workspace/clinical-intent-frame.service";
import { WorkspaceValidator } from "@/lib/workspace/workspace-validator.service";
import { ArtifactPlannerService } from "@/lib/services/artifact-planner.service";
import type { SemanticQueryFrame } from "@/lib/services/context-discovery/types";

const SEMANTIC_FRAME: SemanticQueryFrame = {
  scope: { value: "individual_patient", confidence: 0.9, source: "llm" },
  subject: { value: "patient", confidence: 0.9, source: "llm" },
  measure: { value: "wound_area", confidence: 0.8, source: "llm" },
  grain: { value: "per_assessment", confidence: 0.8, source: "llm" },
  groupBy: { value: ["assessmentDate"], confidence: 0.8, source: "llm" },
  filters: [],
  aggregatePredicates: [],
  presentation: { value: "chart", confidence: 0.9, source: "llm" },
  preferredVisualization: { value: "line", confidence: 0.9, source: "llm" },
  entityRefs: [],
  clarificationNeeds: [],
  confidence: 0.88,
};

describe("WorkspacePlannerService", () => {
  it("returns a validated workspace plan for MVP block kinds", async () => {
    const planner = new WorkspacePlannerService(
      new ArtifactPlannerService(),
      new ClinicalIntentFrameService(),
      new PatientContextAssembler(
        async () => ({
          patientRef: "opaque-1",
          summary: {
            displayName: "Jane Doe",
            primaryFlags: ["2 recent assessments"],
          },
          activeProblems: [],
          recentAssessments: [],
          woundHighlights: [],
          alerts: [],
          provenance: [],
        })
      ),
      new WorkspaceValidator()
    );

    const result = await planner.plan({
      question: "show wound area trend for Jane Doe over the last 8 weeks",
      customerId: "cust-1",
      rows: [
        { assessmentDate: "2026-01-01", woundArea: 12.5 },
        { assessmentDate: "2026-01-08", woundArea: 10.1 },
      ],
      columns: ["assessmentDate", "woundArea"],
      semanticFrame: SEMANTIC_FRAME,
      resolvedEntities: [
        {
          kind: "patient",
          opaqueRef: "opaque-1",
          matchType: "full_name",
        },
      ],
      boundParameters: {
        patientId1: "patient-123",
      },
      authContext: {
        canViewPatientContext: true,
      },
      featureFlags: {
        patientContextBundle: true,
        workspaceActionRecommendations: true,
        patientCardBlock: true,
      },
    });

    expect(result.workspacePlan).not.toBeNull();
    expect(result.workspacePlan?.blocks.map((block) => block.kind)).toEqual(
      expect.arrayContaining([
        "summary",
        "patient_context",
        "patient_card",
        "chart",
        "table",
        "action_panel",
      ])
    );
    expect(result.patientContextBundle?.patientRef).toBe("opaque-1");
    expect(result.rejectedBlocks).toEqual([]);
  });
});
