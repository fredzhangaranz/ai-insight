import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionPool } from "mssql";
import { generatePatients } from "../patient.generator";
import type { GenerationSpec } from "../../generation-spec.types";
import { DependencyMissingError } from "../../generation-spec.types";

const { reserveNextPatientSequenceRange } = vi.hoisted(() => ({
  reserveNextPatientSequenceRange: vi.fn(),
}));

vi.mock("../../patient-id.service", async () => {
  const actual = await vi.importActual<typeof import("../../patient-id.service")>(
    "../../patient-id.service",
  );
  return {
    ...actual,
    reserveNextPatientSequenceRange,
  };
});

describe("Patient Generator", () => {
  let mockDb: ConnectionPool;
  let mockRequest: {
    input: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    bulk: ReturnType<typeof vi.fn>;
  };
  let mockTransaction: {
    request: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    rollback: ReturnType<typeof vi.fn>;
  };
  let expectedCount: number;
  let currentUnits: Array<{ id: string; name: string }>;
  let startSequenceNumber: number;

  const baseSpec: GenerationSpec = {
    entity: "patient",
    count: 3,
    fields: [
      {
        fieldName: "First Name",
        columnName: "firstName",
        dataType: "nvarchar",
        enabled: true,
        criteria: { type: "fixed", value: "John" },
        storageType: "direct_patient",
      },
      {
        fieldName: "Gender",
        columnName: "gender",
        dataType: "nvarchar",
        enabled: true,
        criteria: {
          type: "distribution",
          weights: { Male: 0.5, Female: 0.5 },
        },
        storageType: "direct_patient",
      },
    ],
  };

  beforeEach(() => {
    expectedCount = baseSpec.count;
    currentUnits = [
      { id: "unit-1", name: "Ward A" },
      { id: "unit-2", name: "Ward B" },
    ];
    startSequenceNumber = 126;

    mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockImplementation((query: string) => {
        if (query.includes("SELECT id, name FROM dbo.Unit")) {
          return Promise.resolve({ recordset: currentUnits });
        }
        if (query.includes("SELECT COUNT(*) as count") && query.includes("FROM dbo.Patient")) {
          return Promise.resolve({ recordset: [{ count: expectedCount }] });
        }
        if (query.includes("AND accessCode LIKE 'IG%'")) {
          return Promise.resolve({ recordset: [{ count: expectedCount }] });
        }
        if (query.includes("SELECT domainId")) {
          return Promise.resolve({
            recordset: Array.from({ length: expectedCount }, (_, idx) => ({
              domainId: `IG-${String(startSequenceNumber + idx).padStart(5, "0")}`,
            })),
          });
        }
        if (query.includes("INNER JOIN dbo.Unit u")) {
          return Promise.resolve({ recordset: [{ count: expectedCount }] });
        }
        return Promise.resolve({ recordset: [], rowsAffected: [expectedCount] });
      }),
      bulk: vi.fn().mockResolvedValue({ rowsAffected: [0] }),
    };

    mockTransaction = {
      request: vi.fn().mockReturnValue(mockRequest),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      request: vi.fn().mockReturnValue(mockRequest),
    } as unknown as ConnectionPool;

    reserveNextPatientSequenceRange.mockResolvedValue({
      transaction: mockTransaction,
      startSequenceNumber,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates patients with sequential domain IDs and short access codes", async () => {
    const result = await generatePatients(baseSpec, mockDb);

    expect(result.success).toBe(true);
    expect(result.insertedCount).toBe(3);
    expect(result.insertedIds).toHaveLength(3);
    expect(mockTransaction.commit).toHaveBeenCalled();

    const boundValues = mockRequest.input.mock.calls.map((call) => call[1]);
    expect(boundValues).toContain("IG-00126");
    expect(boundValues).toContain("IG-00127");
    expect(boundValues).toContain("IG-00128");
    expect(boundValues).toContain("IG003I");

    const domainIdCheck = result.verification.find((check) =>
      check.check.includes("Patient IDs unique and sequential"),
    );
    expect(domainIdCheck?.status).toBe("PASS");
  });

  it("throws when no units exist", async () => {
    currentUnits = [];

    await expect(generatePatients(baseSpec, mockDb)).rejects.toThrow(
      DependencyMissingError,
    );
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  it("uses the reserved sequence start for later runs", async () => {
    startSequenceNumber = 1005;
    reserveNextPatientSequenceRange.mockResolvedValue({
      transaction: mockTransaction,
      startSequenceNumber,
    });

    await generatePatients({ ...baseSpec, count: 2 }, mockDb);

    const boundValues = mockRequest.input.mock.calls.map((call) => call[1]);
    expect(boundValues).toContain("IG-01005");
    expect(boundValues).toContain("IG-01006");
  });
});
