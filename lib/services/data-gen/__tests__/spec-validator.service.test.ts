/**
 * Unit tests for spec-validator.service.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ConnectionPool } from "mssql";
import { validateGenerationSpec } from "../spec-validator.service";
import type { GenerationSpec } from "../generation-spec.types";

describe("Spec Validator Service", () => {
  let mockDb: any;
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
    };

    mockDb = {
      request: vi.fn().mockReturnValue(mockRequest),
    } as any as ConnectionPool;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validateGenerationSpec - patient", () => {
    const basePatientSpec: GenerationSpec = {
      entity: "patient",
      count: 10,
      fields: [
        {
          fieldName: "firstName",
          columnName: "firstName",
          dataType: "nvarchar",
          enabled: true,
          criteria: { type: "faker", fakerMethod: "person.firstName" },
        },
      ],
    };

    it("should pass validation when units exist", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [{ count: 5 }],
      });

      const result = await validateGenerationSpec(basePatientSpec, mockDb);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when no units exist", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [{ count: 0 }],
      });

      const result = await validateGenerationSpec(basePatientSpec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("No units found");
    });

    it("should fail when count is zero", async () => {
      const spec = { ...basePatientSpec, count: 0 };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("count must be greater"))).toBe(true);
    });

    it("should validate distribution weights sum to positive number", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [{ count: 5 }],
      });

      const spec: GenerationSpec = {
        ...basePatientSpec,
        fields: [
          {
            fieldName: "gender",
            columnName: "gender",
            dataType: "nvarchar",
            enabled: true,
            criteria: {
              type: "distribution",
              weights: { Male: 0, Female: 0 },
            },
          },
        ],
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("distribution weights"))).toBe(true);
    });

    it("should validate range min < max for numeric fields", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [{ count: 5 }],
      });

      const spec: GenerationSpec = {
        ...basePatientSpec,
        fields: [
          {
            fieldName: "age",
            columnName: "age",
            dataType: "int",
            enabled: true,
            criteria: {
              type: "range",
              min: 100,
              max: 50,
            },
          },
        ],
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("range min must be less"))).toBe(true);
    });

    it("should pass for update mode when target patients exist", async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ count: 3 }] }) // Units exist
        .mockResolvedValueOnce({ recordset: [{ count: 2 }] }); // 2 of 2 patients exist

      const spec: GenerationSpec = {
        ...basePatientSpec,
        mode: "update",
        count: 2,
        target: {
          mode: "custom",
          patientIds: ["p1", "p2"],
        },
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail for update mode when target patients do not exist", async () => {
      // Update mode without unitFk skips unit check; only patient existence query runs
      mockRequest.query.mockResolvedValueOnce({ recordset: [{ count: 0 }] });

      const spec: GenerationSpec = {
        ...basePatientSpec,
        mode: "update",
        count: 2,
        target: {
          mode: "custom",
          patientIds: ["p1", "p2"],
        },
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("target patients"))).toBe(true);
    });

    it("should validate options list is not empty", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [{ count: 5 }],
      });

      const spec: GenerationSpec = {
        ...basePatientSpec,
        fields: [
          {
            fieldName: "status",
            columnName: "status",
            dataType: "nvarchar",
            enabled: true,
            criteria: {
              type: "options",
              pickFrom: [],
            },
          },
        ],
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("options list cannot be empty"))).toBe(
        true
      );
    });
  });

  describe("validateGenerationSpec - assessment", () => {
    const baseAssessmentSpec: GenerationSpec = {
      entity: "assessment_bundle",
      count: 5,
      form: {
        assessmentTypeVersionId: "form-123",
        name: "Wound Assessment",
      },
      target: {
        mode: "generated",
      },
      fields: [],
    };

    it("should fail when form is missing", async () => {
      const spec = { ...baseAssessmentSpec, form: undefined };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Assessment form ID"))).toBe(true);
    });

    it("should fail when target is missing", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [{ count: 1 }],
      });

      const spec = { ...baseAssessmentSpec, target: undefined };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Target selector is required"))).toBe(
        true
      );
    });

    it("should fail when no patients match target criteria", async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ count: 1 }], // Form exists
        })
        .mockResolvedValueOnce({
          recordset: [{ count: 0 }], // No patients
        });

      const result = await validateGenerationSpec(baseAssessmentSpec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("No patients found"))).toBe(true);
    });

    it("should pass when form and patients exist", async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ count: 1 }], // Form exists
        })
        .mockResolvedValueOnce({
          recordset: [{ count: 10 }], // Patients exist
        });

      const result = await validateGenerationSpec(baseAssessmentSpec, mockDb);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when trajectoryDistribution does not sum to 1.0", async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ count: 1 }] })
        .mockResolvedValueOnce({ recordset: [{ count: 10 }] });

      const spec: GenerationSpec = {
        ...baseAssessmentSpec,
        trajectoryDistribution: {
          healing: 0.2,
          stable: 0.3,
          deteriorating: 0.2,
          treatmentChange: 0.1,
        },
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("trajectoryDistribution"))).toBe(true);
    });

    it("should pass when trajectoryDistribution sums to 1.0", async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ count: 1 }] })
        .mockResolvedValueOnce({ recordset: [{ count: 10 }] });

      const spec: GenerationSpec = {
        ...baseAssessmentSpec,
        trajectoryDistribution: {
          healing: 0.25,
          stable: 0.35,
          deteriorating: 0.3,
          treatmentChange: 0.1,
        },
      };

      const result = await validateGenerationSpec(spec, mockDb);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
