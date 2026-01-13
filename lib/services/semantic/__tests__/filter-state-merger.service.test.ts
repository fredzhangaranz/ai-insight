import { describe, expect, it } from "vitest";

import {
  FilterStateMerger,
  type FilterStateSource,
  type MergedFilterState,
  filterResidualsAgainstMerged,
  mergeFilterStates,
} from "../filter-state-merger.service";
import type { ResidualFilter } from "../../snippet/residual-filter-validator.service";

function buildSource(
  overrides: Partial<FilterStateSource> & { source: FilterStateSource["source"] }
): FilterStateSource {
  return {
    value: overrides.value ?? null,
    confidence: overrides.confidence ?? 0,
    originalText: overrides.originalText ?? "test filter",
    field: overrides.field,
    operator: overrides.operator,
    warnings: overrides.warnings,
    error: overrides.error,
    ...overrides,
  };
}

describe("FilterStateMerger", () => {
  it("resolves single high-confidence source", () => {
    const merger = new FilterStateMerger();
    const sources = [
      buildSource({
        source: "template_param",
        value: 0.3,
        confidence: 0.95,
        originalText: "30% area reduction",
      }),
    ];

    const [merged] = merger.mergeFilterStates(sources);

    expect(merged.resolved).toBe(true);
    expect(merged.value).toBe(0.3);
    expect(merged.resolvedVia).toEqual(["template_param"]);
    expect(merged.conflicts).toHaveLength(0);
  });

  it("prefers highest confidence value when values differ", () => {
    const sources = [
      buildSource({
        source: "template_param",
        value: "A",
        confidence: 0.9,
        originalText: "unit selection",
      }),
      buildSource({
        source: "semantic_mapping",
        value: "B",
        confidence: 0.7,
        originalText: "unit selection",
      }),
    ];

    const [merged] = mergeFilterStates(sources);

    expect(merged.resolved).toBe(true);
    expect(merged.value).toBe("A");
    expect(merged.conflicts[0]?.resolution).toBe("highest_confidence");
    expect(merged.resolvedVia).toEqual(["template_param"]);
  });

  it("marks conflict when confidences are similar", () => {
    const sources = [
      buildSource({
        source: "template_param",
        value: "ICU",
        confidence: 0.8,
        originalText: "care unit",
      }),
      buildSource({
        source: "semantic_mapping",
        value: "ER",
        confidence: 0.75,
        originalText: "care unit",
      }),
    ];

    const [merged] = mergeFilterStates(sources);

    expect(merged.resolved).toBe(false);
    expect(merged.conflicts[0]?.resolution).toBe("requires_clarification");
  });

  it("flags high-confidence disagreement for AI judgment", () => {
    const sources = [
      buildSource({
        source: "template_param",
        value: "12 weeks",
        confidence: 0.9,
        originalText: "time window",
      }),
      buildSource({
        source: "placeholder_extraction",
        value: "10 weeks",
        confidence: 0.88,
        originalText: "time window",
      }),
    ];

    const [merged] = mergeFilterStates(sources);

    expect(merged.resolved).toBe(false);
    expect(merged.conflicts[0]?.resolution).toBe("ai_judgment");
  });

  it("suppresses clarification warnings when resolved elsewhere", () => {
    const sources = [
      buildSource({
        source: "template_param",
        value: 84,
        confidence: 0.92,
        originalText: "12 weeks",
      }),
      buildSource({
        source: "semantic_mapping",
        value: null,
        confidence: 0.6,
        originalText: "12 weeks",
        warnings: ["Needs clarification"],
      }),
    ];

    const [merged] = mergeFilterStates(sources);

    expect(merged.resolved).toBe(true);
    expect(merged.warnings).not.toContain("Needs clarification");
  });

  it("leaves filter unresolved when all confidences are low", () => {
    const sources = [
      buildSource({
        source: "semantic_mapping",
        value: "pending",
        confidence: 0.4,
        originalText: "status pending",
      }),
      buildSource({
        source: "placeholder_extraction",
        value: "pending",
        confidence: 0.3,
        originalText: "status pending",
      }),
    ];

    const [merged] = mergeFilterStates(sources);

    expect(merged.resolved).toBe(false);
    expect(merged.conflicts).toHaveLength(0);
  });

  it("filters residuals that match resolved merged filters", () => {
    const merged: MergedFilterState[] = [
      {
        originalText: "female patients",
        normalizedText: "female patients",
        field: "patient_gender",
        operator: "=",
        value: "F",
        resolved: true,
        confidence: 0.95,
        resolvedVia: ["template_param"],
        allSources: [],
        warnings: [],
        conflicts: [],
      },
    ];

    const residuals: ResidualFilter[] = [
      {
        field: "patient_gender",
        operator: "=",
        value: "F",
        source: "user phrase",
        originalText: "female patients",
        required: true,
        confidence: 0.9,
      },
      {
        field: "care_unit",
        operator: "=",
        value: "ICU",
        source: "user phrase",
        originalText: "icu",
        required: true,
        confidence: 0.8,
      },
    ];

    const filtered = filterResidualsAgainstMerged(residuals, merged);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].field).toBe("care_unit");
  });
});
