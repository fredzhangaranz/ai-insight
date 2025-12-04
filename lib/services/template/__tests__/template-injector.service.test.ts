import { describe, expect, it } from "vitest";

import {
  TemplateInjectionError,
  TemplateInjectorService,
} from "../template-injector.service";

describe("TemplateInjectorService", () => {
  const injector = new TemplateInjectorService();

  it("injects string placeholders with proper escaping", () => {
    const sql = injector.injectPlaceholders(
      "SELECT * FROM rpt.Patient WHERE lastName = {lastName}",
      { lastName: "O'Connor" },
      "Demo"
    );

    expect(sql).toBe(
      "SELECT * FROM rpt.Patient WHERE lastName = 'O''Connor'"
    );
  });

  it("injects numeric and boolean placeholders without quotes", () => {
    const sql = injector.injectPlaceholders(
      "SELECT TOP {limit} * FROM rpt.Patient WHERE archived = {isArchived}",
      { limit: 25, isArchived: false }
    );

    expect(sql).toBe(
      "SELECT TOP 25 * FROM rpt.Patient WHERE archived = 0"
    );
  });

  it("injects arrays by joining serialized elements", () => {
    const sql = injector.injectPlaceholders(
      "SELECT * FROM rpt.Note WHERE status IN ({statuses})",
      { statuses: ["Pending", "Review", "Complete"] }
    );

    expect(sql).toBe(
      "SELECT * FROM rpt.Note WHERE status IN ('Pending', 'Review', 'Complete')"
    );
  });

  it("supports raw SQL values for structural placeholders", () => {
    const sql = injector.injectPlaceholders(
      "SELECT {columns} FROM {table}",
      {
        columns: { raw: "p.id, p.firstName" },
        table: { raw: "rpt.Patient p" },
      }
    );

    expect(sql).toBe("SELECT p.id, p.firstName FROM rpt.Patient p");
  });

  it("normalizes placeholder tokens before lookup", () => {
    const sql = injector.injectPlaceholders(
      "WHERE {filters?}",
      { filters: { raw: "p.unitFk = u.id" } }
    );

    expect(sql).toBe("WHERE p.unitFk = u.id");
  });

  it("serializes Date placeholders to ISO strings", () => {
    const sql = injector.injectPlaceholders(
      "WHERE a.date >= {startDate}",
      { startDate: new Date("2024-01-01T00:00:00.000Z") }
    );

    expect(sql).toBe(
      "WHERE a.date >= '2024-01-01T00:00:00.000Z'"
    );
  });

  it("throws when placeholder values are missing", () => {
    expect(() =>
      injector.injectPlaceholders(
        "SELECT * FROM rpt.Patient WHERE id = {patientId}",
        {},
        "MissingExample"
      )
    ).toThrow(TemplateInjectionError);
  });
});
