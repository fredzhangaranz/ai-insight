import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/services/customer-service", () => ({
  getConnectionStringForCustomer: vi.fn().mockResolvedValue("Server=.;Database=test;"),
}));
vi.mock("@/lib/services/sqlserver/client", () => ({ getSqlServerPool: vi.fn() }));

import { getServerSession } from "next-auth";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";

describe("Browse API", () => {
  const mockPool = {
    request: vi.fn().mockReturnValue({
      input: vi.fn().mockReturnThis(),
      query: vi.fn()
        .mockResolvedValueOnce({
          recordset: [
            { columnName: "id" },
            { columnName: "firstName" },
            { columnName: "lastName" },
            { columnName: "gender" },
            { columnName: "dateOfBirth" },
            { columnName: "accessCode" },
          ],
        })
        .mockResolvedValueOnce({ recordset: [{ total: 50 }] })
        .mockResolvedValueOnce({
          recordset: [
            { id: "p1", firstName: "John", lastName: "Doe", gender: "Male", dateOfBirth: new Date(), accessCode: "IG001" },
          ],
        })
        .mockResolvedValueOnce({ recordset: [{ total: 100, generated: 10, missingGender: 20 }] }),
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: {} });
    (getSqlServerPool as any).mockResolvedValue(mockPool);
    (getConnectionStringForCustomer as any).mockResolvedValue("Server=.;Database=test;");
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
  });

  it("returns 500 when customer connection fails", async () => {
    (getConnectionStringForCustomer as any).mockRejectedValue(new Error("Customer not found"));
    const req = new NextRequest("http://localhost/api/admin/data-gen/browse?customerId=bad&entity=patient");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
