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
});
