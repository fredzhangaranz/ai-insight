import { describe, it, expect, vi, beforeEach } from "vitest";
import { browse, browsePatients } from "../browse.service";

const mockRequest = () => ({
  input: vi.fn().mockReturnThis(),
  query: vi.fn().mockResolvedValue({
    recordset: [
      { total: 100 },
      { total: 50 },
    ],
  }),
});

const mockPool = {
  request: vi.fn(),
};

describe("browse.service", () => {
  let executedQueries: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    executedQueries = [];
    mockPool.request.mockImplementation(() => {
      const req = mockRequest();
      req.query.mockImplementation((q: string) => {
        executedQueries.push(q);
        if (q.includes("INFORMATION_SCHEMA")) {
          return Promise.resolve({
            recordset: [
              { columnName: "id" },
              { columnName: "firstName" },
              { columnName: "lastName" },
              { columnName: "gender" },
              { columnName: "dateOfBirth" },
              { columnName: "accessCode" },
            ],
          });
        }
        if (q.includes("WITH wound_assessment_counts")) {
          return Promise.resolve({
            recordset: [
              {
                patientFk: "p1",
                woundCount: 2,
                assessmentCount: 5,
                woundsWithoutAssessments: 1,
              },
            ],
          });
        }
        if (q.includes("patient_browse_flags")) {
          return Promise.resolve({
            recordset: [
              {
                total: 100,
                generated: 10,
                missingGender: 30,
                noWounds: 4,
                noAssessments: 7,
                woundsMissingAssessments: 3,
              },
            ],
          });
        }
        if (q.includes("COUNT(*)")) {
          return Promise.resolve({ recordset: [{ total: 42 }] });
        }
        return Promise.resolve({
          recordset: [
            {
              id: "p1",
              firstName: "John",
              lastName: "Doe",
              gender: "Male",
              dateOfBirth: new Date("1960-01-01"),
              accessCode: "IG001",
            },
          ],
        });
      });
      return req;
    });
  });

  it("browsePatients returns paginated rows", async () => {
    const result = await browsePatients(mockPool as any, {
      page: 1,
      pageSize: 20,
      filter: "all",
    });
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
    expect(result.total).toBe(42);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.rows[0]).toMatchObject({
      woundCount: 2,
      assessmentCount: 5,
      woundsWithoutAssessments: 1,
    });
  });

  it("browsePatients applies no_assessments patient filter", async () => {
    await browsePatients(mockPool as any, {
      page: 1,
      pageSize: 20,
      filter: "no_assessments",
    });
    expect(executedQueries.join("\n")).toContain(
      "WHERE s.patientFk = dbo.Patient.id"
    );
  });

  it("browse dispatches to browsePatients for patient entity", async () => {
    const result = await browse(mockPool as any, "patient", {
      page: 1,
      pageSize: 10,
    });
    expect(result).toBeDefined();
    expect(result.page).toBe(1);
  });

  it("browse throws for unknown entity", async () => {
    await expect(
      browse(mockPool as any, "unknown" as any, {})
    ).rejects.toThrow("Unknown entity");
  });
});
