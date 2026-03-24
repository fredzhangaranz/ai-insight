import { describe, expect, it } from "vitest";
import {
  applyRegionalPhoneNumbers,
  formatUtcDateOnly,
  normalizeDateOfBirthValue,
} from "../patient-value-format";

describe("patient-value-format", () => {
  it("formatUtcDateOnly has no time component", () => {
    const d = new Date(Date.UTC(1963, 1, 24));
    expect(formatUtcDateOnly(d)).toBe("1963-02-24");
  });

  it("normalizeDateOfBirthValue converts Date to YYYY-MM-DD", () => {
    expect(normalizeDateOfBirthValue(new Date(Date.UTC(1951, 5, 28)))).toBe(
      "1951-06-28",
    );
  });

  it("applyRegionalPhoneNumbers sets NZ patterns when preset is nz-urban", () => {
    const row = new Map<string, unknown>([
      ["col:homePhone", "x"],
      ["col:mobilePhone", "x"],
      ["col:workPhone", "x"],
    ]);
    applyRegionalPhoneNumbers(row, "nz-urban", new Set());
    expect(row.get("col:homePhone")).toMatch(/^09 \d{3} \d{4}$/);
    expect(row.get("col:workPhone")).toMatch(/^09 \d{3} \d{4}$/);
    expect(row.get("col:mobilePhone")).toMatch(/^02[1-7] \d{3} \d{4}$/);
  });

  it("applyRegionalPhoneNumbers sets AU patterns when preset is au-coastal", () => {
    const row = new Map<string, unknown>([
      ["col:homePhone", "x"],
      ["col:mobilePhone", "x"],
      ["col:workPhone", "x"],
    ]);
    applyRegionalPhoneNumbers(row, "au-coastal", new Set());
    expect(row.get("col:homePhone")).toMatch(/^02 \d{4} \d{4}$/);
    expect(row.get("col:workPhone")).toMatch(/^02 \d{4} \d{4}$/);
    expect(row.get("col:mobilePhone")).toMatch(/^04\d{2} \d{3} \d{3}$/);
  });

  it("applyRegionalPhoneNumbers skips locked keys", () => {
    const row = new Map<string, unknown>([["col:mobilePhone", "021 000 0000"]]);
    applyRegionalPhoneNumbers(row, "nz-urban", new Set(["col:mobilePhone"]));
    expect(row.get("col:mobilePhone")).toBe("021 000 0000");
  });

  it("applyRegionalPhoneNumbers sets US NANP-style numbers for us-urban", () => {
    const row = new Map<string, unknown>([
      ["col:homePhone", "x"],
      ["col:mobilePhone", "x"],
      ["col:workPhone", "x"],
    ]);
    applyRegionalPhoneNumbers(row, "us-urban", new Set());
    expect(row.get("col:homePhone")).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    expect(row.get("col:mobilePhone")).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    expect(row.get("col:workPhone")).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
  });
});
