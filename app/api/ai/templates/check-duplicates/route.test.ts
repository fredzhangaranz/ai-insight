import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/config/template-flags", () => ({
  isTemplateSystemEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/services/template-similarity.service", () => ({
  checkSimilarTemplates: vi.fn(),
}));

import { POST } from "./route";
import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import { checkSimilarTemplates } from "@/lib/services/template-similarity.service";

const isTemplateSystemEnabledMock =
  isTemplateSystemEnabled as unknown as Mock;
const checkSimilarTemplatesMock = checkSimilarTemplates as unknown as Mock;

describe("POST /api/ai/templates/check-duplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTemplateSystemEnabledMock.mockReturnValue(true);
  });

  it("returns 404 when feature flag is disabled", async () => {
    isTemplateSystemEnabledMock.mockReturnValue(false);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Test Template",
          intent: "aggregation_by_category",
        }),
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("Not Found");
    expect(checkSimilarTemplatesMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: "not-json",
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("Request body must be valid JSON");
  });

  it("returns 400 when name is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({ intent: "aggregation_by_category" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("name");
  });

  it("returns 400 when name is empty string", async () => {
    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "   ",
          intent: "aggregation_by_category",
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("name");
  });

  it("returns 400 when intent is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({ name: "Test Template" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("intent");
  });

  it("returns 400 when intent is empty string", async () => {
    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({ name: "Test Template", intent: "" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("intent");
  });

  it("returns 200 with empty array when no similar templates found", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Unique Template",
          intent: "aggregation_by_category",
          description: "A unique template",
          keywords: ["unique", "test"],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.similar).toEqual([]);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Unique Template",
      intent: "aggregation_by_category",
      description: "A unique template",
      keywords: ["unique", "test"],
      tags: undefined,
    });
  });

  it("returns 200 with similar templates when duplicates found", async () => {
    const mockWarnings = [
      {
        templateId: 1,
        name: "Existing Template",
        intent: "aggregation_by_category",
        similarity: 0.85,
        successRate: 0.75,
        usageCount: 10,
        message:
          "Template 'Existing Template' is 85% similar (75% success rate) with 10 uses. Consider reviewing before creating a duplicate.",
      },
      {
        templateId: 2,
        name: "Another Template",
        intent: "aggregation_by_category",
        similarity: 0.72,
        successRate: 0.6,
        usageCount: 5,
        message:
          "Template 'Another Template' is 72% similar (60% success rate) with 5 uses. Consider reviewing before creating a duplicate.",
      },
    ];

    checkSimilarTemplatesMock.mockResolvedValue(mockWarnings);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Similar Template",
          intent: "aggregation_by_category",
          description: "A similar template",
          keywords: ["similar", "test"],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.similar).toEqual(mockWarnings);
    expect(body.similar).toHaveLength(2);
  });

  it("handles optional fields correctly", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Minimal Template",
          intent: "aggregation_by_category",
          // No description, keywords, or tags
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Minimal Template",
      intent: "aggregation_by_category",
      description: undefined,
      keywords: undefined,
      tags: undefined,
    });
  });

  it("processes tags field when provided", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Tagged Template",
          intent: "aggregation_by_category",
          tags: ["wound", "patient", "analysis"],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Tagged Template",
      intent: "aggregation_by_category",
      description: undefined,
      keywords: undefined,
      tags: ["wound", "patient", "analysis"],
    });
  });

  it("trims whitespace from string fields", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "   Trimmed Name   ",
          intent: "  aggregation_by_category  ",
          description: "  Trimmed description  ",
          keywords: ["  word1  ", "  word2  "],
          tags: ["  tag1  ", "  tag2  "],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Trimmed Name",
      intent: "aggregation_by_category",
      description: "Trimmed description",
      keywords: ["word1", "word2"],
      tags: ["tag1", "tag2"],
    });
  });

  it("filters out empty strings from arrays", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          intent: "aggregation_by_category",
          keywords: ["valid", "", "   ", "also-valid"],
          tags: ["", "tag1", "   "],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Test",
      intent: "aggregation_by_category",
      description: undefined,
      keywords: ["valid", "also-valid"],
      tags: ["tag1"],
    });
  });

  it("treats empty arrays as undefined", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          intent: "aggregation_by_category",
          keywords: [],
          tags: [],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Test",
      intent: "aggregation_by_category",
      description: undefined,
      keywords: undefined,
      tags: undefined,
    });
  });

  it("ignores non-string items in arrays", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          intent: "aggregation_by_category",
          keywords: ["valid", 123, null, "also-valid", { obj: true }],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Test",
      intent: "aggregation_by_category",
      description: undefined,
      keywords: ["valid", "also-valid"],
      tags: undefined,
    });
  });

  it("returns 500 on unexpected service errors", async () => {
    checkSimilarTemplatesMock.mockRejectedValue(new Error("Database error"));

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Test Template",
          intent: "aggregation_by_category",
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Internal Server Error");
  });

  it("handles complete request with all fields", async () => {
    checkSimilarTemplatesMock.mockResolvedValue([
      {
        templateId: 42,
        name: "Full Template",
        intent: "aggregation_by_category",
        similarity: 0.9,
        successRate: 0.8,
        usageCount: 15,
        message: "Template 'Full Template' is 90% similar.",
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/ai/templates/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Complete Template Request",
          intent: "aggregation_by_category",
          description: "Full description with all fields",
          keywords: ["patient", "wound", "count", "etiology"],
          tags: ["analysis", "dashboard", "core"],
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.similar).toHaveLength(1);
    expect(body.similar[0].templateId).toBe(42);
    expect(body.similar[0].similarity).toBe(0.9);
    expect(checkSimilarTemplatesMock).toHaveBeenCalledWith({
      name: "Complete Template Request",
      intent: "aggregation_by_category",
      description: "Full description with all fields",
      keywords: ["patient", "wound", "count", "etiology"],
      tags: ["analysis", "dashboard", "core"],
    });
  });
});
