import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../query-template.service", () => ({
  getTemplates: vi.fn(),
}));

import { matchTemplate } from "../template-matcher.service";
import { getTemplates } from "../../query-template.service";
import type { QueryTemplate } from "../../query-template.service";

const mockGetTemplates = getTemplates as unknown as vi.Mock;

let templateCounter = 0;
function buildTemplate(
  overrides: Partial<QueryTemplate> = {}
): QueryTemplate {
  templateCounter += 1;
  return {
    name: overrides.name ?? `Template-${templateCounter}`,
    sqlPattern: overrides.sqlPattern ?? "SELECT 1",
    version: overrides.version ?? 1,
    status: overrides.status ?? "Approved",
    questionExamples: overrides.questionExamples,
    keywords: overrides.keywords,
    tags: overrides.tags,
    intent: overrides.intent,
    templateId: overrides.templateId ?? templateCounter,
    ...overrides,
  };
}

describe("template-matcher.service", () => {
  beforeEach(() => {
    templateCounter = 0;
    mockGetTemplates.mockReset();
  });

  it("combines example, keyword, and tag scores to select best template", async () => {
    const templates = [
      buildTemplate({
        name: "Temporal Trend",
        keywords: ["healing rate", "trend"],
        tags: ["temporal", "healing"],
        questionExamples: ["show healing rate trend for last 4 weeks"],
        intent: "trend",
      }),
    ];
    mockGetTemplates.mockResolvedValue({ templates });

    const result = await matchTemplate(
      "Show healing rate trend for last 4 weeks",
      "cust-1",
      ["Temporal", "HEALING"]
    );

    expect(result.matched).toBe(true);
    expect(result.template?.name).toBe("Temporal Trend");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(["healing rate", "trend"])
    );
    expect(result.matchedTags).toEqual(
      expect.arrayContaining(["temporal", "healing"])
    );
    expect(result.explanations?.[0]?.matchedTags).toEqual(
      expect.arrayContaining(["temporal", "healing"])
    );
  });

  it("fails threshold when only semantic tags match", async () => {
    const templates = [
      buildTemplate({
        name: "Semantic Only",
        keywords: ["nonexistent"],
        tags: ["compliance"],
        questionExamples: ["totally different question"],
        intent: "aggregate",
      }),
    ];
    mockGetTemplates.mockResolvedValue({ templates });

    const result = await matchTemplate(
      "Ask something unrelated",
      "cust-1",
      ["COMPLIANCE"]
    );

    expect(result.matched).toBe(false);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("returns explanations for topK templates with matched metadata", async () => {
    const templates = [
      buildTemplate({
        name: "Keyword Heavy",
        keywords: ["count", "patients", "workflow status"],
        questionExamples: ["count patients by workflow status"],
        tags: ["workflow"],
        intent: "aggregate",
      }),
      buildTemplate({
        name: "Tag Heavy",
        keywords: ["workflow status"],
        tags: ["workflow", "status"],
        questionExamples: ["workflow status detail"],
        intent: "workflow_status_monitoring",
      }),
    ];
    mockGetTemplates.mockResolvedValue({ templates });

    const result = await matchTemplate(
      "Count patients by workflow status",
      "cust-1",
      ["workflow", "status"],
      { topK: 2 }
    );

    expect(result.explanations).toHaveLength(2);
    expect(result.explanations?.[0]?.matchedKeywords).toContain("count");
    expect(result.explanations?.[1]?.matchedTags).toEqual(
      expect.arrayContaining(["workflow", "status"])
    );
  });
});
