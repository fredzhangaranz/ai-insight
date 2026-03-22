import { describe, expect, it } from "vitest";
import { WorkspaceValidator } from "@/lib/workspace/workspace-validator.service";
import type { WorkspacePlan } from "@/lib/types/workspace-plan";

describe("WorkspaceValidator", () => {
  it("rejects patient context blocks when the bundle is missing", () => {
    const validator = new WorkspaceValidator();

    const candidatePlan: WorkspacePlan = {
      mode: "review",
      primaryBlockId: "patient-context-1",
      blocks: [
        {
          id: "patient-context-1",
          kind: "patient_context",
          patientRef: "opaque-1",
          summaryLines: ["Jane Doe"],
          trust: {
            provenance: [],
            freshness: { retrievedAt: new Date().toISOString(), stale: false },
            aiContribution: {
              usedForSelection: true,
              usedForSummarization: false,
              usedForMapping: false,
            },
          },
        },
      ],
      actions: [],
      explanation: {
        headline: "Review",
        rationale: "Because",
      },
      source: {
        explicitRequestSatisfied: false,
        aiRecommended: true,
        fallbackApplied: false,
      },
    };

    const result = validator.validate(candidatePlan, {
      patientContextBundle: null,
    });

    expect(result.validPlan).toBeNull();
    expect(result.rejectedBlocks).toEqual([
      {
        blockId: "patient-context-1",
        reason: "Missing patient context bundle",
      },
    ]);
  });
});
