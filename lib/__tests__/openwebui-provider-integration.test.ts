import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenWebUIProvider } from "../ai/providers/openwebui-provider";
import { getAIProvider } from "../ai/providers/provider-factory";

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("OpenWebUIProvider Integration", () => {
  let provider: OpenWebUIProvider;
  const mockModelId = "llama3.2:3b";

  beforeEach(() => {
    // Reset fetch mock
    fetchMock.mockClear();

    // Set up environment variables
    process.env.OPENWEBUI_BASE_URL = "http://localhost:8080";
    process.env.OPENWEBUI_API_KEY = "test-api-key";
    process.env.OPENWEBUI_TIMEOUT = "30000";

    // Create provider instance
    provider = new OpenWebUIProvider(mockModelId);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.OPENWEBUI_BASE_URL;
    delete process.env.OPENWEBUI_API_KEY;
    delete process.env.OPENWEBUI_TIMEOUT;
  });

  describe("Provider Factory Integration", () => {
    it("should create OpenWebUI provider through factory", async () => {
      const provider = await getAIProvider("llama3.2:3b");
      expect(provider).toBeInstanceOf(OpenWebUIProvider);
    });

    it("should throw error for unsupported model", async () => {
      await expect(getAIProvider("unsupported-model")).rejects.toThrow(
        "Unsupported AI model ID: unsupported-model"
      );
    });
  });

  describe("Complete Query Funnel Workflow", () => {
    const mockAssessmentForm = {
      id: "test-form",
      name: "Test Assessment Form",
      definitionVersion: "1.0",
    };

    const mockDatabaseSchema = `
      Table: patients
      - patient_id (integer, primary key)
      - first_name (varchar)
      - last_name (varchar)
      - date_of_birth (date)
      - gender (varchar)

      Table: assessments
      - assessment_id (integer, primary key)
      - patient_id (integer, foreign key)
      - assessment_date (date)
      - score (integer)
      - assessment_type (varchar)
    `;

    it("should complete full workflow: sub-questions -> SQL -> charts", async () => {
      // Mock sub-question generation response
      const subQuestionResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                subQuestions: [
                  {
                    questionText:
                      "What is the average assessment score by gender?",
                    order: 1,
                  },
                  {
                    questionText:
                      "How many assessments were completed each month?",
                    order: 2,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 100 },
      };

      // Mock SQL generation response
      const sqlResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                explanation: "Calculate average score by gender",
                generatedSql:
                  "SELECT gender, AVG(score) as avg_score FROM patients p JOIN assessments a ON p.patient_id = a.patient_id GROUP BY gender;",
                validationNotes: "Query looks valid",
                matchedQueryTemplate: "aggregation_with_join",
                fieldsApplied: ["gender", "score"],
                joinSummary: "Joined patients and assessments tables",
                sqlWarnings: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 80, completion_tokens: 120 },
      };

      // Mock chart recommendations response
      const chartResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                recommendedChartType: "bar",
                availableMappings: {
                  xAxis: "gender",
                  yAxis: "avg_score",
                },
                explanation:
                  "Bar chart is ideal for comparing averages across categories",
                chartTitle: "Average Assessment Score by Gender",
              }),
            },
          },
        ],
        usage: { prompt_tokens: 60, completion_tokens: 80 },
      };

      // Set up fetch mock responses in sequence
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(subQuestionResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sqlResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(chartResponse),
        });

      // Execute sub-question generation
      const subQuestionResult = await provider.generateSubQuestions({
        originalQuestion: "Analyze patient assessment data",
        formDefinition: mockAssessmentForm,
        databaseSchemaContext: mockDatabaseSchema,
        assessmentFormVersionFk: "test-form-v1",
      });

      expect(subQuestionResult.subQuestions).toHaveLength(2);
      expect(subQuestionResult.subQuestions[0].questionText).toContain(
        "average assessment score"
      );

      // Execute SQL generation for first sub-question
      const sqlResult = await provider.generateQuery({
        subQuestion: subQuestionResult.subQuestions[0].questionText,
        previousQueries: [],
        assessmentFormDefinition: mockAssessmentForm,
        databaseSchemaContext: mockDatabaseSchema,
        desiredFields: ["gender", "score"],
      });

      expect(sqlResult.generatedSql).toContain("SELECT");
      expect(sqlResult.generatedSql).toContain("AVG(score)");
      expect(sqlResult.generatedSql).toContain("GROUP BY gender");
      expect(sqlResult.explanation).toContain("average score");

      // Execute chart recommendations
      const chartResult = await provider.generateChartRecommendations({
        sqlQuery: sqlResult.generatedSql,
        queryResults: [
          { gender: "Male", avg_score: 85.5 },
          { gender: "Female", avg_score: 88.2 },
        ],
        subQuestion: subQuestionResult.subQuestions[0].questionText,
        assessmentFormDefinition: mockAssessmentForm,
      });

      expect(chartResult.recommendedChartType).toBe("bar");
      expect(chartResult.chartTitle).toContain("Average Assessment Score");
      expect(chartResult.availableMappings.xAxis).toBe("gender");
      expect(chartResult.availableMappings.yAxis).toBe("avg_score");

      // Verify all API calls were made
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8080/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("should handle workflow errors gracefully", async () => {
      // Mock API error on first call
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });

      await expect(
        provider.generateSubQuestions({
          originalQuestion: "Analyze patient assessment data",
          formDefinition: mockAssessmentForm,
          databaseSchemaContext: mockDatabaseSchema,
          assessmentFormVersionFk: "test-form-v1",
        })
      ).rejects.toThrow(
        "Open WebUI API error: 500 Internal Server Error - Server error"
      );
    });

    it("should handle invalid JSON responses in workflow", async () => {
      // Mock invalid JSON response
      const invalidResponse = {
        choices: [
          {
            message: {
              content: "Invalid JSON response {",
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidResponse),
      });

      await expect(
        provider.generateSubQuestions({
          originalQuestion: "Analyze patient assessment data",
          formDefinition: mockAssessmentForm,
          databaseSchemaContext: mockDatabaseSchema,
          assessmentFormVersionFk: "test-form-v1",
        })
      ).rejects.toThrow("Invalid response format from Open WebUI API");
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle network timeouts", async () => {
      // Create an AbortError (this is what AbortController.abort() creates)
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      fetchMock.mockRejectedValueOnce(abortError);

      await expect(
        provider.generateSubQuestions({
          originalQuestion: "Test question",
          formDefinition: {},
          databaseSchemaContext: "test schema",
          assessmentFormVersionFk: "test",
        })
      ).rejects.toThrow("Open WebUI request timed out after 30000ms");
    });

    it("should handle connection refused", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(provider.testConnection()).resolves.toBe(false);
    });

    it("should handle malformed API responses", async () => {
      // Mock response with missing choices
      const malformedResponse = {
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        // Missing choices array
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(malformedResponse),
      });

      await expect(
        provider["_executeModel"]("test prompt", "test message")
      ).rejects.toThrow("Invalid response format from Open WebUI API");
    });
  });

  describe("Model Validation and Discovery", () => {
    it("should validate model availability", async () => {
      const modelsResponse = {
        data: [
          { id: "llama3.2:3b" },
          { id: "llama3.1:8b" },
          { id: "mistral:7b" },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(modelsResponse),
      });

      const models = await provider.getAvailableModels();
      expect(models).toEqual(["llama3.2:3b", "llama3.1:8b", "mistral:7b"]);
    });

    it("should handle model discovery errors", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Connection failed"));

      const models = await provider.getAvailableModels();
      expect(models).toEqual([]);
    });

    it("should test connection successfully", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      const isConnected = await provider.testConnection();
      expect(isConnected).toBe(true);
    });

    it("should handle connection test failures", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const isConnected = await provider.testConnection();
      expect(isConnected).toBe(false);
    });
  });
});
