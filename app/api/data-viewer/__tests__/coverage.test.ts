/**
 * Unit tests for data-viewer coverage API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "../coverage/route";
import { NextRequest } from "next/server";

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Mock SQL Server client
vi.mock("@/lib/services/sqlserver/client", () => ({
  getSqlServerPool: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

describe("Data Viewer Coverage API", () => {
  let mockRequest: any;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      request: vi.fn().mockReturnValue({
        query: vi.fn(),
      }),
    };

    (getServerSession as any).mockResolvedValue({ user: { id: "test-user" } });
    (getSqlServerPool as any).mockResolvedValue(mockPool);

    process.env.SILHOUETTE_DB_URL = "mock-connection-string";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return correct coverage stats for valid request", async () => {
    const url = new URL(
      "http://localhost/api/data-viewer/coverage?table=rpt.Patient&columns=gender,dateOfBirth"
    );
    mockRequest = new NextRequest(url);

    mockPool
      .request()
      .query.mockResolvedValueOnce({
        recordset: [{ total: 100, nonNull: 50 }],
      })
      .mockResolvedValueOnce({
        recordset: [{ total: 100, nonNull: 85 }],
      });

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("gender");
    expect(data.gender).toMatchObject({
      total: 100,
      nonNull: 50,
      coveragePct: 50,
    });
    expect(data.dateOfBirth).toMatchObject({
      total: 100,
      nonNull: 85,
      coveragePct: 85,
    });
  });

  it("should reject table names not in allowlist", async () => {
    const url = new URL(
      "http://localhost/api/data-viewer/coverage?table=sys.tables&columns=name"
    );
    mockRequest = new NextRequest(url);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Table must start with");
  });

  it("should return 400 when table param is missing", async () => {
    const url = new URL(
      "http://localhost/api/data-viewer/coverage?columns=gender"
    );
    mockRequest = new NextRequest(url);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("table query parameter is required");
  });

  it("should return 400 when columns param is missing", async () => {
    const url = new URL(
      "http://localhost/api/data-viewer/coverage?table=rpt.Patient"
    );
    mockRequest = new NextRequest(url);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("columns query parameter is required");
  });

  it("should return 401 when not authenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const url = new URL(
      "http://localhost/api/data-viewer/coverage?table=rpt.Patient&columns=gender"
    );
    mockRequest = new NextRequest(url);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});
