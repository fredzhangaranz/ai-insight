import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const requireAdminMock = vi.fn();
const configLoaderGetConfigurationMock = vi.fn();
const healthMonitorStartMock = vi.fn();
const saveConfigurationMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/config/ai-config-loader", () => ({
  AIConfigLoader: {
    getInstance: () => ({
      getConfiguration: configLoaderGetConfigurationMock,
    }),
  },
}));

vi.mock("@/lib/services/health-monitor.service", () => ({
  healthMonitorService: {
    start: healthMonitorStartMock,
  },
}));

vi.mock("@/lib/services/ai-config.service", () => ({
  aiConfigService: {
    saveConfiguration: saveConfigurationMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/admin/ai-config", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalNodeEnv;
  });

  it("returns auth response when GET unauthorized", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/ai-config");
    const res = await GET(req);

    expect(res).toBe(unauthorized);
    expect(configLoaderGetConfigurationMock).not.toHaveBeenCalled();
  });

  it("allows authenticated users to read configuration", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "1", role: "admin" },
    });
    configLoaderGetConfigurationMock.mockResolvedValueOnce({
      providers: [{ provider: "openai" }],
      source: "database",
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/ai-config");
    const res = await GET(req);

    expect(requireAuthMock).toHaveBeenCalled();
    expect(configLoaderGetConfigurationMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(healthMonitorStartMock).toHaveBeenCalled();
    const payload = await res.json();
    expect(payload).toEqual([{ provider: "openai" }]);
  });

  it("returns auth response when POST unauthorized", async () => {
    const forbidden = NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
    requireAdminMock.mockResolvedValueOnce(forbidden);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/ai-config", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res).toBe(forbidden);
    expect(saveConfigurationMock).not.toHaveBeenCalled();
  });

  it("persists configuration when admin in production", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    requireAdminMock.mockResolvedValueOnce({
      user: { id: "1", username: "admin", role: "admin" },
    });
    saveConfigurationMock.mockResolvedValueOnce({ id: 1 });

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/ai-config", {
      method: "POST",
      body: JSON.stringify({
        providerType: "llm",
        providerName: "openai",
        configData: { apiKey: "test" },
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(requireAdminMock).toHaveBeenCalled();
    expect(saveConfigurationMock).toHaveBeenCalledWith(
      "llm",
      "openai",
      { apiKey: "test" },
      true,
      false,
      "admin"
    );
    expect(res.status).toBe(200);
  });
});
