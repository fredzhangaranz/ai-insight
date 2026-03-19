import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST, DELETE } from "../route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/services/customer-service", () => ({
  getConnectionStringForCustomer: vi.fn().mockResolvedValue("Server=.;Database=test;"),
}));
vi.mock("@/lib/services/sqlserver/client", () => ({ getSqlServerPool: vi.fn() }));
vi.mock("@/lib/services/data-gen/lookups.service", () => ({
  listAllLookupFields: vi.fn().mockResolvedValue([{ attributeTypeId: "a1", fieldName: "Etiology", options: [] }]),
  addLookupOption: vi.fn().mockResolvedValue({ id: "new-id" }),
  deleteLookupOption: vi.fn().mockResolvedValue(undefined),
}));

import { getServerSession } from "next-auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";

describe("Lookups API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: {} });
    (getConnectionStringForCustomer as any).mockResolvedValue("Server=.;Database=test;");
  });

  it("GET returns 401 when unauthenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/admin/data-gen/lookups?customerId=c1");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET returns 400 when customerId is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/lookups");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("GET returns 200 with fields when authenticated", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/lookups?customerId=c1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("fields");
  });

  it("POST returns 400 when attributeTypeId is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/lookups", {
      method: "POST",
      body: JSON.stringify({ text: "New Option", customerId: "c1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("DELETE returns 400 when id is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/lookups?customerId=c1");
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
