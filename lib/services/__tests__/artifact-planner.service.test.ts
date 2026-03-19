import { describe, expect, it } from "vitest";

import { ArtifactPlannerService } from "@/lib/services/artifact-planner.service";

describe("ArtifactPlannerService", () => {
  const planner = new ArtifactPlannerService();

  it("chooses a line chart for time-series trend questions", () => {
    const artifacts = planner.plan({
      question: "give me a chart that shows wound area change over time",
      rows: [
        {
          assessmentDate: new Date("2026-01-01"),
          woundArea: 10,
          woundLabel: "W1",
        },
        {
          assessmentDate: new Date("2026-01-08"),
          woundArea: 8,
          woundLabel: "W1",
        },
      ],
      columns: ["assessmentDate", "woundArea", "woundLabel"],
      presentationIntent: "chart",
      preferredVisualization: "line",
    });

    const chartArtifact = artifacts.find((artifact) => artifact.kind === "chart");
    expect(chartArtifact).toBeDefined();
    expect(chartArtifact?.kind).toBe("chart");
    if (chartArtifact?.kind === "chart") {
      expect(chartArtifact.chartType).toBe("line");
      expect(chartArtifact.mapping.x).toBe("assessmentDate");
      expect(chartArtifact.mapping.y).toBe("woundArea");
    }
  });

  it("uses a valid bar mapping when bar is explicitly requested for time-series data", () => {
    const artifacts = planner.plan({
      question: "show me a bar chart of wound area over time",
      rows: [
        {
          assessmentDate: new Date("2026-01-01"),
          woundArea: 10,
          woundLabel: "W1",
        },
        {
          assessmentDate: new Date("2026-01-08"),
          woundArea: 8,
          woundLabel: "W1",
        },
      ],
      columns: ["assessmentDate", "woundArea", "woundLabel"],
      presentationIntent: "chart",
      preferredVisualization: "bar",
    });

    const chartArtifact = artifacts.find((artifact) => artifact.kind === "chart");
    expect(chartArtifact).toBeDefined();
    expect(chartArtifact?.kind).toBe("chart");
    if (chartArtifact?.kind === "chart") {
      expect(chartArtifact.chartType).toBe("bar");
      expect(chartArtifact.mapping.category).toBe("assessmentDate");
      expect(chartArtifact.mapping.value).toBe("woundArea");
      expect(chartArtifact.mapping.x).toBeUndefined();
      expect(chartArtifact.mapping.y).toBeUndefined();
    }
  });

  it("falls back to a table when the result shape is not chartable", () => {
    const artifacts = planner.plan({
      question: "show me a chart",
      rows: [{ noteText: "stable wound" }],
      columns: ["noteText"],
      presentationIntent: "chart",
    });

    expect(artifacts.some((artifact) => artifact.kind === "chart")).toBe(false);
    expect(artifacts.some((artifact) => artifact.kind === "table")).toBe(true);
  });

  it("adds a table fallback reason when chart rendering is unavailable", () => {
    const artifacts = planner.plan({
      question: "show me a chart of wound area over time",
      rows: [],
      columns: ["assessmentDate", "woundArea"],
      presentationIntent: "chart",
      preferredVisualization: "line",
    });

    const tableArtifact = artifacts.find((artifact) => artifact.kind === "table");
    expect(tableArtifact).toBeDefined();
    expect(tableArtifact?.kind).toBe("table");
    if (tableArtifact?.kind === "table") {
      expect(tableArtifact.primary).toBe(true);
      expect(tableArtifact.reason).toContain("Chart unavailable");
    }
  });
});
