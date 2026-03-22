import { describe, expect, it } from "vitest";
import { compileWorkspacePlanToArtifacts } from "@/lib/workspace/compile-workspace-plan-to-artifacts";
import type { WorkspacePlan } from "@/lib/types/workspace-plan";

describe("compileWorkspacePlanToArtifacts", () => {
  it("preserves chart and table compatibility for supported blocks", () => {
    const workspacePlan: WorkspacePlan = {
      mode: "answer",
      primaryBlockId: "chart-1",
      blocks: [
        {
          id: "chart-1",
          kind: "chart",
          artifact: {
            kind: "chart",
            chartType: "line",
            title: "Trend",
            mapping: { x: "assessmentDate", y: "woundArea" },
          },
        },
        {
          id: "table-1",
          kind: "table",
          artifact: {
            kind: "table",
            title: "Result table",
            columns: ["assessmentDate", "woundArea"],
          },
        },
      ],
      actions: [],
      explanation: {
        headline: "Summary",
        rationale: "Because it is useful",
      },
      source: {
        explicitRequestSatisfied: true,
        aiRecommended: false,
        fallbackApplied: false,
      },
    };

    expect(compileWorkspacePlanToArtifacts(workspacePlan)).toEqual([
      {
        kind: "chart",
        chartType: "line",
        title: "Trend",
        mapping: { x: "assessmentDate", y: "woundArea" },
        primary: true,
      },
      {
        kind: "table",
        title: "Result table",
        columns: ["assessmentDate", "woundArea"],
        primary: false,
      },
    ]);
  });

  it("includes resolved entities and ignores unsupported block kinds", () => {
    const workspacePlan: WorkspacePlan = {
      mode: "review",
      primaryBlockId: "patient-card-1",
      blocks: [
        {
          id: "summary-1",
          kind: "summary",
          summary: "Hello",
        },
        {
          id: "patient-card-1",
          kind: "patient_card",
          patientRef: "p-1",
          sections: ["summary"],
        },
      ],
      actions: [],
      explanation: {
        headline: "Summary",
        rationale: "Because it is useful",
      },
      source: {
        explicitRequestSatisfied: false,
        aiRecommended: true,
        fallbackApplied: false,
      },
      resolvedEntities: [
        {
          kind: "patient",
          opaqueRef: "opaque-1",
          matchType: "full_name",
        },
      ],
    };

    expect(compileWorkspacePlanToArtifacts(workspacePlan)).toEqual([
      {
        kind: "entity_resolution",
        entity: {
          kind: "patient",
          opaqueRef: "opaque-1",
          matchType: "full_name",
        },
      },
    ]);
  });
});
