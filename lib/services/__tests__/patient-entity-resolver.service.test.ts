import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  withCustomerPool: vi.fn(async (_customerId: string, fn: any) =>
    fn({
      request() {
        const inputs: Record<string, string> = {};
        return {
          input(name: string, value: string) {
            inputs[name] = value;
            return this;
          },
          query(sql: string) {
            return mockQuery(sql, inputs);
          },
        };
      },
    })
  ),
}));

import {
  PatientEntityResolver,
  isLikelyPatientNameCandidate,
} from "@/lib/services/patient-entity-resolver.service";

describe("PatientEntityResolver", () => {
  const resolver = new PatientEntityResolver();

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("auto-resolves an exact patient ID", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientId: "123e4567-e89b-12d3-a456-426614174000",
          domainId: "P-100",
          patientName: "Fred Smith",
          unitName: "Ward A",
        },
      ],
    });

    const result = await resolver.resolve(
      "show wound area over time for patient 123e4567-e89b-12d3-a456-426614174000",
      "customer-1"
    );

    expect(result.status).toBe("resolved");
    expect(result.matchType).toBe("patient_id");
    expect(result.resolvedId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("auto-resolves an exact domain ID", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientId: "patient-1",
          domainId: "ABC123",
          patientName: "Fred Smith",
          unitName: "Ward A",
        },
      ],
    });

    const result = await resolver.resolve(
      "show wound area over time for patient id ABC123",
      "customer-1"
    );

    expect(result.status).toBe("resolved");
    expect(result.matchType).toBe("domain_id");
    expect(result.resolvedId).toBe("patient-1");
  });

  it("requires confirmation for a unique exact full-name match", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientId: "patient-1",
          domainId: "ABC123",
          patientName: "Fred Smith",
          unitName: "Ward A",
        },
      ],
    });

    const result = await resolver.resolve(
      "show wound area over time for patient Fred Smith",
      "customer-1"
    );

    expect(result.status).toBe("confirmation_required");
    expect(result.matchType).toBe("full_name");
    expect(result.selectedMatch?.patientName).toBe("Fred Smith");
    expect(mockQuery.mock.calls[0]?.[0]).toContain("sp_set_session_context");
  });

  it("requires disambiguation for duplicate exact full-name matches", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientId: "patient-1",
          domainId: "ABC123",
          patientName: "Fred Smith",
          unitName: "Ward A",
        },
        {
          patientId: "patient-2",
          domainId: "ABC124",
          patientName: "Fred Smith",
          unitName: "Ward B",
        },
      ],
    });

    const result = await resolver.resolve(
      "show wound area over time for patient Fred Smith",
      "customer-1"
    );

    expect(result.status).toBe("disambiguation_required");
    expect(result.matches).toHaveLength(2);
  });

  it("returns not_found for an unmatched patient full name", async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    const result = await resolver.resolve(
      "show wound area over time for patient Fred Smith",
      "customer-1"
    );

    expect(result.status).toBe("not_found");
    expect(result.matchType).toBe("full_name");
  });

  it("does not misread a two-word patient name as a domain ID", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientId: "patient-1",
          domainId: "ABC123",
          patientName: "Fred Smith",
          unitName: "Ward A",
        },
      ],
    });

    await resolver.resolve(
      "show wound area over time for patient Fred Smith",
      "customer-1"
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual({ fullName: "fred smith" });
  });

  it("extracts lowercase full names after 'for'", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          patientId: "patient-1",
          domainId: "ABC123",
          patientName: "Melody Crist",
          unitName: "Ward A",
        },
      ],
    });

    const result = await resolver.resolve(
      "show me the wound area chart for melody crist",
      "customer-1"
    );

    expect(result.status).toBe("confirmation_required");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual({ fullName: "melody crist" });
  });

  it("rejects generic analytics phrases as patient-name candidates", async () => {
    expect(isLikelyPatientNameCandidate("age chart")).toBe(false);
    expect(isLikelyPatientNameCandidate("diabetic wounds")).toBe(false);
    expect(isLikelyPatientNameCandidate("Fred Smith")).toBe(true);
  });

  it("does not resolve generic analytics phrasing as a patient", async () => {
    const result = await resolver.resolve(
      "show me a patient age chart",
      "customer-1"
    );

    expect(result.status).toBe("no_candidate");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
