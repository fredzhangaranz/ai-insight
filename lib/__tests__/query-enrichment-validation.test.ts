import { describe, it, expect } from "vitest";

// Mock the base provider to test the validation functions
class MockBaseProvider {
  public validateDesiredFields(desiredFields?: string[]): {
    fieldsApplied: string[];
    joinSummary: string;
    rejectedFields: string[];
  } {
    if (!desiredFields || desiredFields.length === 0) {
      return { fieldsApplied: [], joinSummary: "", rejectedFields: [] };
    }

    // Whitelist of allowed entities and fields (MVP scope)
    const allowedFields = {
      patient: {
        firstName: {
          table: "rpt.Patient",
          column: "firstName",
          alias: "patient_firstName",
        },
        lastName: {
          table: "rpt.Patient",
          column: "lastName",
          alias: "patient_lastName",
        },
        dateOfBirth: {
          table: "rpt.Patient",
          column: "dateOfBirth",
          alias: "patient_dateOfBirth",
        },
      },
      wound: {
        anatomyLabel: {
          table: "rpt.Wound",
          column: "anatomyLabel",
          alias: "wound_anatomyLabel",
        },
        label: { table: "rpt.Wound", column: "label", alias: "wound_label" },
        description: {
          table: "rpt.Wound",
          column: "description",
          alias: "wound_description",
        },
      },
    };

    const fieldsApplied: string[] = [];
    const rejectedFields: string[] = [];
    const joinSpecs = new Set<string>();

    for (const field of desiredFields) {
      const [entity, fieldName] = field.split(".");

      if (!entity || !fieldName) {
        rejectedFields.push(field);
        continue;
      }

      const entityFields = allowedFields[entity as keyof typeof allowedFields];
      if (!entityFields) {
        rejectedFields.push(field);
        continue;
      }

      const fieldSpec = entityFields[fieldName as keyof typeof entityFields];
      if (!fieldSpec) {
        rejectedFields.push(field);
        continue;
      }

      fieldsApplied.push(field);

      // Generate join spec based on entity
      if (entity === "patient") {
        joinSpecs.add("INNER JOIN rpt.Patient AS P ON base.patientFk = P.id");
      } else if (entity === "wound") {
        joinSpecs.add("INNER JOIN rpt.Wound AS W ON base.woundFk = W.id");
      }
    }

    const joinSummary = Array.from(joinSpecs).join("\n");

    return {
      fieldsApplied,
      joinSummary,
      rejectedFields,
    };
  }

  public validateAndEnforceSqlSafety(sql: string): {
    isValid: boolean;
    modifiedSql?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let modifiedSql = sql;
    let isValid = true;

    // 1. Basic SELECT-only validation
    const upperSql = sql.trim().toUpperCase();
    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("WITH")) {
      isValid = false;
      warnings.push("Query must start with SELECT or WITH");
      return { isValid, warnings };
    }

    // 2. Check for dangerous keywords
    const dangerousKeywords = [
      "DROP",
      "DELETE",
      "UPDATE",
      "INSERT",
      "TRUNCATE",
      "ALTER",
      "CREATE",
      "EXEC",
      "EXECUTE",
      "SP_",
      "XP_",
    ];

    for (const keyword of dangerousKeywords) {
      // Use a regex to match whole words to avoid false positives on column names
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(upperSql)) {
        isValid = false;
        warnings.push(`Dangerous SQL keyword detected: ${keyword}`);
      }
    }

    // 3. Enforce TOP clause for safety
    if (!upperSql.includes("TOP") && !upperSql.includes("OFFSET")) {
      // Add TOP 1000 if not present
      modifiedSql = modifiedSql.replace(/\bSELECT\b/i, "SELECT TOP 1000");
      warnings.push("Added TOP 1000 clause for safety");
    }

    // 4. Enforce schema prefixing
    const tableRegex =
      /(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
    const originalSql = modifiedSql;
    modifiedSql = modifiedSql.replace(tableRegex, "rpt.$1");

    if (modifiedSql !== originalSql) {
      warnings.push("Applied schema prefixing (rpt.) to table names");
    }

    // 5. Validate column count limit (prevent excessive data)
    const selectMatch = modifiedSql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const columns = selectMatch[1].split(",").length;
      if (columns > 20) {
        warnings.push(
          `Large number of columns (${columns}) may impact performance`
        );
      }
    }

    return { isValid, modifiedSql, warnings };
  }

  public validateEnrichmentFields(
    sql: string,
    requestedFields: string[]
  ): {
    isValid: boolean;
    warnings: string[];
    extraFields: string[];
  } {
    if (!requestedFields || requestedFields.length === 0) {
      return { isValid: true, warnings: [], extraFields: [] };
    }

    const warnings: string[] = [];
    const extraFields: string[] = [];
    const expectedAliases = new Set<string>();

    // Build expected aliases from requested fields
    for (const field of requestedFields) {
      const [entity, fieldName] = field.split(".");
      if (entity && fieldName) {
        expectedAliases.add(`${entity}_${fieldName}`);
      }
    }

    // Extract column aliases from the SQL
    const aliasRegex = /\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
    const matches = sql.match(aliasRegex);

    if (matches) {
      for (const match of matches) {
        const alias = match.replace(/\bAS\s+/i, "").trim();
        if (!expectedAliases.has(alias) && alias.includes("_")) {
          // This might be an enrichment field that wasn't requested
          extraFields.push(alias);
        }
      }
    }

    if (extraFields.length > 0) {
      warnings.push(
        `Extra enrichment fields detected: ${extraFields.join(
          ", "
        )}. Only requested fields should be included.`
      );
    }

    return {
      isValid: extraFields.length === 0,
      warnings,
      extraFields,
    };
  }
}

describe("Query Enrichment Validation", () => {
  const provider = new MockBaseProvider();

  describe("validateDesiredFields", () => {
    it("should accept valid patient fields", () => {
      const result = provider.validateDesiredFields([
        "patient.firstName",
        "patient.lastName",
      ]);

      expect(result.fieldsApplied).toEqual([
        "patient.firstName",
        "patient.lastName",
      ]);
      expect(result.rejectedFields).toEqual([]);
      expect(result.joinSummary).toContain(
        "INNER JOIN rpt.Patient AS P ON base.patientFk = P.id"
      );
    });

    it("should accept valid wound fields", () => {
      const result = provider.validateDesiredFields([
        "wound.anatomyLabel",
        "wound.label",
      ]);

      expect(result.fieldsApplied).toEqual([
        "wound.anatomyLabel",
        "wound.label",
      ]);
      expect(result.rejectedFields).toEqual([]);
      expect(result.joinSummary).toContain(
        "INNER JOIN rpt.Wound AS W ON base.woundFk = W.id"
      );
    });

    it("should reject invalid entity", () => {
      const result = provider.validateDesiredFields(["invalid.firstName"]);

      expect(result.fieldsApplied).toEqual([]);
      expect(result.rejectedFields).toEqual(["invalid.firstName"]);
    });

    it("should reject invalid field", () => {
      const result = provider.validateDesiredFields(["patient.invalidField"]);

      expect(result.fieldsApplied).toEqual([]);
      expect(result.rejectedFields).toEqual(["patient.invalidField"]);
    });

    it("should reject malformed field names", () => {
      const result = provider.validateDesiredFields([
        "patient",
        "patient.",
        ".firstName",
      ]);

      expect(result.fieldsApplied).toEqual([]);
      expect(result.rejectedFields).toEqual([
        "patient",
        "patient.",
        ".firstName",
      ]);
    });

    it("should handle mixed valid and invalid fields", () => {
      const result = provider.validateDesiredFields([
        "patient.firstName",
        "invalid.field",
        "wound.anatomyLabel",
        "patient.invalidField",
      ]);

      expect(result.fieldsApplied).toEqual([
        "patient.firstName",
        "wound.anatomyLabel",
      ]);
      expect(result.rejectedFields).toEqual([
        "invalid.field",
        "patient.invalidField",
      ]);
      expect(result.joinSummary).toContain(
        "INNER JOIN rpt.Patient AS P ON base.patientFk = P.id"
      );
      expect(result.joinSummary).toContain(
        "INNER JOIN rpt.Wound AS W ON base.woundFk = W.id"
      );
    });

    it("should handle empty input", () => {
      const result = provider.validateDesiredFields();

      expect(result.fieldsApplied).toEqual([]);
      expect(result.rejectedFields).toEqual([]);
      expect(result.joinSummary).toBe("");
    });
  });

  describe("validateAndEnforceSqlSafety", () => {
    it("should accept valid SELECT query", () => {
      const sql = "SELECT id, name FROM Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain("Added TOP 1000 clause for safety");
      expect(result.modifiedSql).toContain("SELECT TOP 1000");
    });

    it("should accept valid WITH query", () => {
      const sql = "WITH cte AS (SELECT id FROM Assessment) SELECT * FROM cte";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain("Added TOP 1000 clause for safety");
    });

    it("should reject non-SELECT queries", () => {
      const sql = "DELETE FROM Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain("Query must start with SELECT or WITH");
    });

    it("should reject dangerous keywords", () => {
      const sql = "SELECT * FROM Assessment; DROP TABLE Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain("Dangerous SQL keyword detected: DROP");
    });

    it("should apply schema prefixing", () => {
      const sql = "SELECT * FROM Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        "Applied schema prefixing (rpt.) to table names"
      );
      expect(result.modifiedSql).toContain("rpt.Assessment");
    });

    it("should warn about large column counts", () => {
      const sql =
        "SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, col12, col13, col14, col15, col16, col17, col18, col19, col20, col21 FROM Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        "Large number of columns (21) may impact performance"
      );
    });

    it("should preserve existing TOP clause", () => {
      const sql = "SELECT TOP 500 * FROM Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain("Added TOP 1000 clause for safety");
      expect(result.modifiedSql).toContain("SELECT TOP 500");
    });

    it("should not flag keywords within identifiers like 'createdByUserName'", () => {
      const sql = "SELECT id, createdByUserName FROM Assessment";
      const result = provider.validateAndEnforceSqlSafety(sql);

      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain(
        "Dangerous SQL keyword detected: CREATE"
      );
      // It should still apply other safety rules
      expect(result.modifiedSql).toContain("SELECT TOP 1000");
      expect(result.modifiedSql).toContain("rpt.Assessment");
    });
  });

  describe("validateEnrichmentFields", () => {
    it("should validate enrichment fields correctly", () => {
      const sql =
        "SELECT A.id, P.firstName AS patient_firstName, P.lastName AS patient_lastName, A.createdByUserName AS extra_field FROM rpt.Assessment A JOIN rpt.Patient P ON A.patientFk = P.id";
      const requestedFields = ["patient.firstName", "patient.lastName"];
      const result = provider.validateEnrichmentFields(sql, requestedFields);

      expect(result.isValid).toBe(false);
      expect(result.extraFields).toContain("extra_field");
      expect(result.warnings).toContain(
        "Extra enrichment fields detected: extra_field"
      );
    });

    it("should accept SQL with only requested enrichment fields", () => {
      const sql =
        "SELECT A.id, P.firstName AS patient_firstName, P.lastName AS patient_lastName FROM rpt.Assessment A JOIN rpt.Patient P ON A.patientFk = P.id";
      const requestedFields = ["patient.firstName", "patient.lastName"];
      const result = provider.validateEnrichmentFields(sql, requestedFields);

      expect(result.isValid).toBe(true);
      expect(result.extraFields).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });
});
