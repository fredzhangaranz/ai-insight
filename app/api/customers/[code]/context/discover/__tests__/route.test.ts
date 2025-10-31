import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const getCustomerMock = vi.fn();
const discoverContextMock = vi.fn();
const getContextDiscoveryServiceMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/customer-service", () => ({
  getCustomer: getCustomerMock,
}));

vi.mock("@/lib/services/context-discovery/context-discovery.service", () => ({
  getContextDiscoveryService: getContextDiscoveryServiceMock,
}));

async function importRoute() {
  return await import("../route");
}

function createRequest(body?: unknown) {
  return new NextRequest(
    "http://localhost/api/customers/STMARYS/context/discover",
    {
      method: "POST",
      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }
        : {}),
    }
  );
}

describe("POST /api/customers/[code]/context/discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContextDiscoveryServiceMock.mockReturnValue({
      discoverContext: discoverContextMock,
    });
  });

  it("returns auth response when unauthenticated", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { POST } = await importRoute();
    const req = createRequest({ question: "test" });
    const res = await POST(req, { params: { code: "STMARYS" } });

    expect(res).toBe(unauthorized);
    expect(getCustomerMock).not.toHaveBeenCalled();
    expect(discoverContextMock).not.toHaveBeenCalled();
  });

  it("rejects users without consultant privileges", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "1", role: "viewer" },
    });

    const { POST } = await importRoute();
    const req = createRequest({ question: "test" });
    const res = await POST(req, { params: { code: "STMARYS" } });

    expect(res.status).toBe(403);
    expect(getCustomerMock).not.toHaveBeenCalled();
    expect(discoverContextMock).not.toHaveBeenCalled();
  });

  it("validates request payload", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "7", role: "consultant" },
    });

    const { POST } = await importRoute();
    const req = createRequest({});
    const res = await POST(req, { params: { code: "STMARYS" } });

    expect(res.status).toBe(400);
    expect(getCustomerMock).not.toHaveBeenCalled();
    expect(discoverContextMock).not.toHaveBeenCalled();
  });

  it("returns 404 when customer is missing", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "9", role: "consultant" },
    });
    getCustomerMock.mockResolvedValueOnce(null);

    const { POST } = await importRoute();
    const req = createRequest({ question: "test question" });
    const res = await POST(req, { params: { code: "UNKNOWN" } });

    expect(res.status).toBe(404);
    expect(discoverContextMock).not.toHaveBeenCalled();
  });

  it("returns context bundle when discovery succeeds", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "12", role: "consultant" },
    });
    getCustomerMock.mockResolvedValueOnce({
      id: "cust-1",
      code: "STMARYS",
    });

    const mockBundle = {
      customerId: "cust-1",
      question: "What is the average healing rate?",
      intent: { type: "outcome_analysis", confidence: 0.92 },
      forms: [],
      terminology: [],
      joinPaths: [],
      overallConfidence: 0.8,
      metadata: {
        discoveryRunId: "run-123",
        timestamp: "2025-01-01T00:00:00Z",
        durationMs: 1200,
        version: "1.0",
      },
    };

    discoverContextMock.mockResolvedValueOnce(mockBundle);

    const { POST } = await importRoute();
    const req = createRequest({
      question: "  What is the average healing rate? ",
      timeRange: { unit: "months", value: 6 },
    });
    const res = await POST(req, { params: { code: "STMARYS" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(discoverContextMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      question: "What is the average healing rate?",
      modelId: undefined,
      timeRange: { unit: "months", value: 6 },
    });
    expect(body).toEqual(mockBundle);
  });
});
