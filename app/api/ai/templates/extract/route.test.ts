import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/config/template-flags", () => ({
  isTemplateSystemEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/services/template-extraction.service", () => ({
  extractTemplateDraft: vi.fn(),
}));

import { POST } from "./route";
import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import { extractTemplateDraft } from "@/lib/services/template-extraction.service";
import { TemplateServiceError } from "@/lib/services/template.service";

const isTemplateSystemEnabledMock =
  isTemplateSystemEnabled as unknown as vi.Mock;
const extractTemplateDraftMock =
  extractTemplateDraft as unknown as vi.Mock;

describe("POST /api/ai/templates/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTemplateSystemEnabledMock.mockReturnValue(true);
  });

  it("returns 404 when feature flag is disabled", async () => {
    isTemplateSystemEnabledMock.mockReturnValue(false);

    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: JSON.stringify({ questionText: "q", sqlQuery: "SELECT 1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("Request body must be valid JSON");
  });

  it("returns 400 when questionText missing", async () => {
    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: JSON.stringify({ sqlQuery: "SELECT 1" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("questionText");
  });

  it("returns 400 when sqlQuery missing", async () => {
    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: JSON.stringify({ questionText: "q" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("sqlQuery");
  });

  it("returns 200 with draft payload on success", async () => {
    extractTemplateDraftMock.mockResolvedValue({
      draft: {
        name: "Template",
        intent: "aggregation",
        description: "desc",
        sqlPattern: "SELECT 1",
        placeholdersSpec: null,
        keywords: ["one"],
        tags: [],
        examples: ["Example question"],
      },
      validation: { valid: true, errors: [], warnings: [] },
      warnings: ["review"],
      modelId: "claude-3-5-sonnet-latest",
    });

    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: JSON.stringify({
        questionText: "How many?",
        sqlQuery: "SELECT 1",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      name: "Template",
      intent: "aggregation",
      description: "desc",
      sqlPattern: "SELECT 1",
      placeholdersSpec: null,
      keywords: ["one"],
      tags: [],
      examples: ["Example question"],
    });
    expect(body.validation).toEqual({ valid: true, errors: [], warnings: [] });
    expect(body.warnings).toEqual(["review"]);
    expect(body.modelId).toBe("claude-3-5-sonnet-latest");
    expect(extractTemplateDraftMock).toHaveBeenCalledWith({
      questionText: "How many?",
      sqlQuery: "SELECT 1",
      schemaContext: undefined,
      modelId: undefined,
    });
  });

  it("maps TemplateServiceError to response", async () => {
    extractTemplateDraftMock.mockRejectedValue(
      new TemplateServiceError("bad payload", 400, { field: "sql" })
    );

    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: JSON.stringify({ questionText: "q", sqlQuery: "SELECT 1" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("bad payload");
    expect(body.details).toEqual({ field: "sql" });
  });

  it("returns 500 on unexpected errors", async () => {
    extractTemplateDraftMock.mockRejectedValue(new Error("kaboom"));

    const req = new NextRequest("http://localhost/api/ai/templates/extract", {
      method: "POST",
      body: JSON.stringify({ questionText: "q", sqlQuery: "SELECT 1" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Internal Server Error");
  });
});
