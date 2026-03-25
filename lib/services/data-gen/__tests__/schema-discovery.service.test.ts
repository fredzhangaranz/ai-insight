/**
 * Unit tests for schema-discovery.service.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ConnectionPool } from "mssql";
import {
  getPatientSchema,
  getPublishedForms,
  getFormFields,
  getDataGenStats,
  getWoundStateCatalog,
  resolveWoundStateCompanion,
} from "../schema-discovery.service";

// Mock mssql
vi.mock("mssql");

describe("Schema Discovery Service", () => {
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

  describe("getPatientSchema", () => {
    it("should return PatientNotes attribute fields with coverage stats", async () => {
      // Mapped: 0B532097-80AC-4918-BDAB-B40F51B16188 -> firstName
      // Unmapped: random GUID for gender
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [
            {
              attributeTypeId: "attr-1",
              fieldName: "First Name",
              variableName: "details_first_name",
              attributeTypeKey: "0B532097-80AC-4918-BDAB-B40F51B16188",
              dataType: 231,
              isRequired: false,
              calculatedValueExpression: null,
              assessmentTypeVersionId: "atv-1",
            },
            {
              attributeTypeId: "attr-2",
              fieldName: "Gender",
              variableName: "details_is_female",
              attributeTypeKey: "unmapped-guid",
              dataType: 104,
              isRequired: false,
              calculatedValueExpression: null,
              assessmentTypeVersionId: "atv-1",
            },
          ],
        })
        .mockResolvedValueOnce({ recordset: [{ total: 100 }] })
        .mockResolvedValueOnce({ recordset: [{ nonNull: 95 }] })
        .mockResolvedValueOnce({ recordset: [{ filled: 20 }] });

      const result = await getPatientSchema(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        fieldName: "First Name",
        columnName: "firstName",
        storageType: "direct_patient",
        attributeTypeId: "attr-1",
      });
      expect(result[0].coverage?.total).toBe(100);
      expect(result[0].coverage?.nonNull).toBe(95);

      expect(result[1]).toMatchObject({
        fieldName: "Gender",
        storageType: "patient_attribute",
        attributeTypeId: "attr-2",
      });
      expect(result[1].coverage?.nonNull).toBe(20);
    });

    it("should handle empty PatientNotes", async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const result = await getPatientSchema(mockDb);

      expect(result).toHaveLength(0);
    });
  });

  describe("getPublishedForms", () => {
    it("should return only published forms (versionType = 2)", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [
          {
            assessmentFormId: "form-1",
            assessmentTypeId: "type-1",
            assessmentFormName: "Wound Assessment",
            definitionVersion: 3,
            fieldCount: 24,
          },
          {
            assessmentFormId: "form-2",
            assessmentTypeId: "type-2",
            assessmentFormName: "Skin Assessment",
            definitionVersion: 2,
            fieldCount: 18,
          },
        ],
      });

      const result = await getPublishedForms(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        assessmentFormId: "form-1",
        assessmentFormName: "Wound Assessment",
        fieldCount: 24,
      });
    });

    it("should return empty array when no published forms exist", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      const result = await getPublishedForms(mockDb);

      expect(result).toHaveLength(0);
    });
  });

  describe("getFormFields", () => {
    it("should include options for SingleSelectList fields", async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [
          {
            fieldName: "Wound Location",
            columnName: "wound_location",
            dataType: 1000, // SingleSelectList
            attributeTypeId: "attr-1",
            attributeTypeKey: "attr-key-1",
            minValue: null,
            maxValue: null,
            isRequired: true,
            visibilityExpression: "HasValue(parent_field)",
            attributeSetKey: "set-key-1",
            attributeSetOrderIndex: 1,
            attributeOrderIndex: 2,
          },
          ],
        })
        .mockResolvedValueOnce({
          recordset: [
            { text: "Left Heel" },
            { text: "Right Heel" },
            { text: "Sacrum" },
          ],
        });

      const result = await getFormFields(mockDb, "form-id-123");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        fieldName: "Wound Location",
        dataType: "SingleSelectList",
        isNullable: false,
        storageType: "wound_attribute",
        attributeTypeKey: "attr-key-1",
        attributeSetKey: "set-key-1",
        options: ["Left Heel", "Right Heel", "Sacrum"],
        visibilityExpression: "HasValue(parent_field)",
        attributeSetOrderIndex: 1,
        attributeOrderIndex: 2,
        isGeneratable: true,
      });
    });

    it("should include min/max for Decimal fields", async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [
          {
            fieldName: "Wound Area",
            columnName: "wound_area",
            dataType: 106, // Decimal
            attributeTypeId: "attr-2",
            attributeTypeKey: "attr-key-2",
            minValue: 0,
            maxValue: 500,
            isRequired: false,
            visibilityExpression: null,
            attributeSetKey: "set-key-2",
            attributeSetOrderIndex: 1,
            attributeOrderIndex: 3,
          },
        ],
      });

      const result = await getFormFields(mockDb, "form-id-123");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        fieldName: "Wound Area",
        dataType: "Decimal",
        isNullable: true,
        min: 0,
        max: 500,
      });
      expect(result[0].options).toBeUndefined();
    });

    it("should not include options for non-select fields", async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [
          {
            fieldName: "Notes",
            columnName: "notes",
            dataType: 231, // Text
            attributeTypeId: "attr-3",
            attributeTypeKey: "attr-key-3",
            minValue: null,
            maxValue: null,
            isRequired: false,
            visibilityExpression: null,
            attributeSetKey: "set-key-3",
            attributeSetOrderIndex: 1,
            attributeOrderIndex: 4,
          },
        ],
      });

      const result = await getFormFields(mockDb, "form-id-123");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        fieldName: "Notes",
        dataType: "Text",
      });
      expect(result[0].options).toBeUndefined();
      expect(result[0].min).toBeUndefined();
      expect(result[0].max).toBeUndefined();
    });

    it("marks embedded wound-state fields with wound_state_attribute storage", async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [
          {
            fieldName: "Recurring",
            columnName: "recurring",
            dataType: 104,
            attributeTypeId: "attr-4",
            attributeTypeKey: "attr-key-4",
            minValue: null,
            maxValue: null,
            isRequired: false,
            visibilityExpression: "wound_state == 'Open'",
            attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
            attributeSetOrderIndex: 2,
            attributeOrderIndex: 1,
          },
        ],
      });

      const result = await getFormFields(mockDb, "form-id-123");

      expect(result[0]).toMatchObject({
        columnName: "recurring",
        storageType: "wound_state_attribute",
      });
    });
  });

  describe("wound-state catalog discovery", () => {
    it("returns catalog entries with open/non-open classification", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [
          {
            id: "lookup-new",
            text: "New",
            orderIndex: 1,
            isOpenWoundState: true,
          },
          {
            id: "lookup-resolved",
            text: "Resolved",
            orderIndex: 2,
            isOpenWoundState: false,
          },
        ],
      });

      const result = await getWoundStateCatalog(mockDb, "selector-1");

      expect(result).toEqual([
        {
          id: "lookup-new",
          text: "New",
          normalizedText: "new",
          isOpenWoundState: true,
          orderIndex: 1,
        },
        {
          id: "lookup-resolved",
          text: "Resolved",
          normalizedText: "resolved",
          isOpenWoundState: false,
          orderIndex: 2,
        },
      ]);
    });

    it("fails when lookup rows are missing WoundStateDisplay entries", async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [
          {
            id: "lookup-new",
            text: "New",
            orderIndex: 1,
            isOpenWoundState: null,
          },
        ],
      });

      await expect(getWoundStateCatalog(mockDb, "selector-1")).rejects.toThrow(
        /missing WoundStateDisplay rows for: New/
      );
    });

    it("resolves the wound-state companion with catalog partitions", async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ id: "wound-state-atv", definitionVersion: 3 }],
        })
        .mockResolvedValueOnce({
          recordset: [
            {
              fieldName: "Wound State",
              columnName: "wound_state",
              dataType: 1000,
              attributeTypeId: "selector-1",
              attributeTypeKey: "56A71C1C-214E-46AD-8A74-BB735AB87B39",
              minValue: null,
              maxValue: null,
              isRequired: true,
              calculatedValueExpression: null,
              visibilityExpression: null,
              attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
              attributeSetOrderIndex: 1,
              attributeOrderIndex: 1,
            },
          ],
        })
        .mockResolvedValueOnce({
          recordset: [{ text: "New" }, { text: "Resolved" }],
        })
        .mockResolvedValueOnce({
          recordset: [
            {
              fieldName: "Wound State",
              columnName: "wound_state",
              dataType: 1000,
              attributeTypeId: "selector-1",
              attributeTypeKey: "56A71C1C-214E-46AD-8A74-BB735AB87B39",
              minValue: null,
              maxValue: null,
              isRequired: true,
              calculatedValueExpression: null,
              visibilityExpression: null,
              attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
              attributeSetOrderIndex: 1,
              attributeOrderIndex: 1,
            },
          ],
        })
        .mockResolvedValueOnce({
          recordset: [{ text: "New" }, { text: "Resolved" }],
        })
        .mockResolvedValueOnce({
          recordset: [
            {
              id: "lookup-new",
              text: "New",
              orderIndex: 1,
              isOpenWoundState: true,
            },
            {
              id: "lookup-resolved",
              text: "Resolved",
              orderIndex: 2,
              isOpenWoundState: false,
            },
          ],
        });

      const result = await resolveWoundStateCompanion(mockDb);

      expect(result.assessmentTypeVersionId).toBe("wound-state-atv");
      expect(result.selectorField.columnName).toBe("wound_state");
      expect(result.catalog.map((entry) => entry.text)).toEqual(["New", "Resolved"]);
      expect(result.openStates.map((entry) => entry.text)).toEqual(["New"]);
      expect(result.nonOpenStates.map((entry) => entry.text)).toEqual(["Resolved"]);
    });
  });

  describe("getDataGenStats", () => {
    it("should return correct patient and assessment stats", async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ total: 100, generated: 20 }],
        })
        .mockResolvedValueOnce({
          recordset: [
            { formName: "Wound Assessment", count: 120 },
            { formName: "Skin Assessment", count: 45 },
          ],
        });

      const result = await getDataGenStats(mockDb);

      expect(result).toMatchObject({
        patientCount: 100,
        generatedPatientCount: 20,
        assessmentCountByForm: [
          { formName: "Wound Assessment", count: 120 },
          { formName: "Skin Assessment", count: 45 },
        ],
      });
    });

    it("should handle empty assessment data", async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ total: 100, generated: 0 }],
        })
        .mockResolvedValueOnce({
          recordset: [],
        });

      const result = await getDataGenStats(mockDb);

      expect(result).toMatchObject({
        patientCount: 100,
        generatedPatientCount: 0,
        assessmentCountByForm: [],
      });
    });
  });
});
