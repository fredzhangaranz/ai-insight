import { describe, expect, it, vi } from "vitest";
import type { ConnectionPool } from "mssql";
import {
  clonePatientDataToRpt,
  isRetryableCloneError,
  summarizeRptCloneVerification,
  verifyRptCloneSync,
} from "../execution-helpers";

vi.mock("mssql");

describe("execution-helpers", () => {
  it("detects snapshot isolation conflicts as retryable clone errors", () => {
    expect(
      isRetryableCloneError({
        number: 3960,
        message:
          "Snapshot isolation transaction aborted due to update conflict on rpt.Unit",
      })
    ).toBe(true);
    expect(isRetryableCloneError(new Error("plain failure"))).toBe(false);
  });

  it("retries clone on snapshot conflicts and returns the successful attempt count", async () => {
    const snapshotConflict = Object.assign(
      new Error(
        "Snapshot isolation transaction aborted due to update conflict. Retry the transaction."
      ),
      { number: 3960 }
    );

    const mockRequest = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(snapshotConflict)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ recordset: [{ cloned_count: 25 }] }),
    };

    const mockDb = {
      request: vi.fn().mockReturnValue(mockRequest),
    } as unknown as ConnectionPool;

    const result = await clonePatientDataToRpt(mockDb, {
      maxAttempts: 3,
      retryDelayMs: 0,
    });

    expect(result).toEqual({
      cloned: 25,
      attempts: 2,
    });
    expect(mockDb.request).toHaveBeenCalledTimes(4);
  });

  it("verifies inserted rows are present in rpt tables", async () => {
    const patientRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({
        recordset: [{ id: "11111111-1111-1111-1111-111111111111" }],
      }),
    };
    const woundRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({
        recordset: [
          { id: "22222222-2222-2222-2222-222222222222" },
          { id: "33333333-3333-3333-3333-333333333333" },
        ],
      }),
    };
    const assessmentRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({
        recordset: [{ id: "44444444-4444-4444-4444-444444444444" }],
      }),
    };

    const mockDb = {
      request: vi
        .fn()
        .mockReturnValueOnce(patientRequest)
        .mockReturnValueOnce(woundRequest)
        .mockReturnValueOnce(assessmentRequest),
    } as unknown as ConnectionPool;

    const verification = await verifyRptCloneSync(mockDb, {
      patientIds: ["11111111-1111-1111-1111-111111111111"],
      woundIds: [
        "22222222-2222-2222-2222-222222222222",
        "33333333-3333-3333-3333-333333333333",
      ],
      assessmentIds: [
        "44444444-4444-4444-4444-444444444444",
        "55555555-5555-5555-5555-555555555555",
      ],
    });

    expect(verification.isSynced).toBe(false);
    expect(verification.checked).toEqual({
      patients: 1,
      wounds: 2,
      assessments: 2,
    });
    expect(verification.missing).toEqual({
      patientIds: [],
      woundIds: [],
      assessmentIds: ["55555555-5555-5555-5555-555555555555"],
    });
    expect(summarizeRptCloneVerification(verification)).toBe(
      "assessments missing: 1"
    );
  });
});
