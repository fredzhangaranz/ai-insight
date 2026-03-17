import { describe, it, expect } from "vitest";
import {
  COMPOSITION_STRATEGIES,
  type CompositionStrategy,
} from "../sql-composer.service";

describe("sql-composer.service", () => {
  it("exports composition strategy constants", () => {
    expect(COMPOSITION_STRATEGIES.CTE).toBe("cte");
    expect(COMPOSITION_STRATEGIES.MERGED_WHERE).toBe("merged_where");
    expect(COMPOSITION_STRATEGIES.FRESH).toBe("fresh");
  });

  it("CompositionStrategy type accepts strategy values", () => {
    const strategies: CompositionStrategy[] = [
      COMPOSITION_STRATEGIES.CTE,
      COMPOSITION_STRATEGIES.MERGED_WHERE,
      COMPOSITION_STRATEGIES.FRESH,
    ];
    expect(strategies).toHaveLength(3);
  });
});
