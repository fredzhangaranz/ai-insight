import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/services/customer-service", () => ({
  getConnectionStringForCustomer: vi.fn().mockResolvedValue("Server=.;Database=test;"),
}));
vi.mock("@/lib/services/sqlserver/client", () => ({ getSqlServerPool: vi.fn() }));
vi.mock("@/lib/services/data-gen/browse.service", () => ({ browse: vi.fn() }));

import { getServerSession } from "next-auth";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { browse } from "@/lib/services/data-gen/browse.service";

describe("Browse API", () => {
  const mockPool = {};

  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: {} });
    (getSqlServerPool as any).mockResolvedValue(mockPool);
    (getConnectionStringForCustomer as any).mockResolvedValue("Server=.;Database=test;");
    (browse as any).mockResolvedValue({
      rows: [{ id: "p1", name: "John Doe", woundCount: 2, assessmentCount: 5 }],
      total: 1,
      page: 1,
      pageSize: 20,
      stats: {
        total: 1,
        generated: 1,
        noWounds: 0,
        noAssessments: 0,
        woundsMissingAssessments: 0,
      },
      columns: [{ key: "id", label: "ID" }],
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?customerId=c1&entity=patient");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when customerId is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?entity=patient");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when entity is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?customerId=c1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when entity is invalid", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?customerId=c1&entity=invalid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with rows for valid patient request", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?customerId=c1&entity=patient&page=1&pageSize=20");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("rows");
    expect(data).toHaveProperty("total");
    expect(data.page).toBe(1);
    expect(browse).toHaveBeenCalledWith(
      mockPool,
      "patient",
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        filter: "all",
      })
    );
  });

  it("accepts no_assessments filter", async () => {
    const req = new NextRequest(
      "http://localhost/api/admin/data-gen/browse?customerId=c1&entity=patient&filter=no_assessments"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(browse).toHaveBeenCalledWith(
      mockPool,
      "patient",
      expect.objectContaining({
        filter: "no_assessments",
      })
    );
  });

  it("returns 400 when filter is invalid", async () => {
    const req = new NextRequest(
      "http://localhost/api/admin/data-gen/browse?customerId=c1&entity=patient&filter=bad_filter"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 when customer connection fails", async () => {
    (getConnectionStringForCustomer as any).mockRejectedValue(new Error("Customer not found"));
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?customerId=bad&entity=patient");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
