import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const deprecateTemplateMock = vi.fn();
const isTemplateSystemEnabledMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/config/template-flags", () => ({
  isTemplateSystemEnabled: isTemplateSystemEnabledMock,
}));

vi.mock("@/lib/services/template.service", () => ({
  deprecateTemplate: deprecateTemplateMock,
  TemplateServiceError: class extends Error {},
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/ai/templates/[id]/deprecate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTemplateSystemEnabledMock.mockReturnValue(true);
  });

  it("returns auth response when POST unauthorized", async () => {
    const unauthorized = NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
    requireAdminMock.mockResolvedValueOnce(unauthorized);

    const { POST } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/ai/templates/1/deprecate",
      { method: "POST" }
    );
    const res = await POST(req, { params: { id: "1" } });

    expect(res).toBe(unauthorized);
    expect(deprecateTemplateMock).not.toHaveBeenCalled();
  });

  it("deprecates template when admin authenticated", async () => {
    requireAdminMock.mockResolvedValueOnce({
      user: { id: "2", role: "admin" },
    });
    deprecateTemplateMock.mockResolvedValueOnce({ id: 1, status: "deprecated" });

    const { POST } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/ai/templates/1/deprecate",
      { method: "POST" }
    );
    const res = await POST(req, { params: { id: "1" } });

    expect(deprecateTemplateMock).toHaveBeenCalledWith(1);
    expect(res.status).toBe(200);
  });
});
