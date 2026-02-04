import { describe, it, expect, vi } from "vitest";
import { normalizeJson, parseJsonSafe } from "../normalize-json";

describe("normalizeJson", () => {
  it("returns empty object for null/undefined", () => {
    expect(normalizeJson(null)).toEqual({});
    expect(normalizeJson(undefined)).toEqual({});
    expect(normalizeJson("")).toEqual({});
  });

  it("parses JSON strings", () => {
    const jsonString = JSON.stringify({ key: "value", num: 42 });
    const result = normalizeJson(jsonString);
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("returns object as-is if already parsed", () => {
    const obj = { key: "value", nested: { inner: true } };
    const result = normalizeJson(obj);
    expect(result).toEqual(obj);
  });

  it("returns empty object for invalid JSON strings", () => {
    expect(normalizeJson("{invalid json}")).toEqual({});
    expect(normalizeJson("not json at all")).toEqual({});
    expect(normalizeJson("{")).toEqual({});
  });

  it("handles complex nested structures", () => {
    const complex = {
      array: [1, 2, 3],
      nested: { deep: { value: "test" } },
      null: null,
    };
    const jsonString = JSON.stringify(complex);
    const result = normalizeJson(jsonString);
    expect(result).toEqual(complex);
  });
});

describe("parseJsonSafe", () => {
  it("parses valid JSON strings", () => {
    const jsonString = JSON.stringify({ key: "value" });
    const result = parseJsonSafe(jsonString, {});
    expect(result).toEqual({ key: "value" });
  });

  it("returns fallback for null/undefined", () => {
    const fallback = { default: true };
    expect(parseJsonSafe(null, fallback)).toEqual(fallback);
    expect(parseJsonSafe(undefined, fallback)).toEqual(fallback);
  });

  it("returns fallback for invalid JSON", () => {
    const fallback = { error: true };
    const result = parseJsonSafe("not json", fallback);
    expect(result).toEqual(fallback);
  });

  it("logs warning when parsing fails", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation();
    const fallback = {};

    parseJsonSafe("{invalid}", fallback);

    expect(warnSpy).toHaveBeenCalledWith(
      "[parseJsonSafe] Failed to parse JSON:",
      expect.any(String)
    );

    warnSpy.mockRestore();
  });

  it("preserves generic types", () => {
    const result = parseJsonSafe<{ count: number }>(
      JSON.stringify({ count: 42 }),
      { count: 0 }
    );
    expect(result.count).toBe(42);
  });
});
