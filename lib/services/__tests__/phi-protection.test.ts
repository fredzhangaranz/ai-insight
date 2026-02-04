import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PHIProtectionService } from "../phi-protection.service";

describe("PHIProtectionService", () => {
  const service = new PHIProtectionService();
  let originalSalt: string | undefined;

  beforeEach(() => {
    originalSalt = process.env.ENTITY_HASH_SALT;
  });

  afterEach(() => {
    if (originalSalt !== undefined) {
      process.env.ENTITY_HASH_SALT = originalSalt;
    } else {
      delete process.env.ENTITY_HASH_SALT;
    }
  });

  it("throws error if ENTITY_HASH_SALT is not set", () => {
    delete process.env.ENTITY_HASH_SALT;

    expect(() => service.hashEntityId(12345)).toThrow(
      /ENTITY_HASH_SALT must be set/
    );
  });

  it("throws error if ENTITY_HASH_SALT is default value", () => {
    process.env.ENTITY_HASH_SALT = "default-salt-change-in-prod";

    expect(() => service.hashEntityId(12345)).toThrow(
      /ENTITY_HASH_SALT must be set/
    );
  });

  it("hashes entity IDs consistently", () => {
    process.env.ENTITY_HASH_SALT = "test-salt-secure-value-for-testing";
    const hash1 = service.hashEntityId(12345);
    const hash2 = service.hashEntityId(12345);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it("creates safe result summary without PHI", () => {
    process.env.ENTITY_HASH_SALT = "test-salt-secure-value-for-testing";

    const rows = [
      { patientId: 123, age: 45, name: "John Doe" },
      { patientId: 456, age: 60, name: "Jane Smith" },
    ];
    const columns = ["patientId", "age", "name"];

    const summary = service.createSafeResultSummary(rows, columns);

    expect(summary.rowCount).toBe(2);
    expect(summary.columns).toEqual(columns);
    expect(summary.entityHashes).toHaveLength(2);
    expect(JSON.stringify(summary)).not.toContain("John");
    expect(JSON.stringify(summary)).not.toContain("Jane");
  });

  it("detects PHI in metadata and throws", () => {
    const badMetadata = {
      sql: "SELECT * FROM Patient",
      patientName: "John Doe",
    };

    expect(() => service.validateNoPHI(badMetadata)).toThrow(/PHI detected/);
  });

  it("allows safe metadata", () => {
    const safeMetadata = {
      sql: "SELECT * FROM Patient",
      resultSummary: {
        rowCount: 10,
        columns: ["id", "age"],
        entityHashes: ["abc123", "def456"],
      },
    };

    expect(() => service.validateNoPHI(safeMetadata)).not.toThrow();
  });

  it("generates different hashes for different entity IDs", () => {
    process.env.ENTITY_HASH_SALT = "test-salt-secure-value-for-testing";

    const hash1 = service.hashEntityId(123);
    const hash2 = service.hashEntityId(456);
    const hash3 = service.hashEntityId("patient-789");

    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(16);
    expect(hash2).toHaveLength(16);
    expect(hash3).toHaveLength(16);
  });

  it("deduplicates entity hashes", () => {
    process.env.ENTITY_HASH_SALT = "test-salt-secure-value-for-testing";

    const rows = [
      { patientId: 123, age: 45 },
      { patientId: 123, age: 50 }, // Same patient, different record
      { patientId: 456, age: 60 },
      { patient_id: 456, age: 65 }, // Same patient, different column name
    ];

    const summary = service.createSafeResultSummary(rows, ["patientId", "age"]);

    // Should only have 2 unique hashes (patient 123 and 456)
    expect(summary.entityHashes).toHaveLength(2);
  });

  it("handles empty rows", () => {
    process.env.ENTITY_HASH_SALT = "test-salt-secure-value-for-testing";

    const summary = service.createSafeResultSummary([], []);

    expect(summary.rowCount).toBe(0);
    expect(summary.columns).toEqual([]);
    expect(summary.entityHashes).toBeUndefined();
  });

  it("handles rows without entity IDs", () => {
    process.env.ENTITY_HASH_SALT = "test-salt-secure-value-for-testing";

    const rows = [
      { count: 5, average_age: 45 },
      { count: 10, average_age: 50 },
    ];

    const summary = service.createSafeResultSummary(rows, ["count", "average_age"]);

    expect(summary.rowCount).toBe(2);
    expect(summary.entityHashes).toBeUndefined(); // No entity IDs found
  });

  it("detects PHI with regex patterns", () => {
    const testCases = [
      { patientName: "John" }, // patient.*name
      { firstName: "John" }, // first.*name
      { dateOfBirth: "1990-01-01" }, // date.*birth
      { dob: "1990-01-01" }, // d.o.b
      { phoneNumber: "555-1234" }, // phone
      { emailAddress: "test@example.com" }, // email
      { zipCode: "12345" }, // zip
      { patientId: 123 }, // patient.*id
    ];

    testCases.forEach((testCase) => {
      expect(() => service.validateNoPHI(testCase)).toThrow(/PHI detected/);
    });
  });

  it("allows safe field names", () => {
    const safeMetadata = {
      rowCount: 10,
      columns: ["id", "age", "gender", "status"],
      executionTimeMs: 150,
      compositionStrategy: "cte",
    };

    expect(() => service.validateNoPHI(safeMetadata)).not.toThrow();
  });
});
