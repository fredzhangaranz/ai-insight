import { describe, it, expect } from "vitest";
import {
  inferChartMapping,
  normalizeChartMapping,
  normalizeAvailableMappings,
} from "@/lib/chart-mapping-utils";

describe("normalizeChartMapping", () => {
  it("normalizes bar chart axis aliases", () => {
    const normalized = normalizeChartMapping("bar", {
      xAxis: "gender",
      yAxis: "avg_score",
    }) as Record<string, string>;

    expect(normalized.category).toBe("gender");
    expect(normalized.value).toBe("avg_score");
  });

  it("normalizes line chart axis aliases", () => {
    const normalized = normalizeChartMapping("line", {
      xAxis: "date",
      yAxis: "count",
    }) as Record<string, string>;

    expect(normalized.x).toBe("date");
    expect(normalized.y).toBe("count");
  });

  it("leaves mapping untouched when already normalized", () => {
    const mapping = { category: "status", value: "total" };
    const normalized = normalizeChartMapping("bar", mapping);
    expect(normalized).toEqual(mapping);
  });
});

describe("normalizeAvailableMappings", () => {
  it("normalizes nested mapping collections", () => {
    const normalized = normalizeAvailableMappings({
      bar: { xAxis: "gender", yAxis: "avg_score" },
      pie: { label: "department", value: "count" },
    });

    expect(normalized.bar.category).toBe("gender");
    expect(normalized.bar.value).toBe("avg_score");
    expect(normalized.pie.label).toBe("department");
  });
});

describe("inferChartMapping", () => {
  it("prefers a numeric metric over a date field for line-chart y", () => {
    const inferred = inferChartMapping(
      "line",
      [
        {
          AssessmentDate: new Date("2026-01-01"),
          WoundArea: 12.5,
          WoundLabel: "W1",
        },
      ],
      { x: "AssessmentDate", y: "AssessmentDate" }
    );

    expect(inferred.x).toBe("AssessmentDate");
    expect(inferred.y).toBe("WoundArea");
  });
});
