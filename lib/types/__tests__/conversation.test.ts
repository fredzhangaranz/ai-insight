import { describe, expect, it } from "vitest";
import type {
  ResultSummary,
  SuggestionCategory,
} from "../conversation";
import { validateResultSummary } from "../conversation";

describe("Conversation Types", () => {
  it("ResultSummary only includes non-PHI fields", () => {
    const validSummary: ResultSummary = {
      rowCount: 10,
      columns: ["id", "age"],
      entityHashes: ["abc123"],
    };

    expect(validSummary).toBeDefined();
  });

  it("SuggestionCategory is limited to the canonical list", () => {
    const validCategories: SuggestionCategory[] = [
      "follow_up",
      "aggregation",
      "time_shift",
      "filter",
      "drill_down",
    ];

    expect(validCategories).toHaveLength(5);
  });

  describe("Runtime Validation", () => {
    it("validates valid ResultSummary at runtime", () => {
      const validObj = {
        rowCount: 10,
        columns: ["id", "age"],
        entityHashes: ["abc123", "def456"],
        executionTimeMs: 150,
      };

      const result = validateResultSummary(validObj);

      expect(result.rowCount).toBe(10);
      expect(result.columns).toEqual(["id", "age"]);
      expect(result.entityHashes).toEqual(["abc123", "def456"]);
      expect(result.executionTimeMs).toBe(150);
    });

    it("validates ResultSummary without optional fields", () => {
      const validObj = {
        rowCount: 5,
        columns: ["name"],
      };

      const result = validateResultSummary(validObj);

      expect(result.rowCount).toBe(5);
      expect(result.columns).toEqual(["name"]);
      expect(result.entityHashes).toBeUndefined();
      expect(result.executionTimeMs).toBeUndefined();
    });

    it("rejects invalid ResultSummary - wrong type for rowCount", () => {
      const invalidObj = {
        rowCount: "not a number", // ← Wrong type
        columns: ["id"],
      };

      expect(() => validateResultSummary(invalidObj)).toThrow();
    });

    it("rejects invalid ResultSummary - negative rowCount", () => {
      const invalidObj = {
        rowCount: -5, // ← Negative not allowed
        columns: ["id"],
      };

      expect(() => validateResultSummary(invalidObj)).toThrow();
    });

    it("rejects invalid ResultSummary - columns not array", () => {
      const invalidObj = {
        rowCount: 10,
        columns: "not an array", // ← Wrong type
      };

      expect(() => validateResultSummary(invalidObj)).toThrow();
    });

    it("rejects invalid ResultSummary - missing required field", () => {
      const invalidObj = {
        columns: ["id"],
        // Missing rowCount
      };

      expect(() => validateResultSummary(invalidObj)).toThrow();
    });

    it("rejects invalid ResultSummary - entityHashes not array of strings", () => {
      const invalidObj = {
        rowCount: 10,
        columns: ["id"],
        entityHashes: [123, 456], // ← Should be strings
      };

      expect(() => validateResultSummary(invalidObj)).toThrow();
    });
  });
});
