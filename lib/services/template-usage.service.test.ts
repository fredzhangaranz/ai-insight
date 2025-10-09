import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "../db";
import {
  createTemplateUsage,
  markTemplateUsageOutcome,
} from "./template-usage.service";

const getPoolMock = getInsightGenDbPool as unknown as vi.Mock;

describe("template-usage.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts template usage record with provided metadata", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: 42 }] });
    getPoolMock.mockResolvedValue({ query: queryMock });

    const input = {
      templateVersionId: 10,
      subQuestionId: 99,
      questionText: "How many assessments?",
      matchedKeywords: ["assessments", "count"],
      matchedExample: "How many assessments did we run?",
      chosen: true,
    };

    const result = await createTemplateUsage(input);

    expect(result.id).toBe(42);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "TemplateUsage"'),
      [
        input.templateVersionId,
        input.subQuestionId,
        input.questionText,
        true,
        input.matchedKeywords,
        input.matchedExample,
      ]
    );
  });

  it("inserts template usage when optional fields missing", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: 7 }] });
    getPoolMock.mockResolvedValue({ query: queryMock });

    const result = await createTemplateUsage({
      questionText: "No template matched",
    });

    expect(result.id).toBe(7);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "TemplateUsage"'),
      [null, null, "No template matched", true, null, null]
    );
  });

  it("updates usage outcome with success flag and latency", async () => {
    const queryMock = vi.fn().mockResolvedValue({});
    getPoolMock.mockResolvedValue({ query: queryMock });

    await markTemplateUsageOutcome({
      templateUsageId: 55,
      success: true,
      errorType: null,
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "TemplateUsage"'),
      [55, true, null]
    );
  });
});
