/**
 * Unit tests for patient-storage-mapping.ts
 */

import { describe, it, expect } from "vitest";
import {
  getPatientColumnForAttributeTypeKey,
  isMappedToPatientTable,
  ATTRIBUTE_TYPE_KEY_TO_PATIENT_COLUMN,
} from "../patient-storage-mapping";

describe("patient-storage-mapping", () => {
  it("should return patient column for mapped attributeTypeKey", () => {
    expect(
      getPatientColumnForAttributeTypeKey("0B532097-80AC-4918-BDAB-B40F51B16188")
    ).toBe("firstName");
    expect(
      getPatientColumnForAttributeTypeKey("3D0AEF97-E856-47C4-A733-BA88E4DCDDAB")
    ).toBe("lastName");
    expect(
      getPatientColumnForAttributeTypeKey("602CD327-38B9-4B37-BC67-10D2AC8046EA")
    ).toBe("dateOfBirth");
  });

  it("should return null for unmapped attributeTypeKey", () => {
    expect(getPatientColumnForAttributeTypeKey("unknown-guid")).toBeNull();
    expect(getPatientColumnForAttributeTypeKey(null)).toBeNull();
    expect(getPatientColumnForAttributeTypeKey(undefined)).toBeNull();
  });

  it("should be case-insensitive", () => {
    expect(
      getPatientColumnForAttributeTypeKey("0b532097-80ac-4918-bdab-b40f51b16188")
    ).toBe("firstName");
  });

  it("isMappedToPatientTable should return true for mapped keys", () => {
    expect(
      isMappedToPatientTable("0B532097-80AC-4918-BDAB-B40F51B16188")
    ).toBe(true);
  });

  it("isMappedToPatientTable should return false for unmapped keys", () => {
    expect(isMappedToPatientTable("random-guid")).toBe(false);
  });

  it("should have 15 mappings", () => {
    expect(Object.keys(ATTRIBUTE_TYPE_KEY_TO_PATIENT_COLUMN)).toHaveLength(15);
  });
});
