import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/services/customer-service", () => ({
  getConnectionStringForCustomer: vi.fn().mockResolvedValue("Server=.;Database=test;"),
}));
vi.mock("@/lib/services/sqlserver/client", () => ({ getSqlServerPool: vi.fn() }));
vi.mock("@/lib/services/data-gen/schema-discovery.service", () => ({
  getPatientSchema: vi.fn().mockResolvedValue([
    { fieldName: "gender", columnName: "gender", dataType: "nvarchar", options: ["Male", "Female"] },
  ]),
  getFormFields: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/services/data-gen/spec-interpreter.service", () => ({
  interpretToSpec: vi.fn().mockResolvedValue({
    spec: { entity: "patient", count: 20, fields: [] },
    warnings: [],
  }),
}));

import { getServerSession } from "next-auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";

describe("Interpret API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: {} });
    (getConnectionStringForCustomer as any).mockResolvedValue("Server=.;Database=test;");
  });

  it("returns 401 when unauthenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/admin/data-gen/interpret", {
      method: "POST",
      body: JSON.stringify({ description: "test", entity: "patient", mode: "insert", customerId: "c1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when entity is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/interpret", {
      method: "POST",
      body: JSON.stringify({ description: "test", mode: "insert", customerId: "c1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with spec and warnings for valid request", async () => {
    const req = new NextRequest("http://localhost/api/admin/data-gen/interpret", {
      method: "POST",
      body: JSON.stringify({
        description: "20 patients, half male half female",
        entity: "patient",
        mode: "insert",
        customerId: "c1",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("spec");
    expect(data).toHaveProperty("warnings");
  });
});
