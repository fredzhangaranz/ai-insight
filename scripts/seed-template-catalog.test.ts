import { describe, expect, it } from "vitest";

import {
  buildPlaceholdersSpec,
  inferIntent,
} from "./seed-template-catalog";

describe("seed-template-catalog helpers", () => {
  it("builds placeholder spec with inferred types and semantics", () => {
    const spec = buildPlaceholdersSpec(["patientId", "windowDays", "endDate"]);
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

