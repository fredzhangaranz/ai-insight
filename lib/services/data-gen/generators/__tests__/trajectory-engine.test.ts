/**
 * Unit tests for trajectory-engine.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateTrajectory,
  pickProgressionStyle,
  perimeterFromArea,
  dimensionsFromArea,
  isAtExtremity,
} from "../trajectory-engine";

function createSeededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe("Trajectory Engine", () => {
  describe("isAtExtremity", () => {
    it("returns true for finger anatomy", () => {
      expect(isAtExtremity("Upper Extremity; Finger; Left; Thumb")).toBe(true);
      expect(isAtExtremity("Upper Extremity; Finger; Right; Index Finger")).toBe(
        true
      );
    });

    it("returns true for toe anatomy", () => {
      expect(isAtExtremity("Lower Extremity; Toe; Left; Big")).toBe(true);
      expect(isAtExtremity("Lower Extremity; Toe; Right; Second")).toBe(true);
    });

    it("returns false for non-extremity anatomy", () => {
      expect(isAtExtremity("Lower Extremity; Heel")).toBe(false);
      expect(isAtExtremity("Trunk; Sacrum")).toBe(false);
    });
  });

  describe("perimeterFromArea", () => {
    it("returns perimeter in range [1.0, 1.5] * circle perimeter", () => {
      const area = 25;
      const circlePerimeter = Math.sqrt(4 * Math.PI * area);

      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(perimeterFromArea(area)).toBeCloseTo(circlePerimeter * 1.0, 5);

      (Math.random as ReturnType<typeof vi.fn>).mockReturnValue(1);
      expect(perimeterFromArea(area)).toBeCloseTo(circlePerimeter * 1.5, 5);
    });
  });

  describe("dimensionsFromArea", () => {
    it("returns length and width consistent with ellipse area", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const area = 50;
      const { lengthAxisLength, widthAxisLength } = dimensionsFromArea(area);
      const ellipseArea = (Math.PI / 4) * lengthAxisLength * widthAxisLength;
      expect(ellipseArea).toBeCloseTo(area, 0);
    });

    it("returns length >= width (major axis >= minor axis)", () => {
      for (let i = 0; i < 10; i++) {
        vi.spyOn(Math, "random").mockReturnValue(i / 10);
        const { lengthAxisLength, widthAxisLength } = dimensionsFromArea(30);
        expect(lengthAxisLength).toBeGreaterThanOrEqual(widthAxisLength);
      }
    });
  });

  describe("generateTrajectory", () => {
    const baseInput = {
      baselineArea: 30,
      progressionStyle: "JaggedLinear" as const,
      assessmentCount: 10,
      intervalDays: 7,
      wobbleDays: 2,
      missedAppointmentRate: 0,
      baselineDate: new Date("2025-01-01T10:00:00Z"),
      anatomyName: "Lower Extremity; Heel",
    };

    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("produces points with count <= assessmentCount", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(999)
      );
      const points = generateTrajectory(baseInput);
      expect(points.length).toBeLessThanOrEqual(baseInput.assessmentCount);
      expect(points.length).toBeGreaterThan(0);
    });

    it("first point has baseline area and isBaseline true", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(100)
      );
      const points = generateTrajectory(baseInput);
      expect(points[0].isBaseline).toBe(true);
      expect(points[0].area).toBe(baseInput.baselineArea);
      expect(points[0].daysSinceBaseline).toBe(0);
    });

    it("baseline area is within input when no terminal state", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(200)
      );
      const points = generateTrajectory({
        ...baseInput,
        baselineArea: 25,
        assessmentCount: 5,
      });
      expect(points[0].area).toBe(25);
    });

    it("perimeter is consistent with area (>= sqrt(4*PI*area))", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(300)
      );
      const points = generateTrajectory(baseInput);
      for (const p of points) {
        if (p.area > 0) {
          const minPerimeter = Math.sqrt(4 * Math.PI * p.area);
          expect(p.perimeter).toBeGreaterThanOrEqual(minPerimeter * 0.99);
        }
      }
    });

    it("lengthAxisLength and widthAxisLength are consistent with area for ellipse", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(400)
      );
      const points = generateTrajectory(baseInput);
      for (const p of points) {
        if (p.area > 0 && p.lengthAxisLength > 0 && p.widthAxisLength > 0) {
          const ellipseArea =
            (Math.PI / 4) * p.lengthAxisLength * p.widthAxisLength;
          expect(ellipseArea).toBeCloseTo(p.area, 0);
        }
      }
    });

    it("Exponential style tends to decrease area over time", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(500)
      );
      const points = generateTrajectory({
        ...baseInput,
        progressionStyle: "Exponential",
        assessmentCount: 8,
      });
      if (points.length >= 2 && points[points.length - 1].woundState === "Open") {
        expect(points[points.length - 1].area).toBeLessThanOrEqual(
          points[0].area * 1.2
        );
      }
    });

    it("JaggedFlat style keeps area near baseline", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(600)
      );
      const points = generateTrajectory({
        ...baseInput,
        progressionStyle: "JaggedFlat",
        assessmentCount: 6,
      });
      const baseline = points[0].area;
      for (const p of points) {
        if (p.woundState === "Open" && p.area > 0) {
          expect(p.area).toBeGreaterThanOrEqual(baseline * 0.5);
          expect(p.area).toBeLessThanOrEqual(baseline * 1.5);
        }
      }
    });

    it("Healed state has area 0", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(() => 0.99);
      const points = generateTrajectory({
        ...baseInput,
        baselineArea: 1,
        assessmentCount: 20,
      });
      const healed = points.find((p) => p.woundState === "Healed");
      if (healed) {
        expect(healed.area).toBe(0);
      }
    });

    it("dates increase with daysSinceBaseline", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(700)
      );
      const points = generateTrajectory(baseInput);
      for (let i = 1; i < points.length; i++) {
        expect(points[i].daysSinceBaseline).toBeGreaterThanOrEqual(
          points[i - 1].daysSinceBaseline
        );
      }
    });

    it("treatment varies by progression style", () => {
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(800)
      );
      const points = generateTrajectory({
        ...baseInput,
        progressionStyle: "NPTraditionalDisposable",
        assessmentCount: 100,
      });
      const treatments = new Set(points.map((p) => p.treatment));
      expect(treatments.size).toBeGreaterThan(1);
    });
  });

  describe("pickProgressionStyle", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns valid style from distribution", () => {
      const dist = {
        healing: 0.25,
        stable: 0.35,
        deteriorating: 0.3,
        treatmentChange: 0.1,
      };
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(
        createSeededRandom(42)
      );
      const style = pickProgressionStyle(dist);
      expect([
        "Exponential",
        "JaggedLinear",
        "JaggedFlat",
        "NPTraditionalDisposable",
      ]).toContain(style);
    });
  });
});
