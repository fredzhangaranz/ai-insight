/**
 * Unit tests for trajectory-selector.ts
 * Covers Tier 1 (single trajectory), Tier 2 (explicit assignments), Tier 3 (randomised).
 */

import { describe, it, expect } from "vitest";
import {
  selectRequiredTrajectories,
  TRAJECTORY_TYPE_TO_STYLE,
  ALL_PROGRESSION_STYLES,
} from "../trajectory-selector";

describe("trajectory-selector", () => {
  describe("TRAJECTORY_TYPE_TO_STYLE mapping", () => {
    it("maps healing to Exponential", () => {
      expect(TRAJECTORY_TYPE_TO_STYLE.healing).toBe("Exponential");
    });
    it("maps stable to JaggedFlat", () => {
      expect(TRAJECTORY_TYPE_TO_STYLE.stable).toBe("JaggedFlat");
    });
    it("maps deteriorating to JaggedLinear", () => {
      expect(TRAJECTORY_TYPE_TO_STYLE.deteriorating).toBe("JaggedLinear");
    });
    it("maps treatmentChange to NPTraditionalDisposable", () => {
      expect(TRAJECTORY_TYPE_TO_STYLE.treatmentChange).toBe("NPTraditionalDisposable");
    });
  });

  describe("Tier 1: Single trajectory (1 wound, 1 selected type)", () => {
    it("returns 1 profile for healing (Fast healing)", () => {
      const result = selectRequiredTrajectories(["healing"]);
      expect(result.selectedStyles).toEqual(["Exponential"]);
      expect(result.isRandomised).toBe(false);
      expect(result.description).toContain("Single trajectory");
      expect(result.description).toContain("healing");
      expect(result.description).toContain("Exponential");
    });

    it("returns 1 profile for stable (Slow healing)", () => {
      const result = selectRequiredTrajectories(["stable"]);
      expect(result.selectedStyles).toEqual(["JaggedFlat"]);
      expect(result.isRandomised).toBe(false);
      expect(result.description).toContain("Single trajectory");
    });

    it("returns 1 profile for deteriorating (Non-healing)", () => {
      const result = selectRequiredTrajectories(["deteriorating"]);
      expect(result.selectedStyles).toEqual(["JaggedLinear"]);
      expect(result.isRandomised).toBe(false);
    });

    it("returns 1 profile for treatmentChange", () => {
      const result = selectRequiredTrajectories(["treatmentChange"]);
      expect(result.selectedStyles).toEqual(["NPTraditionalDisposable"]);
      expect(result.isRandomised).toBe(false);
    });
  });

  describe("Tier 2: Explicit per-wound assignments (multiple wounds)", () => {
    it("deduplicates when same trajectory assigned to multiple wounds", () => {
      const result = selectRequiredTrajectories(["healing", "healing"]);
      expect(result.selectedStyles).toEqual(["Exponential"]);
      expect(result.selectedStyles).toHaveLength(1);
      expect(result.isRandomised).toBe(false);
      expect(result.description).toContain("Multiple wounds assigned");
    });

    it("returns 2 profiles when 2 different trajectories assigned", () => {
      const result = selectRequiredTrajectories(["healing", "stable"]);
      expect(result.selectedStyles).toHaveLength(2);
      expect(result.selectedStyles).toContain("Exponential");
      expect(result.selectedStyles).toContain("JaggedFlat");
      expect(result.isRandomised).toBe(false);
      expect(result.description).toContain("healing");
      expect(result.description).toContain("stable");
    });

    it("returns 3 profiles when 3 different trajectories assigned", () => {
      const result = selectRequiredTrajectories(["healing", "stable", "deteriorating"]);
      expect(result.selectedStyles).toHaveLength(3);
      expect(result.selectedStyles).toContain("Exponential");
      expect(result.selectedStyles).toContain("JaggedFlat");
      expect(result.selectedStyles).toContain("JaggedLinear");
      expect(result.isRandomised).toBe(false);
    });

    it("returns 4 profiles when all 4 types assigned across wounds", () => {
      const result = selectRequiredTrajectories([
        "healing",
        "stable",
        "deteriorating",
        "treatmentChange",
      ]);
      expect(result.selectedStyles).toHaveLength(4);
      expect(result.selectedStyles).toEqual(expect.arrayContaining(ALL_PROGRESSION_STYLES));
      expect(result.isRandomised).toBe(false);
    });

    it("deduplicates mixed assignments", () => {
      const result = selectRequiredTrajectories(["healing", "stable", "healing"]);
      expect(result.selectedStyles).toHaveLength(2);
      expect(result.selectedStyles).toContain("Exponential");
      expect(result.selectedStyles).toContain("JaggedFlat");
    });
  });

  describe("Tier 3: Randomised per patient", () => {
    it("returns all 4 profiles when randomisePerPatient is true", () => {
      const result = selectRequiredTrajectories(undefined, true);
      expect(result.selectedStyles).toEqual(ALL_PROGRESSION_STYLES);
      expect(result.selectedStyles).toHaveLength(4);
      expect(result.isRandomised).toBe(true);
      expect(result.description).toContain("Randomised per patient");
      expect(result.description).toContain("all trajectory types needed");
    });

    it("ignores trajectoryAssignments when randomisePerPatient is true", () => {
      const result = selectRequiredTrajectories(["healing"], true);
      expect(result.selectedStyles).toEqual(ALL_PROGRESSION_STYLES);
      expect(result.selectedStyles).toHaveLength(4);
      expect(result.isRandomised).toBe(true);
    });
  });

  describe("Fallback / edge cases", () => {
    it("returns all 4 profiles when no selection provided (backward compat)", () => {
      const result = selectRequiredTrajectories();
      expect(result.selectedStyles).toEqual(ALL_PROGRESSION_STYLES);
      expect(result.selectedStyles).toHaveLength(4);
      expect(result.isRandomised).toBe(false);
      expect(result.description).toBe("No selection made; generating all trajectory types");
    });

    it("returns all 4 profiles when trajectoryAssignments is empty array", () => {
      const result = selectRequiredTrajectories([]);
      expect(result.selectedStyles).toEqual(ALL_PROGRESSION_STYLES);
      expect(result.selectedStyles).toHaveLength(4);
      expect(result.description).toBe("No selection made; generating all trajectory types");
    });

    it("returns all 4 profiles when trajectoryAssignments is undefined and randomise is false", () => {
      const result = selectRequiredTrajectories(undefined, false);
      expect(result.selectedStyles).toEqual(ALL_PROGRESSION_STYLES);
      expect(result.selectedStyles).toHaveLength(4);
    });
  });
});
