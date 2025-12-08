import { describe, it, expect } from "vitest";
import { ExpandedConceptBuilder } from "../expanded-concept-builder.service";

const builder = new ExpandedConceptBuilder();

describe("ExpandedConceptBuilder", () => {
  it("prioritizes metrics then filter phrases within bounds", () => {
    const result = builder.build(
      "trend_analysis",
      ["healing_rate", "area_reduction", "healing_rate"],
      [
        { operator: "equals", userPhrase: "52 weeks", value: null },
        { operator: "equals", userPhrase: "granulation depth", value: null },
      ]
    );

    expect(result.concepts[0]).toBe("healing_rate");
    expect(result.concepts).toContain("52 weeks");
    expect(
      result.sources[result.concepts.indexOf("52 weeks")]
    ).toBe("filter");
    expect(result.concepts.length).toBeLessThanOrEqual(25);
  });

  it("deduplicates similar phrases using normalization and Levenshtein", () => {
    const result = builder.build(
      "outcome_analysis",
      ["Area Reduction"],
      [{ operator: "equals", userPhrase: "area reduction!", value: null }]
    );

    const occurrences = result.concepts.filter(
      (concept) => concept === "area reduction"
    ).length;

    expect(occurrences).toBe(1);
    expect(result.sources[result.concepts.indexOf("area reduction")]).toBe(
      "metric"
    );
  });

  it("respects the hard cap of 25 concepts", () => {
    const manyFilters = Array.from({ length: 20 }, (_, idx) => ({
      operator: "equals",
      userPhrase: `filter ${idx}`,
      value: null,
    }));
    const manyMetrics = Array.from({ length: 12 }, (_, idx) => `metric_${idx}`);

    const result = builder.build("quality_metrics", manyMetrics, manyFilters);

    expect(result.concepts.length).toBe(25);
    expect(result.sources.filter((s) => s === "intent_type").length).toBeGreaterThan(
      0
    );
  });

  it("normalizes phrases by lowercasing and stripping symbols", () => {
    const result = builder.build(
      "risk_assessment",
      ["Healing Rate!!!"],
      [{ operator: "equals", userPhrase: "  AREA reduction  ", value: null }]
    );

    expect(result.concepts).toContain("healing rate");
    expect(result.concepts).toContain("area reduction");
  });

  // Task 4.S18: New intent type keywords
  it("includes new semantic layer intent type keywords (Task 4.S18)", () => {
    const temporalResult = builder.build(
      "temporal_proximity_query",
      ["healing rate"],
      [{ operator: "equals", userPhrase: "4 weeks", value: null }]
    );

    expect(temporalResult.concepts).toContain("temporal");
    expect(temporalResult.concepts).toContain("baseline");
    expect(temporalResult.sources).toContain("intent_type");
  });

  it("includes assessment correlation intent keywords", () => {
    const correlationResult = builder.build(
      "assessment_correlation_check",
      [],
      [{ operator: "equals", userPhrase: "missing billing", value: null }]
    );

    expect(correlationResult.concepts).toContain("assessment");
    expect(correlationResult.concepts).toContain("missing");
  });

  it("includes workflow status intent keywords", () => {
    const workflowResult = builder.build(
      "workflow_status_monitoring",
      [],
      [{ operator: "equals", userPhrase: "pending forms", value: null }]
    );

    expect(workflowResult.concepts).toContain("workflow");
    expect(workflowResult.concepts).toContain("status");
  });
});
