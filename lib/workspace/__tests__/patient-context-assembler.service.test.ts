import { describe, expect, it, vi } from "vitest";
import { PatientContextAssembler } from "@/lib/workspace/patient-context-assembler.service";

describe("PatientContextAssembler", () => {
  it("returns null when no patient is resolved", async () => {
    const service = new PatientContextAssembler(vi.fn() as any);

    await expect(
      service.assemble({
        customerId: "cust-1",
        resolvedEntities: [],
        boundParameters: {},
      })
    ).resolves.toBeNull();
  });

  it("returns null when patient context is not authorized", async () => {
    const loader = vi.fn();
    const service = new PatientContextAssembler(loader as any);

    await expect(
      service.assemble({
        customerId: "cust-1",
        resolvedEntities: [
          {
            kind: "patient",
            opaqueRef: "opaque-1",
            matchType: "full_name",
          },
        ],
        boundParameters: { patientId1: "patient-123" },
        authContext: { canViewPatientContext: false },
      })
    ).resolves.toBeNull();

    expect(loader).not.toHaveBeenCalled();
  });

  it("returns null when the loader times out", async () => {
    const service = new PatientContextAssembler(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                patientRef: "opaque-1",
                summary: {
                  displayName: "Jane Doe",
                  primaryFlags: [],
                },
                activeProblems: [],
                recentAssessments: [],
                woundHighlights: [],
                alerts: [],
                provenance: [],
              }),
            50
          )
        ) as any
    );

    await expect(
      service.assemble({
        customerId: "cust-1",
        resolvedEntities: [
          {
            kind: "patient",
            opaqueRef: "opaque-1",
            matchType: "full_name",
          },
        ],
        boundParameters: { patientId1: "patient-123" },
        timeoutMs: 1,
      })
    ).resolves.toBeNull();
  });

  it("uses only patientId bound parameters for patient context lookup", async () => {
    const loader = vi.fn().mockResolvedValue({
      patientRef: "opaque-1",
      summary: {
        displayName: "Jane Doe",
        primaryFlags: [],
      },
      activeProblems: [],
      recentAssessments: [],
      woundHighlights: [],
      alerts: [],
      provenance: [],
    });
    const service = new PatientContextAssembler(loader as any);

    await expect(
      service.assemble({
        customerId: "cust-1",
        resolvedEntities: [
          {
            kind: "patient",
            opaqueRef: "opaque-1",
            matchType: "full_name",
          },
        ],
        boundParameters: {
          startDate: "2026-01-01",
          patientId1: "patient-123",
        },
      })
    ).resolves.toMatchObject({
      patientRef: "opaque-1",
    });

    expect(loader).toHaveBeenCalledWith({
      customerId: "cust-1",
      resolvedPatientId: "patient-123",
      opaqueRef: "opaque-1",
    });
  });
});
