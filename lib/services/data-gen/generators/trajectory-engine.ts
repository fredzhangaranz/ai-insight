/**
 * Trajectory Engine
 * Pure math for wound area/perimeter/dimensions over time.
 * Ports logic from docs/design/data_generation/old_generation_code/Assessment.cs
 */

import type {
  SingleTrajectoryType,
  TrajectoryDistribution,
  WoundProgressionStyle,
} from "../generation-spec.types";
import { weightedPick } from "./base.generator";

/** Uniform distribution for random trajectory assignment (Tier 2) */
export const UNIFORM_TRAJECTORY_DIST: TrajectoryDistribution = {
  healing: 0.25,
  stable: 0.25,
  deteriorating: 0.25,
  treatmentChange: 0.25,
};

/** Map explicit trajectory type to WoundProgressionStyle */
export function trajectoryTypeToStyle(type: SingleTrajectoryType): WoundProgressionStyle {
  const map: Record<SingleTrajectoryType, WoundProgressionStyle> = {
    healing: "Exponential",
    stable: "JaggedLinear",
    deteriorating: "JaggedFlat",
    treatmentChange: "NPTraditionalDisposable",
  };
  return map[type];
}

export const HEALED_THRESHOLD_CM2 = 0.5;
const AMPUTATION_RATE_EXTREMITY = 0.025;
const RELEASED_RATE_NON_EXTREMITY = 0.1;

/** Anatomy sites that are fingers/toes — higher amputation risk */
const EXTREMITY_ANATOMY_PATTERNS = [
  "finger",
  "thumb",
  "index finger",
  "middle finger",
  "ring finger",
  "little finger",
  "toe",
  "big",
  "second",
  "third",
  "fourth",
  "fifth",
];

export function isAtExtremity(anatomyName: string): boolean {
  const lower = anatomyName.toLowerCase();
  return EXTREMITY_ANATOMY_PATTERNS.some((p) => lower.includes(p));
}

/** Perimeter from area: circle-based, scaled 1.0–1.5 (from old C# Assessment.cs line 186) */
export function perimeterFromArea(area: number): number {
  const circlePerimeter = Math.sqrt(4 * Math.PI * area);
  return circlePerimeter * (1.0 + Math.random() * 0.5);
}

/** Derive length/width from area using ellipse model */
export function dimensionsFromArea(area: number): {
  lengthAxisLength: number;
  widthAxisLength: number;
} {
  const aspectRatio = 1.2 + Math.random() * 0.8;
  const lengthAxisLength = Math.sqrt((area * aspectRatio * 4) / Math.PI);
  const widthAxisLength = lengthAxisLength / aspectRatio;
  return { lengthAxisLength, widthAxisLength };
}

/** Map trajectory distribution to WoundProgressionStyle */
export function pickProgressionStyle(
  dist: TrajectoryDistribution
): WoundProgressionStyle {
  const weights: Record<WoundProgressionStyle, number> = {
    Exponential: dist.healing,
    JaggedLinear: dist.stable,
    JaggedFlat: dist.deteriorating,
    NPTraditionalDisposable: dist.treatmentChange,
    NPDisposable: 0,
  };
  return weightedPick(weights);
}

function measurementJaggedLinear(
  lastArea: number,
  baselineArea: number
): number {
  const linearDecreaseDelta = -0.05 + Math.random() * 0.38;
  return Math.max(0, lastArea - linearDecreaseDelta * baselineArea);
}

function measurementExponential(
  lastArea: number,
  baselineArea: number
): number {
  const factor = -0.05 + Math.random() * 0.35;
  const areaDecrease = baselineArea * factor;
  return Math.max(0, lastArea - areaDecrease);
}

function measurementJaggedFlat(lastArea: number, baselineArea: number): number {
  const delta = (Math.random() * 0.2 - 0.1) * baselineArea;
  return Math.max(0, lastArea + delta);
}

export interface TrajectoryInput {
  baselineArea: number;
  progressionStyle: WoundProgressionStyle;
  assessmentCount: number;
  intervalDays: number;
  wobbleDays: number;
  missedAppointmentRate: number;
  baselineDate: Date;
  anatomyName: string;
}

/** Labels emitted by {@link generateTrajectory}; map to tenant AttributeLookup via synonym lists */
export type TrajectoryWoundStateSemantic =
  | "Open"
  | "Healed"
  | "Amputated"
  | "Released from follow-up";

export interface TrajectoryPoint {
  dateTime: Date;
  daysSinceBaseline: number;
  area: number;
  perimeter: number;
  lengthAxisLength: number;
  widthAxisLength: number;
  isBaseline: boolean;
  woundState: TrajectoryWoundStateSemantic;
  treatment: string;
}

/**
 * Generate trajectory points for a wound.
 * Stops when: (a) assessmentCount attended, (b) healed/amputated/released, or (c) maxDays.
 */
export function generateTrajectory(input: TrajectoryInput): TrajectoryPoint[] {
  const {
    baselineArea,
    progressionStyle,
    assessmentCount,
    intervalDays,
    wobbleDays,
    missedAppointmentRate,
    baselineDate,
    anatomyName,
  } = input;

  const maxDays = 365;
  const atExtremity = isAtExtremity(anatomyName);
  const points: TrajectoryPoint[] = [];
  let lastArea = baselineArea;
  let a = 0;
  let attendedCount = 0;

  while (attendedCount < assessmentCount) {
    const wobble = a === 0 ? 0 : (Math.random() - 0.5) * 2 * wobbleDays;
    const daysSinceBaseline = Math.round(a * intervalDays + wobble);
    const dateTime = new Date(baselineDate);
    dateTime.setDate(dateTime.getDate() + daysSinceBaseline);

    if (daysSinceBaseline > maxDays) break;

    let area = baselineArea;
    let treatment = "Simple Bandage";

    if (a > 0) {
      const days = daysSinceBaseline;

      switch (progressionStyle) {
        case "JaggedLinear":
          area = measurementJaggedLinear(lastArea, baselineArea);
          break;
        case "Exponential":
          area = measurementExponential(lastArea, baselineArea);
          break;
        case "JaggedFlat":
          area = measurementJaggedFlat(lastArea, baselineArea);
          if (days > 7 * 15 && Math.random() < 0.25) {
            area = measurementJaggedLinear(lastArea, baselineArea);
          }
          break;
        case "NPTraditionalDisposable":
          if (days < 50) {
            treatment = "Simple Bandage";
            area = measurementJaggedFlat(lastArea, baselineArea);
          } else if (days < 75) {
            treatment = "Traditional Negative Pressure";
            area = measurementExponential(lastArea, baselineArea);
          } else if (days < 110) {
            treatment = "Disposable Negative Pressure";
            area = measurementJaggedLinear(lastArea, baselineArea);
          } else {
            treatment = "Simple Bandage";
            area = measurementJaggedLinear(lastArea, baselineArea);
          }
          break;
        case "NPDisposable":
          if (days < 30) {
            treatment = "Simple Bandage";
            area = measurementJaggedFlat(lastArea, baselineArea);
          } else if (days < 75) {
            treatment = "Disposable Negative Pressure";
            area = measurementJaggedLinear(lastArea, baselineArea);
          } else {
            treatment = "Simple Bandage";
            area = measurementJaggedLinear(lastArea, baselineArea);
          }
          break;
      }

      if (area <= HEALED_THRESHOLD_CM2) {
        area = 0;
        const dims = dimensionsFromArea(lastArea);
        points.push({
          dateTime,
          daysSinceBaseline,
          area: 0,
          perimeter: 0,
          lengthAxisLength: dims.lengthAxisLength,
          widthAxisLength: dims.widthAxisLength,
          isBaseline: false,
          woundState: "Healed",
          treatment,
        });
        break;
      }

      if (atExtremity && Math.random() < AMPUTATION_RATE_EXTREMITY) {
        const dims = dimensionsFromArea(lastArea);
        points.push({
          dateTime,
          daysSinceBaseline,
          area: lastArea,
          perimeter: perimeterFromArea(lastArea),
          lengthAxisLength: dims.lengthAxisLength,
          widthAxisLength: dims.widthAxisLength,
          isBaseline: false,
          woundState: "Amputated",
          treatment,
        });
        break;
      }

      if (!atExtremity && Math.random() < RELEASED_RATE_NON_EXTREMITY) {
        const dims = dimensionsFromArea(lastArea);
        points.push({
          dateTime,
          daysSinceBaseline,
          area: lastArea,
          perimeter: perimeterFromArea(lastArea),
          lengthAxisLength: dims.lengthAxisLength,
          widthAxisLength: dims.widthAxisLength,
          isBaseline: false,
          woundState: "Released from follow-up",
          treatment,
        });
        break;
      }
    }

    const attended = a === 0 || Math.random() > missedAppointmentRate;
    if (attended) {
      const perimeter = area > 0 ? perimeterFromArea(area) : 0;
      const dims = area > 0 ? dimensionsFromArea(area) : { lengthAxisLength: 0, widthAxisLength: 0 };
      points.push({
        dateTime,
        area,
        perimeter,
        lengthAxisLength: dims.lengthAxisLength,
        widthAxisLength: dims.widthAxisLength,
        daysSinceBaseline,
        isBaseline: a === 0,
        woundState: a === 0 ? "Open" : "Open",
        treatment: a === 0 ? "Simple Bandage" : treatment,
      });
      attendedCount++;
    }

    lastArea = area;
    if (area <= 0) break;
    a++;
  }

  return points;
}
