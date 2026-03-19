import { describe, it, expect } from "vitest";
import {
  inferChartMapping,
  isDateValue,
  normalizeChartMapping,
  normalizeAvailableMappings,
  validateChartConfiguration,
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

describe("isDateValue", () => {
  it("does not classify numeric strings as dates", () => {
    expect(isDateValue("12345")).toBe(false);
    expect(isDateValue("20260101")).toBe(false);
  });
});

describe("validateChartConfiguration", () => {
  it("rejects a bar chart mapping when the mapped value field is missing", () => {
    const validation = validateChartConfiguration(
      "bar",
      [{ assessmentDate: "2026-01-01", woundArea: 12.5 }],
      { category: "assessmentDate", value: "missingField" },
      ["assessmentDate", "woundArea"]
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("Chart unavailable");
  });

  it("accepts numeric strings for a numeric bar value", () => {
    const validation = validateChartConfiguration(
      "bar",
      [{ categoryName: "A", total: "12" }],
      { category: "categoryName", value: "total" },
      ["categoryName", "total"]
    );

    expect(validation.valid).toBe(true);
    expect(validation.normalizedMapping).toEqual({
      category: "categoryName",
      value: "total",
    });
  });
});
