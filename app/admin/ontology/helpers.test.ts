import { describe, expect, it } from "vitest";

import {
  buildQueryParams,
  parseAliases,
  parseMetadata,
  stringifyAliases,
} from "./helpers";

describe("ontology helpers", () => {
  it("parses aliases removing blanks and duplicates", () => {
    const aliases = parseAliases("Alpha\nbeta\n\nAlpha, gamma ");
    expect(aliases).toEqual(["Alpha", "beta", "gamma"]);
  });

  it("stringifies aliases into newline separated text", () => {
    expect(stringifyAliases(["one", "two"])).toBe("one\ntwo");
    expect(stringifyAliases([])).toBe("");
  });

  it("parses metadata json with validation", () => {
    expect(parseMetadata('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
    expect(parseMetadata(" \n ")).toEqual({});
    expect(() => parseMetadata('["not","object"]')).toThrow(/must be a JSON object/);
    expect(() => parseMetadata("{bad json")).toThrow(/Invalid metadata JSON/);
  });

  it("builds query params from filters", () => {
    expect(buildQueryParams({})).toBe("");
    expect(buildQueryParams({ search: " wound  " })).toBe("?search=wound");
  expect(
    buildQueryParams({
      search: "wound size",
      conceptType: "measurement ",
      includeDeprecated: true,
    })
  ).toBe("?search=wound+size&conceptType=measurement&includeDeprecated=true");
});
});
