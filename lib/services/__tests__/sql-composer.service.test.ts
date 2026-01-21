import { describe, it, expect } from "vitest";
import { SqlComposerService } from "../sql-composer.service";
import { BaseProvider } from "@/lib/ai/providers/base-provider";

class TestProvider extends BaseProvider {
  private responses: string[];

  constructor(responses: string[]) {
    super("test-model");
    this.responses = [...responses];
  }

  protected async _executeModel(
    _systemPrompt: string,
    _userMessage: string
  ): Promise<{
    responseText: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    const responseText = this.responses.shift();
    if (!responseText) {
      throw new Error("No response queued");
    }
    return {
      responseText,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}

describe("SqlComposerService", () => {
  it("parses composition decision JSON responses", async () => {
    const service = new SqlComposerService();
    const provider = new TestProvider([
      "```json\n{\"shouldCompose\": true, \"reasoning\": \"pronoun\", \"confidence\": 0.92}\n```",
    ]);

    const decision = await service.shouldComposeQuery(
      "Which ones are older than 40?",
      "Show female patients",
      "SELECT * FROM Patient WHERE gender = 'Female'",
      provider
    );

    expect(decision.shouldCompose).toBe(true);
    expect(decision.reasoning).toBe("pronoun");
    expect(decision.confidence).toBe(0.92);
  });

  it("falls back to fresh queries when composition parsing fails", async () => {
    const service = new SqlComposerService();
    const provider = new TestProvider(["not json"]);

    const decision = await service.shouldComposeQuery(
      "Which ones are older than 40?",
      "Show female patients",
      "SELECT * FROM Patient WHERE gender = 'Female'",
      provider
    );

    expect(decision.shouldCompose).toBe(false);
    expect(decision.confidence).toBe(0.0);
    expect(decision.reasoning).toMatch("Error determining relationship");
  });

  it("flags composed SQL that violates safety constraints", () => {
    const service = new SqlComposerService();

    const tempTable = service.validateComposedSql(
      "CREATE TEMP TABLE scratch (id INT);"
    );
    expect(tempTable.valid).toBe(false);
    expect(tempTable.errors).toContain("Temporary tables are not allowed");

    // Test INSERT INTO TEMP (also forbidden)
    const tempInsert = service.validateComposedSql(
      "INSERT INTO TEMP SELECT * FROM Patient"
    );
    expect(tempInsert.valid).toBe(false);
    expect(tempInsert.errors).toContain("Cannot insert into temporary tables");
  });

  it("allows safe composed SQL", () => {
    const service = new SqlComposerService();
    const safe = service.validateComposedSql(
      "WITH previous_result AS (SELECT 1 AS id) SELECT * FROM previous_result;"
    );

    expect(safe.valid).toBe(true);
    expect(safe.errors).toHaveLength(0);
  });

  it("parses composition decision JSON without markdown", async () => {
    const service = new SqlComposerService();
    const provider = new TestProvider([
      "{\"shouldCompose\": false, \"reasoning\": \"different entity\", \"confidence\": 0.95}",
    ]);

    const decision = await service.shouldComposeQuery(
      "How many clinics?",
      "Show patients",
      "SELECT * FROM Patient",
      provider
    );

    expect(decision.shouldCompose).toBe(false);
    expect(decision.reasoning).toBe("different entity");
    expect(decision.confidence).toBe(0.95);
  });

  it("rejects temp tables and temp inserts", () => {
    const service = new SqlComposerService();

    const tempTable = service.validateComposedSql(
      "CREATE TEMP TABLE scratch (id INT);"
    );
    expect(tempTable.valid).toBe(false);
    expect(tempTable.errors).toContain("Temporary tables are not allowed");

    const tempInsert = service.validateComposedSql(
      "INSERT INTO TEMP SELECT * FROM Patient"
    );
    expect(tempInsert.valid).toBe(false);
    expect(tempInsert.errors).toContain(
      "Cannot insert into temporary tables"
    );
  });

  it("counts top-level CTEs correctly (allows up to 3)", () => {
    const service = new SqlComposerService();

    // Valid: 1 CTE
    const single = service.validateComposedSql(
      "WITH a AS (SELECT 1) SELECT * FROM a;"
    );
    expect(single.valid).toBe(true);

    // Valid: 3 CTEs (max)
    const triple = service.validateComposedSql(
      "WITH a AS (SELECT 1), b AS (SELECT 2), c AS (SELECT 3) SELECT * FROM a, b, c;"
    );
    expect(triple.valid).toBe(true);

    // Invalid: 4 CTEs (exceeds limit)
    const quad = service.validateComposedSql(
      "WITH a AS (SELECT 1), b AS (SELECT 2), c AS (SELECT 3), d AS (SELECT 4) SELECT * FROM a, b, c, d;"
    );
    expect(quad.valid).toBe(false);
    expect(quad.errors[0]).toMatch("Too many CTEs");
  });

  it("allows safe composed SQL with CTE composition", () => {
    const service = new SqlComposerService();
    const safe = service.validateComposedSql(
      "WITH previous_result AS (SELECT * FROM Patient WHERE gender = 'Female') SELECT * FROM previous_result WHERE age > 40;"
    );

    expect(safe.valid).toBe(true);
    expect(safe.errors).toHaveLength(0);
  });

  it("rejects nested CTEs that exceed depth limit", () => {
    const service = new SqlComposerService();

    const deepCte = service.validateComposedSql(`
      WITH a AS (SELECT 1),
           b AS (SELECT 2),
           c AS (SELECT 3),
           d AS (SELECT 4)
      SELECT * FROM a, b, c, d;
    `);
    expect(deepCte.valid).toBe(false);
    expect(deepCte.errors.some((e) => e.includes("Too many CTEs"))).toBe(true);
  });

  it("validates composition response structure", async () => {
    const service = new SqlComposerService();

    // Valid response
    const validProvider = new TestProvider([
      '{"strategy": "cte", "sql": "WITH prev AS (SELECT 1) SELECT * FROM prev", "reasoning": "test"}',
    ]);

    const result = await service.composeQuery(
      "SELECT * FROM Patient",
      "Show patients",
      "Which are older?",
      validProvider
    );

    expect(result.isBuildingOnPrevious).toBe(true);
    expect(result.strategy).toBe("cte");
  });

  it("throws on invalid composition response (missing sql or strategy)", async () => {
    const service = new SqlComposerService();

    const invalidProvider = new TestProvider([
      '{"strategy": "cte"}', // Missing sql
    ]);

    await expect(
      service.composeQuery(
        "SELECT * FROM Patient",
        "Show patients",
        "Which are older?",
        invalidProvider
      )
    ).rejects.toThrow("missing or invalid sql/strategy");
  });

  it("throws when composed SQL fails validation", async () => {
    const service = new SqlComposerService();

    const badSqlProvider = new TestProvider([
      '{"strategy": "cte", "sql": "CREATE TEMP TABLE bad (id INT)", "reasoning": "test"}',
    ]);

    await expect(
      service.composeQuery(
        "SELECT * FROM Patient",
        "Show patients",
        "Which are older?",
        badSqlProvider
      )
    ).rejects.toThrow("failed safety validation");
  });
});
