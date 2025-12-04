import { describe, expect, it } from "vitest";

import {
  buildPlaceholdersSpec,
  inferIntent,
} from "./seed-template-catalog";

describe("seed-template-catalog helpers", () => {
  it("builds placeholder spec with inferred types and semantics", () => {
    const spec = buildPlaceholdersSpec({
      name: "Test Template",
      sqlPattern: "SELECT 1",
      placeholders: ["patientId", "windowDays", "endDate"],
    });
    expect(spec.slots).toHaveLength(3);

    const patientSlot = spec.slots[0];
    expect(patientSlot.type).toBe("guid");
    expect(patientSlot.semantic).toBe("patient_id");
    expect(patientSlot.required).toBe(true);

    const windowSlot = spec.slots[1];
    expect(windowSlot.type).toBe("int");
    expect(windowSlot.semantic).toBe("time_window");

    const endDateSlot = spec.slots[2];
    expect(endDateSlot.type).toBe("date");
    expect(endDateSlot.semantic).toBe("date");
  });

  it("uses structured placeholder spec when provided", () => {
    const spec = buildPlaceholdersSpec({
      name: "Structured Template",
      sqlPattern: "SELECT 1",
      placeholdersSpec: {
        slots: [
          {
            name: "timePointDays",
            type: "int",
            semantic: "time_window",
            required: true,
            default: 28,
            validators: ["min:1", "max:730"],
          },
        ],
      },
    });

    expect(spec.slots).toHaveLength(1);
    const slot = spec.slots[0];
    expect(slot.name).toBe("timePointDays");
    expect(slot.type).toBe("int");
    expect(slot.semantic).toBe("time_window");
    expect(slot.validators).toEqual(["min:1", "max:730"]);
    expect(slot.default).toBe(28);
  });

  it("infers template intent using keywords and name heuristics", () => {
    expect(
      inferIntent({
        name: "Aggregation by Category",
        sqlPattern: "SELECT",
        keywords: ["aggregate", "group by", "average"],
      })
    ).toBe("aggregation_by_category");

    expect(
      inferIntent({
        name: "Trend Analysis Over Time",
        sqlPattern: "SELECT",
        keywords: ["trend", "time series"],
      })
    ).toBe("time_series_trend");

    expect(
      inferIntent({
        name: "Latest Measurement Per Wound",
        sqlPattern: "SELECT",
        keywords: ["latest", "measurement"],
      })
    ).toBe("latest_per_entity");

    expect(
      inferIntent({
        name: "Unpivot Columns To Rows",
        sqlPattern: "SELECT",
        keywords: ["unpivot"],
      })
    ).toBe("unpivot");

    expect(
      inferIntent({
        name: "Collect Notes",
        sqlPattern: "SELECT",
        keywords: ["note"],
      })
    ).toBe("note_collection");
  });
});
