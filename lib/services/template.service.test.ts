import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "../db";
import { listTemplates } from "./template.service";
import { resetTemplateCatalogCache } from "./query-template.service";

const mockGetInsightGenDbPool = getInsightGenDbPool as unknown as vi.Mock;

describe("template.service listTemplates", () => {
  beforeEach(() => {
    resetTemplateCatalogCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTemplateCatalogCache();
    delete process.env.AI_TEMPLATES_ENABLED;
  });

  it("returns JSON-backed templates when feature flag is disabled", async () => {
    process.env.AI_TEMPLATES_ENABLED = "false";

    const result = await listTemplates({ search: "wound", limit: 5 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((tpl) => tpl.status === "Approved")).toBe(true);
  });

  it("applies filters when querying the database", async () => {
    process.env.AI_TEMPLATES_ENABLED = "true";

    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          templateId: 1,
          templateVersionId: 11,
          name: "DB Template",
          description: null,
          intent: "aggregation_by_category",
          status: "Approved",
          version: 1,
          sqlPattern: "SELECT 1",
          placeholdersSpec: { slots: [] },
          keywords: ["demo"],
          tags: ["tag"],
          examples: ["example"],
          successCount: 5,
          usageCount: 10,
        },
      ],
    });

    mockGetInsightGenDbPool.mockResolvedValue({ query: queryMock } as any);

    const result = await listTemplates({ status: ["Approved"], search: "demo", limit: 10 });

    expect(mockGetInsightGenDbPool).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledOnce();
    expect(queryMock.mock.calls[0]?.[0]).toContain("WHERE");
    expect(queryMock.mock.calls[0]?.[0]).toContain("LIMIT");
    expect(result[0]?.name).toBe("DB Template");
    expect(result[0]?.successRate).toBeCloseTo(0.5, 1);
  });
});

