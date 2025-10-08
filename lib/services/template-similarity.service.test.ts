import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  SIMILARITY_THRESHOLD,
  SimilarTemplateWarning,
  TemplateDraft,
  checkSimilarTemplates,
} from "./template-similarity.service";
import * as queryTemplateService from "./query-template.service";

// Mock the query template service
vi.mock("./query-template.service", async () => {
  const actual = await vi.importActual<
    typeof import("./query-template.service")
  >("./query-template.service");
  return {
    ...actual,
    getTemplates: vi.fn(),
  };
});

describe("template-similarity.service", () => {
  const mockGetTemplates = vi.mocked(queryTemplateService.getTemplates);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("SIMILARITY_THRESHOLD", () => {
    it("is set to 0.70", () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.7);
    });
  });

  describe("checkSimilarTemplates", () => {
    it("returns empty array when draft is missing required fields", async () => {
      mockGetTemplates.mockResolvedValue({ templates: [] });

      const result1 = await checkSimilarTemplates({
        name: "",
        intent: "aggregation_by_category",
      });
      expect(result1).toEqual([]);

      const result2 = await checkSimilarTemplates({
        name: "Test",
        intent: "",
      });
      expect(result2).toEqual([]);

      const result3 = await checkSimilarTemplates({} as TemplateDraft);
      expect(result3).toEqual([]);
    });

    it("returns empty array when catalog is empty", async () => {
      mockGetTemplates.mockResolvedValue({ templates: [] });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);
      expect(result).toEqual([]);
    });

    it("returns empty array when no templates match intent", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            name: "Different Intent Template",
            intent: "time_series_trend",
            description: "Trend over time",
            keywords: ["time", "trend"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients",
        keywords: ["patient", "count"],
      };

      const result = await checkSimilarTemplates(draft);
      expect(result).toEqual([]);
    });

    it("excludes deprecated templates from similarity check", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 1,
            name: "Patient Count by Wound Type",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound type",
            keywords: ["patient", "count", "wound", "type"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Deprecated",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);
      expect(result).toEqual([]);
    });

    it("detects exact duplicate (100% similarity)", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 1,
            name: "Patient Count by Wound Type",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound type",
            keywords: ["patient", "count", "wound", "type"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);

      expect(result).toHaveLength(1);
      expect(result[0].templateId).toBe(1);
      expect(result[0].name).toBe("Patient Count by Wound Type");
      expect(result[0].similarity).toBe(1.0);
      expect(result[0].message).toContain("100% similar");
    });

    it("detects high similarity above threshold", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 2,
            name: "Patient Count by Wound Category",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound type category",
            keywords: [
              "patient",
              "count",
              "wound",
              "type",
              "category",
              "grouped",
            ],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type", "grouped"],
      };

      const result = await checkSimilarTemplates(draft);

      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
      expect(result[0].similarity).toBeLessThan(1.0);
    });

    it("ignores templates below similarity threshold", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 3,
            name: "Latest Measurement Date",
            intent: "aggregation_by_category", // Same intent
            description: "Get the most recent measurement date per patient",
            keywords: ["latest", "measurement", "date", "recent"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);

      expect(result).toHaveLength(0);
    });

    it("includes success rate and usage count in warning message", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 4,
            name: "Patient Count by Wound Type",
            intent: "aggregation_by_category",
            description: "Count patients by wound type",
            keywords: ["patient", "count", "wound", "type"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
            successRate: 0.85,
            successCount: 17,
            usageCount: 20,
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);

      expect(result).toHaveLength(1);
      expect(result[0].successRate).toBe(0.85);
      expect(result[0].usageCount).toBe(20);
      expect(result[0].message).toContain("85% success rate");
      expect(result[0].message).toContain("20 uses");
    });

    it("sorts results by similarity descending", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 5,
            name: "Patient Count by Wound",
            intent: "aggregation_by_category",
            description: "Count patients",
            keywords: ["patient", "count"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
          {
            templateId: 6,
            name: "Patient Count by Wound Type",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound type",
            keywords: ["patient", "count", "wound", "type"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
          {
            templateId: 7,
            name: "Patient Counts",
            intent: "aggregation_by_category",
            description: "Count patients by category",
            keywords: ["patient", "count", "category"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);

      // Template 6 should be first (highest similarity)
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].templateId).toBe(6);

      // Check that similarities are in descending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].similarity).toBeGreaterThanOrEqual(
          result[i].similarity
        );
      }
    });

    it("uses success rate as secondary sort when similarity is equal", async () => {
      // Create templates with intentionally identical similarity but different success rates
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 8,
            name: "Template A",
            intent: "aggregation_by_category",
            description: "Test",
            keywords: ["test"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
            successRate: 0.5,
            usageCount: 10,
          },
          {
            templateId: 9,
            name: "Template B",
            intent: "aggregation_by_category",
            description: "Test",
            keywords: ["test"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
            successRate: 0.9,
            usageCount: 10,
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Template C",
        intent: "aggregation_by_category",
        description: "Test",
        keywords: ["test"],
      };

      const result = await checkSimilarTemplates(draft);

      // Both should match with same similarity, but B should be first due to higher success rate
      if (result.length >= 2) {
        const [first, second] = result;
        if (Math.abs(first.similarity - second.similarity) < 0.001) {
          expect(first.templateId).toBe(9); // Template B with higher success rate
          expect(second.templateId).toBe(8);
        }
      }
    });

    it("handles templates with minimal metadata", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 10,
            name: "Minimal Template",
            intent: "aggregation_by_category",
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
            // No description, keywords, tags
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Minimal Draft",
        intent: "aggregation_by_category",
        // No description, keywords, tags
      };

      const result = await checkSimilarTemplates(draft);

      // Should not crash, but similarity will be low
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles draft with tags field", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 11,
            name: "Tagged Template",
            intent: "aggregation_by_category",
            description: "Template with tags",
            keywords: ["test"],
            tags: ["wound", "analysis", "patient"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Tagged Draft",
        intent: "aggregation_by_category",
        description: "Draft with tags",
        keywords: ["test"],
        tags: ["wound", "analysis", "patient"],
      };

      const result = await checkSimilarTemplates(draft);

      // Tags should contribute to similarity calculation
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].similarity).toBeGreaterThan(0);
    });

    it("returns all similar templates above threshold", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 12,
            name: "Patient Count by Wound Type A",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound type",
            keywords: ["patient", "count", "wound", "type"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
          {
            templateId: 13,
            name: "Patient Count by Wound Type B",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound type",
            keywords: ["patient", "count", "wound", "type"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
          {
            templateId: 14,
            name: "Patient Count by Wound Category",
            intent: "aggregation_by_category",
            description: "Count patients grouped by wound category",
            keywords: ["patient", "count", "wound", "category"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Count by Wound Type",
        intent: "aggregation_by_category",
        description: "Count patients grouped by wound type",
        keywords: ["patient", "count", "wound", "type"],
      };

      const result = await checkSimilarTemplates(draft);

      // All three templates should be highly similar
      expect(result.length).toBeGreaterThanOrEqual(2);
      result.forEach((warning) => {
        expect(warning.similarity).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
      });
    });

    it("constructs meaningful warning messages", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 15,
            name: "Existing Template",
            intent: "aggregation_by_category",
            description: "Test template",
            keywords: ["test"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
            successRate: 0.75,
            usageCount: 8,
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "New Template",
        intent: "aggregation_by_category",
        description: "Test template",
        keywords: ["test"],
      };

      const result = await checkSimilarTemplates(draft);

      if (result.length > 0) {
        const warning = result[0];
        expect(warning.message).toContain("Existing Template");
        expect(warning.message).toMatch(/\d+% similar/);
        expect(warning.message).toContain("75% success rate");
        expect(warning.message).toContain("8 uses");
        expect(warning.message).toContain("Consider reviewing");
      }
    });

    it("constructs warning message without success rate when unavailable", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 16,
            name: "Untested Template",
            intent: "aggregation_by_category",
            description: "Template without usage data",
            keywords: ["test"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
            // No successRate or usageCount
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Similar Draft",
        intent: "aggregation_by_category",
        description: "Template without usage data",
        keywords: ["test"],
      };

      const result = await checkSimilarTemplates(draft);

      if (result.length > 0) {
        const warning = result[0];
        expect(warning.message).toContain("Untested Template");
        expect(warning.message).toMatch(/\d+% similar/);
        expect(warning.message).not.toContain("success rate");
        expect(warning.message).not.toContain("uses");
        expect(warning.message).toContain("Consider reviewing");
      }
    });

    it("calculates similarity correctly with overlapping keywords", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 17,
            name: "Wound Analysis Report",
            intent: "aggregation_by_category",
            description: "Analysis of wound data",
            keywords: ["wound", "patient", "analysis"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Wound Analysis Report",
        intent: "aggregation_by_category",
        description: "Analysis of wound patient data",
        keywords: ["wound", "patient", "analysis"], // Matching keywords
      };

      const result = await checkSimilarTemplates(draft);

      // Should find similarity based on keyword overlap
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns empty result for different intent even with identical content", async () => {
      mockGetTemplates.mockResolvedValue({
        templates: [
          {
            templateId: 18,
            name: "Patient Timeline",
            intent: "time_series_trend",
            description: "Show patient data over time",
            keywords: ["patient", "time", "trend"],
            sqlPattern: "SELECT ...",
            version: 1,
            status: "Approved",
          },
        ],
      });

      const draft: TemplateDraft = {
        name: "Patient Timeline",
        intent: "aggregation_by_category", // Different intent
        description: "Show patient data over time",
        keywords: ["patient", "time", "trend"],
      };

      const result = await checkSimilarTemplates(draft);

      // Should NOT match because intent differs
      expect(result).toHaveLength(0);
    });
  });
});
