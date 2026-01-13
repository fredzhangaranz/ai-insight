/**
 * Tests for SnippetComposerService
 * Validates composition chains and snippet dependency resolution.
 */

import { describe, it, expect } from "vitest";
import {
  SnippetComposerService,
  getSnippetComposerService,
  type ComposableSnippet,
} from "../snippet-composer.service";

describe("SnippetComposerService", () => {
  let service: SnippetComposerService;

  beforeEach(() => {
    service = new SnippetComposerService();
  });

  describe("getCompositionChains", () => {
    it("returns all defined composition chains", () => {
      const chains = service.getCompositionChains();
      expect(chains.length).toBeGreaterThan(0);
      expect(chains.map((c) => c.intent)).toContain("temporal_proximity_query");
      expect(chains.map((c) => c.intent)).toContain(
        "assessment_correlation_check",
      );
      expect(chains.map((c) => c.intent)).toContain(
        "workflow_status_monitoring",
      );
    });
  });

  describe("getChainByIntent", () => {
    it("returns chain for temporal_proximity_query", () => {
      const chain = service.getChainByIntent("temporal_proximity_query");
      expect(chain).toBeDefined();
      expect(chain?.name).toBe("Area Reduction with Threshold");
      expect(chain?.steps).toContain("baseline_measurement_per_wound");
    });

    it("returns chain for assessment_correlation_check", () => {
      const chain = service.getChainByIntent("assessment_correlation_check");
      expect(chain).toBeDefined();
      expect(chain?.name).toBe("Multi-Assessment Anti-Join");
      expect(chain?.steps).toContain("assessment_type_lookup_by_semantic_concept");
    });

    it("returns chain for workflow_status_monitoring", () => {
      const chain = service.getChainByIntent("workflow_status_monitoring");
      expect(chain).toBeDefined();
      expect(chain?.name).toBe("Workflow Status with Age");
    });

    it("returns undefined for unknown intent", () => {
      const chain = service.getChainByIntent("unknown_intent" as any);
      expect(chain).toBeUndefined();
    });
  });

  describe("validateComposition - temporal_proximity_query", () => {
    it("validates correct area reduction composition", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
        {
          id: "closest_measurement_around_target_date",
          name: "Proximity",
          intent: "snippet_area_reduction",
          inputs: ["BaselineData", "{timePointDays}", "{toleranceDays}"],
          outputs: ["ClosestMeasurement"],
        },
        {
          id: "area_reduction_with_wound_state_overlay",
          name: "Calculation",
          intent: "snippet_area_reduction",
          inputs: ["ClosestMeasurement", "{reductionThreshold}"],
          outputs: ["WoundStateAtTarget"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "temporal_proximity_query",
      );
      expect(result.valid).toBe(true);
      expect(result.appliedChain).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it("rejects out-of-order snippets", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "closest_measurement_around_target_date",
          name: "Proximity",
          intent: "snippet_area_reduction",
          inputs: ["BaselineData"],
          outputs: ["ClosestMeasurement"],
        },
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "temporal_proximity_query",
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("out of order"))).toBe(true);
    });

    it("flags missing required snippets", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "temporal_proximity_query",
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) =>
        e.includes("Missing required snippet"),
      )).toBe(true);
    });

    it("allows optional threshold filter", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
        {
          id: "closest_measurement_around_target_date",
          name: "Proximity",
          intent: "snippet_area_reduction",
          inputs: ["BaselineData", "{timePointDays}"],
          outputs: ["ClosestMeasurement"],
        },
        {
          id: "area_reduction_with_wound_state_overlay",
          name: "Calculation",
          intent: "snippet_area_reduction",
          inputs: ["ClosestMeasurement"],
          outputs: ["WoundStateAtTarget"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "temporal_proximity_query",
      );
      expect(result.valid).toBe(true);
      expect(result.appliedChain?.steps).toContain(
        "threshold_filter_for_area_reduction",
      );
    });
  });

  describe("validateComposition - assessment_correlation_check", () => {
    it("validates correct anti-join composition", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "assessment_type_lookup_by_semantic_concept",
          name: "Lookup",
          intent: "snippet_assessment_correlation",
          inputs: ["{assessmentConcept}", "{customerId}"],
          outputs: ["@assessmentTypeId"],
        },
        {
          id: "target_assessment_collection",
          name: "Collection",
          intent: "snippet_assessment_correlation",
          inputs: ["{matchingDateField}"],
          outputs: ["TargetAssessments"],
        },
        {
          id: "missing_target_assessment_anti_join",
          name: "AntiJoin",
          intent: "snippet_assessment_correlation",
          inputs: ["@assessmentTypeId"],
          outputs: ["MissingRecords"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "assessment_correlation_check",
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects mixed intents", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "assessment_type_lookup_by_semantic_concept",
          name: "Lookup",
          intent: "snippet_assessment_correlation",
          inputs: [],
          outputs: ["@assessmentTypeId"],
        },
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "assessment_correlation_check",
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mixed intents"))).toBe(true);
    });
  });

  describe("validateComposition - workflow_status_monitoring", () => {
    it("validates workflow status composition (flexible order)", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "assessment_type_lookup_by_semantic_concept",
          name: "Lookup",
          intent: "snippet_workflow_status",
          inputs: ["{assessmentConcept}"],
          outputs: ["@assessmentTypeId"],
        },
        {
          id: "workflow_enum_status_filter",
          name: "StatusFilter",
          intent: "snippet_workflow_status",
          inputs: ["@assessmentTypeId", "{statusFieldVariable}"],
          outputs: ["FilteredByStatus"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "workflow_status_monitoring",
      );
      expect(result.valid).toBe(true);
      expect(result.appliedChain?.requiredOrder).toBe(false);
    });
  });

  describe("validateComposition - unknown intent", () => {
    it("returns error for unknown intent", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "some_snippet",
          name: "Some",
          intent: "unknown",
          inputs: [],
          outputs: [],
        },
      ];

      const result = service.validateComposition(snippets, "unknown_intent" as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) =>
        e.includes("No composition chain defined"),
      )).toBe(true);
    });
  });

  describe("getErrorMessage", () => {
    it("returns success message for valid composition", () => {
      const result = {
        valid: true,
        intent: "temporal_proximity_query" as const,
        appliedChain: undefined,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      const message = service.getErrorMessage(result);
      expect(message).toContain("✅");
      expect(message).toContain("Valid composition");
    });

    it("includes errors in message", () => {
      const result = {
        valid: false,
        intent: "temporal_proximity_query" as const,
        appliedChain: undefined,
        errors: ["Error 1", "Error 2"],
        warnings: [],
        suggestions: [],
      };

      const message = service.getErrorMessage(result);
      expect(message).toContain("❌");
      expect(message).toContain("Errors:");
      expect(message).toContain("Error 1");
      expect(message).toContain("Error 2");
    });

    it("includes warnings and suggestions", () => {
      const result = {
        valid: false,
        intent: "temporal_proximity_query" as const,
        appliedChain: undefined,
        errors: [],
        warnings: ["Warning 1"],
        suggestions: ["Suggestion 1"],
      };

      const message = service.getErrorMessage(result);
      expect(message).toContain("Warnings:");
      expect(message).toContain("Warning 1");
      expect(message).toContain("Suggestions:");
      expect(message).toContain("Suggestion 1");
    });
  });

  describe("getChainVisualization", () => {
    it("returns visualization for valid intent", () => {
      const viz = service.getChainVisualization("temporal_proximity_query");
      expect(viz).toContain("→");
      expect(viz).toContain("baseline_measurement_per_wound");
    });

    it("includes optional snippets", () => {
      const viz = service.getChainVisualization("temporal_proximity_query");
      expect(viz).toContain("Optional:");
      expect(viz).toContain("threshold_filter_for_area_reduction");
    });

    it("returns error message for unknown intent", () => {
      const viz = service.getChainVisualization("unknown_intent" as any);
      expect(viz).toContain("No composition chain");
    });
  });

  describe("singleton pattern", () => {
    it("returns same instance", () => {
      const service1 = getSnippetComposerService();
      const service2 = getSnippetComposerService();
      expect(service1).toBe(service2);
    });
  });

  describe("edge cases", () => {
    it("handles empty snippet list", () => {
      const result = service.validateComposition(
        [],
        "temporal_proximity_query",
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) =>
        e.includes("Missing required snippet"),
      )).toBe(true);
    });

    it("handles snippets with no inputs", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
      ];

      const result = service.validateComposition(snippets, "temporal_proximity_query");
      expect(result.errors).not.toContain(
        expect.stringContaining("unsatisfied input"),
      );
    });

    it("handles placeholders correctly", () => {
      const snippets: ComposableSnippet[] = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
        {
          id: "closest_measurement_around_target_date",
          name: "Proximity",
          intent: "snippet_area_reduction",
          inputs: ["BaselineData", "{timePointDays}", "{toleranceDays}"],
          outputs: ["ClosestMeasurement"],
        },
      ];

      const result = service.validateComposition(
        snippets,
        "temporal_proximity_query",
      );
      // Placeholders starting with {} are user-provided and don't cause errors
      expect(
        result.errors.some((e) => e.includes("timePointDays")),
      ).toBe(false);
    });
  });
});

