import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "../db";
import {
  getTemplates,
  resetTemplateCatalogCache,
} from "./query-template.service";

const mockGetInsightGenDbPool = getInsightGenDbPool as unknown as vi.Mock;

describe("query template catalog feature flag gating", () => {
  let warnSpy: ReturnType<typeof vi.spyOn<typeof console, "warn">> | null = null;

  beforeEach(() => {
    resetTemplateCatalogCache();
    vi.clearAllMocks();
    warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockGetInsightGenDbPool.mockReset();
  });

  afterEach(() => {
    resetTemplateCatalogCache();
    warnSpy?.mockRestore();
    warnSpy = null;
    delete process.env.AI_TEMPLATES_ENABLED;
  });

  it("loads JSON catalog when feature flag is disabled", async () => {
    process.env.AI_TEMPLATES_ENABLED = "false";
    const readFileSpy = vi.spyOn(fs.promises, "readFile");

    const catalog = await getTemplates({ forceReload: true });

    expect(readFileSpy).toHaveBeenCalledOnce();
    expect(Array.isArray(catalog.templates)).toBe(true);
    expect(catalog.templates.length).toBeGreaterThan(0);

    readFileSpy.mockRestore();
  });

  it("reloads catalog when toggling feature flag without restart", async () => {
    process.env.AI_TEMPLATES_ENABLED = "false";
    const readFileSpy = vi.spyOn(fs.promises, "readFile");
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          name: "From DB",
          description: null,
          intent: "aggregation_by_category",
          status: "Approved",
          sqlPattern: "SELECT 1",
          placeholdersSpec: { slots: [{ name: "patientId" }] },
          keywords: ["demo"],
          tags: ["tag"],
          examples: ["example"],
          version: 1,
        },
      ],
    });
    mockGetInsightGenDbPool.mockResolvedValue({
      query: mockQuery,
    } as any);

    await getTemplates({ forceReload: true });
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    process.env.AI_TEMPLATES_ENABLED = "true";
    const catalog = await getTemplates({ forceReload: true });
    expect(mockGetInsightGenDbPool).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]?.[0]).toContain("JOIN LATERAL");
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    expect(catalog.templates[0].placeholders).toEqual(["patientId"]);

    await getTemplates();
    expect(mockQuery).toHaveBeenCalledTimes(1);

    readFileSpy.mockRestore();
  });

  it("falls back to JSON when DB returns no rows", async () => {
    process.env.AI_TEMPLATES_ENABLED = "true";
    const readFileSpy = vi.spyOn(fs.promises, "readFile");
    mockGetInsightGenDbPool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as any);

    const catalog = await getTemplates({ forceReload: true });

    expect(catalog.templates.length).toBeGreaterThan(0);
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    readFileSpy.mockRestore();
  });

  it("falls back to JSON when DB query throws", async () => {
    process.env.AI_TEMPLATES_ENABLED = "true";
    const readFileSpy = vi.spyOn(fs.promises, "readFile");
    mockGetInsightGenDbPool.mockRejectedValue(new Error("db unavailable"));

    const catalog = await getTemplates({ forceReload: true });

    expect(Array.isArray(catalog.templates)).toBe(true);
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    readFileSpy.mockRestore();
  });
});
