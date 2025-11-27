import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "../db";
import {
  getTemplateById,
  getTemplates,
  getTemplatesByIntent,
  matchTemplates,
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
          templateId: 1,
          templateVersionId: 11,
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
          successCount: 8,
          usageCount: 10,
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

  it("boosts templates with higher success rate", async () => {
    process.env.AI_TEMPLATES_ENABLED = "true";

    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          templateId: 1,
          templateVersionId: 101,
          name: "High Success",
          description: "",
          intent: "aggregation_by_category",
          status: "Approved",
          sqlPattern: "SELECT 1 WHERE value = {term}",
          placeholdersSpec: { slots: [{ name: "term" }] },
          keywords: ["term"],
          tags: ["demo"],
          examples: ["term usage"],
          version: 1,
          successCount: 9,
          usageCount: 10,
        },
        {
          templateId: 2,
          templateVersionId: 102,
          name: "Low Success",
          description: "",
          intent: "aggregation_by_category",
          status: "Approved",
          sqlPattern: "SELECT 1 WHERE value = {term}",
          placeholdersSpec: { slots: [{ name: "term" }] },
          keywords: ["term"],
          tags: ["demo"],
          examples: ["term usage"],
          version: 1,
          successCount: 1,
          usageCount: 10,
        },
      ],
    });

    mockGetInsightGenDbPool.mockResolvedValue({ query: mockQuery } as any);

    const matches = await matchTemplates("term", 2);

    expect(matches[0]?.template.name).toBe("High Success");
    expect(matches[0]?.successRate).toBeCloseTo(0.9, 2);
    expect(matches[1]?.template.name).toBe("Low Success");
  });

  it("exposes helper to fetch template by id using memoized index", async () => {
    process.env.AI_TEMPLATES_ENABLED = "true";
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          templateId: 42,
          templateVersionId: 420,
          name: "Memoized Template",
          description: "  keep me ",
          intent: "aggregation_by_category",
          status: "Approved",
          sqlPattern: "SELECT 1 WHERE field = {term}",
          placeholdersSpec: { slots: [{ name: " term " }] },
          resultShape: null,
          notes: " note ",
          keywords: [" term ", "term"],
          tags: ["agg"],
          examples: ["use term"],
          version: 1,
          successCount: 2,
          usageCount: 3,
        },
      ],
    });

    mockGetInsightGenDbPool.mockResolvedValue({ query: mockQuery } as any);

    const template = await getTemplateById(42, { forceReload: true });
    expect(template?.templateId).toBe(42);
    expect(template?.placeholders).toEqual(["term"]);
    expect(template?.keywords).toEqual(["term"]);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const cached = await getTemplateById(42);
    expect(cached?.templateId).toBe(42);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("returns normalized intent matches via helper lookup", async () => {
    process.env.AI_TEMPLATES_ENABLED = "true";
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          templateId: 11,
          templateVersionId: 111,
          name: "Temporal 1",
          description: "",
          intent: "temporal_proximity_query",
          status: "Approved",
          sqlPattern: "SELECT 1",
          placeholdersSpec: { slots: [{ name: "asOfDate" }] },
          resultShape: null,
          notes: null,
          keywords: ["temporal"],
          tags: ["time"],
          examples: ["question"],
          version: 1,
          successCount: 1,
          usageCount: 1,
        },
        {
          templateId: 12,
          templateVersionId: 112,
          name: "Temporal 2",
          description: "",
          intent: "Temporal_Proximity_Query ",
          status: "Approved",
          sqlPattern: "SELECT 1",
          placeholdersSpec: { slots: [{ name: "asOfDate" }] },
          resultShape: null,
          notes: null,
          keywords: ["temporal"],
          tags: ["time"],
          examples: ["question"],
          version: 1,
          successCount: 1,
          usageCount: 1,
        },
      ],
    });

    mockGetInsightGenDbPool.mockResolvedValue({ query: mockQuery } as any);

    const templates = await getTemplatesByIntent("  temporal_proximity_query ", {
      forceReload: true,
    });

    expect(templates).toHaveLength(2);
    expect(templates.map((tpl) => tpl.templateId).sort()).toEqual([11, 12]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("normalizes json catalog templates when feature flag disabled", async () => {
    process.env.AI_TEMPLATES_ENABLED = "false";
    const customCatalog = {
      templates: [
        {
          name: "  Demo Template ",
          description: " ",
          intent: "  aggregator  ",
          questionExamples: [" Example "],
          keywords: [" foo ", "foo"],
          tags: ["tag ", "tag"],
          placeholders: [" value ", ""],
          sqlPattern: "SELECT 1 FROM table WHERE value = {value}",
          version: 1,
          placeholdersSpec: {
            slots: [{ name: " value  ", semantic: " metric " }],
          },
        },
      ],
    };
    const readFileSpy = vi
      .spyOn(fs.promises, "readFile")
      .mockResolvedValue(JSON.stringify(customCatalog));

    const catalog = await getTemplates({ forceReload: true });

    expect(catalog.templates).toHaveLength(1);
    const tpl = catalog.templates[0];
    expect(tpl.intent).toBe("aggregator");
    expect(tpl.keywords).toEqual(["foo"]);
    expect(tpl.tags).toEqual(["tag"]);
    expect(tpl.placeholders).toEqual(["value"]);
    expect(tpl.placeholdersSpec?.slots[0]?.name).toBe("value");

    readFileSpy.mockRestore();
  });
});
