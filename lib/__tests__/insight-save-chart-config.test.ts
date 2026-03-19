import { describe, expect, it } from "vitest";
import { getChartConfigForSave } from "@/lib/insight-save-chart-config";
import type { InsightArtifact } from "@/lib/types/insight-artifacts";

describe("getChartConfigForSave", () => {
  it("returns null when there are no chart artifacts", () => {
    const artifacts: InsightArtifact[] = [
      { kind: "table", title: "t", columns: ["a"] },
    ];
    expect(getChartConfigForSave(artifacts)).toBeNull();
    expect(getChartConfigForSave(undefined)).toBeNull();
    expect(getChartConfigForSave([])).toBeNull();
  });

  it("uses first chart when none marked primary", () => {
    const artifacts: InsightArtifact[] = [
      {
        kind: "chart",
        chartType: "bar",
        title: "c",
        mapping: { x: "col_a", y: "col_b" },
      },
    ];
    expect(getChartConfigForSave(artifacts)).toEqual({
      chartType: "bar",
      chartMapping: { x: "col_a", y: "col_b" },
    });
  });

  it("prefers primary chart when multiple exist", () => {
    const artifacts: InsightArtifact[] = [
      {
        kind: "chart",
        chartType: "line",
        title: "first",
        mapping: { x: "a", y: "b" },
      },
      {
        kind: "chart",
        chartType: "pie",
        title: "main",
        mapping: { label: "l", value: "v" },
        primary: true,
      },
    ];
    expect(getChartConfigForSave(artifacts)).toEqual({
      chartType: "pie",
      chartMapping: { label: "l", value: "v" },
    });
  });

  it("applies overrides for the chosen index", () => {
    const artifacts: InsightArtifact[] = [
      {
        kind: "chart",
        chartType: "bar",
        title: "c",
        mapping: { x: "old_x", y: "old_y" },
      },
    ];
    expect(
      getChartConfigForSave(artifacts, {
        0: { chartType: "line", chartMapping: { x: "nx", y: "ny" } },
      }),
    ).toEqual({
      chartType: "line",
      chartMapping: { x: "nx", y: "ny" },
    });
  });
});
