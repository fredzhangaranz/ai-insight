import { describe, expect, it } from "vitest";

import { validateTrustedSql } from "@/lib/services/trusted-sql-guard.service";

describe("validateTrustedSql", () => {
  it("rejects literal patient IDs when a trusted parameter is required", () => {
    const result = validateTrustedSql({
      sql: "SELECT * FROM rpt.Patient WHERE id = 'patient-123'",
      patientParamNames: ["patientId1"],
      resolvedPatientIds: ["patient-123"],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("literal patient identifier");
  });

  it("rejects SQL that omits the required trusted parameter", () => {
    const result = validateTrustedSql({
      sql: "SELECT * FROM rpt.Patient",
      patientParamNames: ["patientId1"],
      resolvedPatientIds: [],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("@patientId1");
  });

  it("accepts SQL that uses the trusted parameter", () => {
    const result = validateTrustedSql({
      sql: "SELECT * FROM rpt.Patient WHERE id = @patientId1",
      patientParamNames: ["patientId1"],
      resolvedPatientIds: ["patient-123"],
    });

    expect(result.valid).toBe(true);
  });

  it("rejects SQL that embeds a trusted patient opaque reference", () => {
    const result = validateTrustedSql({
      sql: "SELECT * FROM rpt.Patient WHERE id = '38a5ca28eb328731'",
      patientParamNames: ["patientId1"],
      resolvedPatientIds: ["4f2b2468-1111-2222-3333-444444444444"],
      resolvedPatientOpaqueRefs: ["38a5ca28eb328731"],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("opaque reference");
  });

  it("rejects SQL that binds a trusted patient parameter through domainId", () => {
    const result = validateTrustedSql({
      sql: "SELECT COUNT(*) FROM rpt.Wound W JOIN rpt.Patient P ON W.patientFk = P.id WHERE P.domainId = @patientId1",
      patientParamNames: ["patientId1"],
      resolvedPatientIds: ["4f2b2468-1111-2222-3333-444444444444"],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("domainId");
  });

  it("rejects resolved patient SQL when no trusted patient parameter is present", () => {
    const result = validateTrustedSql({
      sql: "SELECT COUNT(*) FROM rpt.Wound W",
      resolvedPatientIds: ["4f2b2468-1111-2222-3333-444444444444"],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("required trusted patient parameter");
  });
});
