import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import {
  TemplateUsageLoggerService,
  TemplateUsageMode,
} from "../template-usage-logger.service";

const getPoolMock = getInsightGenDbPool as unknown as vi.Mock;

describe("TemplateUsageLoggerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockPool() {
    const pool = { query: vi.fn() };
    getPoolMock.mockResolvedValue(pool);
    return pool;
  }

  it("logs template usage start with metadata snapshot", async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [{ id: 123 }] });

    const logger = new TemplateUsageLoggerService();
    const id = await logger.logUsageStart({
      templateVersionId: 42,
      subQuestionId: 5,
      question: "Show me healing rate at 4 weeks",
      mode: "template_direct",
      placeholderValues: { timePointDays: 28 },
      matchedKeywords: ["healing", "rate"],
    });

    expect(id).toBe(123);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "TemplateUsage"'),
      [
        42,
        5,
        "Show me healing rate at 4 weeks",
        true,
        ["healing", "rate", "mode:template_direct"],
        JSON.stringify({ placeholderValues: { timePointDays: 28 } }),
      ]
    );
  });

  it("logs usage outcome with explicit latency when provided", async () => {
    const pool = createMockPool();
    const logger = new TemplateUsageLoggerService();

    await logger.logUsageOutcome({
      templateUsageId: 10,
      success: true,
      errorType: null,
      latencyMs: 2500.4,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "TemplateUsage"'),
      [10, true, null, 2500]
    );
  });

  it("falls back to elapsed latency when none provided", async () => {
    const pool = createMockPool();
    const logger = new TemplateUsageLoggerService();

    await logger.logUsageOutcome({
      templateUsageId: 99,
      success: false,
      errorType: "syntax_error",
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('EXTRACT(EPOCH FROM (NOW() - "matchedAt")'),
      [99, false, "syntax_error"]
    );
  });
});
