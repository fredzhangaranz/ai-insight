import { describe, expect, it } from "vitest";
import { serializeWoundStateAttributeValue } from "../wound-state.service";

describe("wound-state.service", () => {
  it("serializes wound-state boolean attributes as true/false", () => {
    expect(
      serializeWoundStateAttributeValue({
        field: {
          dataType: "Boolean",
        } as any,
        contextValue: true,
        serializedValue: "1",
      })
    ).toBe("true");

    expect(
      serializeWoundStateAttributeValue({
        field: {
          dataType: "Boolean",
        } as any,
        contextValue: false,
        serializedValue: "0",
      })
    ).toBe("false");
  });

  it("preserves non-boolean wound-state attribute serialization", () => {
    expect(
      serializeWoundStateAttributeValue({
        field: {
          dataType: "SingleSelectList",
        } as any,
        contextValue: "Minor",
        serializedValue: "Minor",
      })
    ).toBe("Minor");
  });
});
