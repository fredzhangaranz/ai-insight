/**
 * Tests for ExecutionModeSelector (Simplified 2-mode)
 * Tests execution mode selection between snippets and semantic modes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ExecutionModeSelector,
  getExecutionModeSelector,
  selectExecutionMode,
  type ExecutionMode,
  type ModeDecision,
} from "../execution-mode-selector.service";
import type { SnippetMatch } from "../../semantic/template-matcher.service";

describe("ExecutionModeSelector (2-mode simplified)", () => {
  let selector: ExecutionModeSelector;

  beforeEach(() => {
    selector = new ExecutionModeSelector();
  });

  describe("selectMode - Snippets Mode", () => {
    it("selects snippets mode when score > 0.6 and placeholders resolved", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Baseline Measurement",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: ["baseline"],
            tags: ["area-reduction"],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.85,
          matchReasons: ["keyword:baseline", "intent:match"],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("snippets");
      expect(decision.reason).toContain("relevant snippets");
      expect(decision.snippets).toHaveLength(1);
    });

    it("rejects snippets mode if score too low", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Low Score Snippet",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.5, // Below 0.6 threshold
          matchReasons: [],
          contextSatisfied: false,
          missingContext: ["baseline"],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("semantic");
      expect(decision.reason).toContain("below threshold");
    });

    it("rejects snippets mode if placeholders not resolved", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Baseline Measurement",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: ["baseline"],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.8,
          matchReasons: ["keyword:baseline"],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: false, // Not resolved!
      });

      expect(decision.mode).toBe("semantic");
    });

    it("includes multiple snippets in result", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Baseline",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.9,
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
        {
          snippet: {
            name: "Proximity",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.85,
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("snippets");
      expect(decision.snippets).toHaveLength(2);
    });
  });

  describe("selectMode - Semantic Mode", () => {
    it("selects semantic mode when no snippets", () => {
      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: [],
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("semantic");
      expect(decision.reason).toContain("No relevant snippets");
    });

    it("selects semantic mode when snippet score too low", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Low Score",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.45, // Below 0.6
          matchReasons: [],
          contextSatisfied: false,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("semantic");
      expect(decision.reason).toContain("below threshold");
    });

    it("selects semantic mode when placeholders not resolved", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Snippet",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.8, // Good score
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: false, // But placeholders not resolved
      });

      expect(decision.mode).toBe("semantic");
    });
  });

  describe("getModeDescription", () => {
    it("returns description for snippets mode", () => {
      const desc = selector.getModeDescription("snippets");
      expect(desc).toContain("Snippet-Guided");
      expect(desc).toContain("snippets");
    });

    it("returns description for semantic mode", () => {
      const desc = selector.getModeDescription("semantic");
      expect(desc).toContain("Semantic");
    });
  });

  describe("requiresLLM", () => {
    it("returns true for both modes", () => {
      expect(selector.requiresLLM("snippets")).toBe(true);
      expect(selector.requiresLLM("semantic")).toBe(true);
    });
  });

  describe("estimateLatency", () => {
    it("estimates 1-3s for snippets mode", () => {
      const latency = selector.estimateLatency("snippets");
      expect(latency.min).toBe(1000);
      expect(latency.max).toBe(3000);
    });

    it("estimates 3-8s for semantic mode", () => {
      const latency = selector.estimateLatency("semantic");
      expect(latency.min).toBe(3000);
      expect(latency.max).toBe(8000);
    });
  });

  describe("singleton pattern", () => {
    it("returns same instance", () => {
      const sel1 = getExecutionModeSelector();
      const sel2 = getExecutionModeSelector();
      expect(sel1).toBe(sel2);
    });
  });

  describe("selectExecutionMode convenience function", () => {
    it("works with minimal options", async () => {
      const decision = await selectExecutionMode({
        intent: "temporal_proximity_query",
        matchedSnippets: [],
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("semantic");
    });

    it("works with good snippets", async () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Baseline",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.75,
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = await selectExecutionMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("snippets");
    });
  });

  describe("edge cases", () => {
    it("handles exactly 0.6 score as pass", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Edge Case",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.6, // Exactly at threshold
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      // Should pass (> means > not >=, but at 0.6 should pass based on condition)
      expect(decision.mode).toBe("snippets");
    });

    it("handles just over threshold", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Just Over",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.61, // Just over 0.6
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("snippets");
    });

    it("handles just under threshold", () => {
      const snippets: SnippetMatch[] = [
        {
          snippet: {
            name: "Just Under",
            description: "",
            intent: "snippet_area_reduction",
            version: 1,
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            sqlPattern: "SELECT ...",
          },
          relevanceScore: 0.59, // Just under 0.6
          matchReasons: [],
          contextSatisfied: false,
          missingContext: [],
        },
      ];

      const decision = selector.selectMode({
        intent: "temporal_proximity_query",
        matchedSnippets: snippets,
        placeholdersResolved: true,
      });

      expect(decision.mode).toBe("semantic");
    });
  });
});
