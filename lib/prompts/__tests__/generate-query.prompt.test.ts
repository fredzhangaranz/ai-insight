import { describe, it, expect } from "vitest";
import {
  validateLLMResponse,
  type LLMSQLResponse,
  type LLMClarificationResponse,
  type ClarificationRequest,
  type ClarificationOption,
  type Assumption,
} from "../generate-query.prompt";

describe("LLM Response Validation", () => {
  describe("validateLLMResponse - SQL Response", () => {
    it("should validate a valid SQL response", () => {
      const validSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient WHERE age > 65",
        explanation: "This query retrieves all patients over 65 years old",
        confidence: 0.95,
        assumptions: [],
      };

      expect(validateLLMResponse(validSQLResponse)).toBe(true);
    });

    it("should validate SQL response with assumptions", () => {
      const assumptions: Assumption[] = [
        {
          term: "recent",
          assumedValue: "last 30 days",
          reasoning: "Common clinical definition of recent",
          confidence: 0.8,
        },
      ];

      const sqlResponseWithAssumptions: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT * FROM rpt.Assessment WHERE date >= DATEADD(day, -30, GETDATE())",
        explanation: "Query for recent assessments",
        confidence: 0.85,
        assumptions,
      };

      expect(validateLLMResponse(sqlResponseWithAssumptions)).toBe(true);
    });

    it("should reject SQL response with invalid confidence", () => {
      const invalidResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient",
        explanation: "Valid explanation",
        confidence: 1.5, // Invalid: > 1.0
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject SQL response with negative confidence", () => {
      const invalidResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient",
        explanation: "Valid explanation",
        confidence: -0.1, // Invalid: < 0
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject SQL response without SELECT statement", () => {
      const invalidResponse = {
        responseType: "sql",
        generatedSql: "DELETE FROM rpt.Patient", // Not a SELECT
        explanation: "Valid explanation",
        confidence: 0.9,
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject SQL response with missing fields", () => {
      const invalidResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient",
        // Missing explanation and confidence
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should accept SQL response with whitespace/newlines before SELECT", () => {
      const validResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "\n  SELECT * FROM rpt.Patient",
        explanation: "Valid explanation",
        confidence: 0.9,
      };

      expect(validateLLMResponse(validResponse)).toBe(true);
    });
  });

  describe("validateLLMResponse - Clarification Response", () => {
    it("should validate a valid clarification response", () => {
      const validClarificationResponse: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "The term 'large' is ambiguous and requires clarification",
        clarifications: [
          {
            id: "clarify_large_wound",
            ambiguousTerm: "large",
            question: "What size threshold should I use for 'large' wounds?",
            options: [
              {
                id: "size_10",
                label: "Greater than 10 cm²",
                description: "Wounds exceeding 10 square centimeters",
                sqlConstraint: "area > 10",
                isDefault: false,
              },
              {
                id: "size_25",
                label: "Greater than 25 cm²",
                description: "Wounds exceeding 25 square centimeters",
                sqlConstraint: "area > 25",
                isDefault: true,
              },
            ],
            allowCustom: true,
          },
        ],
        partialContext: {
          intent: "query",
          formsIdentified: ["WoundAssessment"],
          termsUnderstood: ["patients", "wounds"],
        },
      };

      expect(validateLLMResponse(validClarificationResponse)).toBe(true);
    });

    it("should validate clarification with multiple requests", () => {
      const multiClarificationResponse: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "Need clarification on both 'recent' and 'serious'",
        clarifications: [
          {
            id: "clarify_recent",
            ambiguousTerm: "recent",
            question: "What time period for 'recent'?",
            options: [
              {
                id: "days_7",
                label: "Last 7 days",
                sqlConstraint: "A.date >= DATEADD(day, -7, GETDATE())",
              },
              {
                id: "days_30",
                label: "Last 30 days",
                sqlConstraint: "A.date >= DATEADD(day, -30, GETDATE())",
              },
            ],
            allowCustom: true,
          },
          {
            id: "clarify_serious",
            ambiguousTerm: "serious",
            question: "How to define 'serious' wounds?",
            options: [
              {
                id: "depth_full",
                label: "Full thickness wounds",
                sqlConstraint: "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')",
              },
              {
                id: "infected",
                label: "Infected wounds",
                sqlConstraint: "infected = 1",
              },
            ],
            allowCustom: false,
          },
        ],
      };

      expect(validateLLMResponse(multiClarificationResponse)).toBe(true);
    });

    it("should reject clarification with empty clarifications array", () => {
      const invalidResponse = {
        responseType: "clarification",
        reasoning: "Need clarification",
        clarifications: [], // Empty array
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject clarification with missing reasoning", () => {
      const invalidResponse = {
        responseType: "clarification",
        // Missing reasoning
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test question?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                sqlConstraint: "col = 1",
              },
            ],
            allowCustom: true,
          },
        ],
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject clarification with invalid option structure", () => {
      const invalidResponse = {
        responseType: "clarification",
        reasoning: "Valid reasoning",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test question?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                // Missing sqlConstraint
              },
            ],
            allowCustom: true,
          },
        ],
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject clarification without options", () => {
      const invalidResponse = {
        responseType: "clarification",
        reasoning: "Valid reasoning",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test question?",
            options: [], // Empty options
            allowCustom: true,
          },
        ],
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject clarification with missing allowCustom", () => {
      const invalidResponse = {
        responseType: "clarification",
        reasoning: "Valid reasoning",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test question?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                sqlConstraint: "col = 1",
              },
            ],
            // Missing allowCustom
          },
        ],
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });
  });

  describe("validateLLMResponse - Invalid Responses", () => {
    it("should reject null response", () => {
      expect(validateLLMResponse(null)).toBe(false);
    });

    it("should reject non-object response", () => {
      expect(validateLLMResponse("invalid")).toBe(false);
      expect(validateLLMResponse(123)).toBe(false);
      expect(validateLLMResponse(true)).toBe(false);
    });

    it("should reject response without responseType", () => {
      const invalidResponse = {
        generatedSql: "SELECT * FROM rpt.Patient",
        explanation: "Valid explanation",
        confidence: 0.9,
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });

    it("should reject response with invalid responseType", () => {
      const invalidResponse = {
        responseType: "invalid_type",
        generatedSql: "SELECT * FROM rpt.Patient",
        explanation: "Valid explanation",
        confidence: 0.9,
      };

      expect(validateLLMResponse(invalidResponse)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle clarification with optional description in options", () => {
      const responseWithOptionalDescription: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "Need clarification",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                sqlConstraint: "col = 1",
                // description is optional
              },
              {
                id: "opt2",
                label: "Option 2",
                description: "With description",
                sqlConstraint: "col = 2",
              },
            ],
            allowCustom: true,
          },
        ],
      };

      expect(validateLLMResponse(responseWithOptionalDescription)).toBe(true);
    });

    it("should handle clarification with optional isDefault in options", () => {
      const responseWithOptionalDefault: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "Need clarification",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                sqlConstraint: "col = 1",
                // isDefault is optional
              },
              {
                id: "opt2",
                label: "Option 2",
                sqlConstraint: "col = 2",
                isDefault: true,
              },
            ],
            allowCustom: false,
          },
        ],
      };

      expect(validateLLMResponse(responseWithOptionalDefault)).toBe(true);
    });

    it("should handle SQL response with optional assumptions field", () => {
      const responseWithoutAssumptions: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient",
        explanation: "Valid explanation",
        confidence: 0.9,
        // assumptions is optional
      };

      expect(validateLLMResponse(responseWithoutAssumptions)).toBe(true);
    });

    it("should handle clarification with optional partialContext", () => {
      const responseWithoutPartialContext: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "Need clarification",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                sqlConstraint: "col = 1",
              },
            ],
            allowCustom: true,
          },
        ],
        // partialContext is optional
      };

      expect(validateLLMResponse(responseWithoutPartialContext)).toBe(true);
    });
  });
});
