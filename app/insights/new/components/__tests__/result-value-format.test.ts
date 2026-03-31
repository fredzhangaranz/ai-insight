import { describe, expect, it } from "vitest";
import { formatResultValue } from "../result-value-format";

describe("formatResultValue", () => {
  it("formats numeric decimals with exactly two fractional digits", () => {
    expect(formatResultValue(12.3456)).toBe("12.35");
    expect(formatResultValue("7.1")).toBe("7.10");
  });

  it("keeps plain date strings unchanged", () => {
    expect(formatResultValue("2026-03-31")).toBe("2026-03-31");
  });

  it("removes midnight time from ISO timestamps", () => {
    expect(formatResultValue("2026-03-31T00:00:00.000Z")).toBe("2026-03-31");
  });

  it("keeps the time when the timestamp has a real time portion", () => {
    expect(formatResultValue("2026-03-31T15:45:00.000Z")).toBe(
      "2026-03-31T15:45:00.000Z"
    );
  });

  it("always shows birth date columns as date-only when an ISO date is present", () => {
    expect(
      formatResultValue("1960-01-01T13:00:00+13:00", "patientDateOfBirth")
    ).toBe("1960-01-01");
  });
});
