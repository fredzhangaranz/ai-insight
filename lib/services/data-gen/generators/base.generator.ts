/**
 * Base generator utilities
 * Shared functions for all data generators
 */

import { randomUUID } from "crypto";
import type { ConnectionPool } from "mssql";
import type { FieldSpec } from "../generation-spec.types";

/**
 * Generate a new GUID for SQL Server
 */
export function newGuid(): string {
  return randomUUID();
}

/**
 * Generate a random alphanumeric string
 */
export function randomAlphaNum(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Weighted random selection
 */
export function weightedPick<T extends string>(
  weights: Record<T, number>
): T {
  const entries = Object.entries(weights) as [T, number][];
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let random = Math.random() * totalWeight;

  for (const [value, weight] of entries) {
    random -= weight;
    if (random <= 0) return value;
  }

  // Fallback to first entry
  return entries[0][0];
}

/**
 * Pick a random value from a range
 */
export function rangePick(
  min: number | string,
  max: number | string
): number | Date {
  if (typeof min === "string" && typeof max === "string") {
    // Date range
    const minDate = new Date(min).getTime();
    const maxDate = new Date(max).getTime();
    const randomTime = minDate + Math.random() * (maxDate - minDate);
    return new Date(randomTime);
  } else {
    // Numeric range
    const minNum = typeof min === "string" ? parseFloat(min) : min;
    const maxNum = typeof max === "string" ? parseFloat(max) : max;
    return minNum + Math.random() * (maxNum - minNum);
  }
}

/**
 * Sample from normal distribution (Box-Muller polar form)
 */
export function sampleNormal(mean: number, sd: number): number {
  let u1: number, u2: number, s: number;
  do {
    u1 = 2 * Math.random() - 1;
    u2 = 2 * Math.random() - 1;
    s = u1 * u1 + u2 * u2;
  } while (s >= 1 || s === 0);
  const factor = Math.sqrt(-2 * Math.log(s) / s);
  return mean + sd * u1 * factor;
}

/**
 * Generate date of birth from age in years (today minus age, with random day-of-year)
 */
function dateFromAge(ageYears: number): Date {
  const today = new Date();
  const year = today.getFullYear() - Math.floor(ageYears);
  const frac = ageYears - Math.floor(ageYears);
  const dayOfYear = Math.floor(frac * 365.25);
  const d = new Date(year, 0, 1);
  d.setDate(d.getDate() + dayOfYear);
  return d;
}

/**
 * Pick N random items from an array
 */
export function pickRandom<T>(items: T[], count: number = 1): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, items.length));
}

/**
 * Generate a field value based on criteria
 */
export function generateFieldValue(
  fieldSpec: FieldSpec,
  faker?: any
): any {
  if (!fieldSpec.enabled) return null;

  const criteria = fieldSpec.criteria;

  switch (criteria.type) {
    case "fixed":
      return criteria.value;

    case "distribution":
      return weightedPick(criteria.weights);

    case "range":
      return rangePick(criteria.min, criteria.max);

    case "ageRange": {
      const { minAge, maxAge, mode } = criteria;
      let age: number;
      if (mode === "uniform") {
        age = minAge + Math.random() * (maxAge - minAge);
      } else {
        const mean = criteria.mean ?? (minAge + maxAge) / 2;
        const sd = criteria.sd ?? (maxAge - minAge) / 6;
        age = sampleNormal(mean, sd);
        age = Math.max(minAge, Math.min(maxAge, age));
      }
      return dateFromAge(age);
    }

    case "options":
      const count = criteria.pickCount || 1;
      const picked = pickRandom(criteria.pickFrom, count);
      return count === 1 ? picked[0] : picked.join(", ");

    case "faker":
      if (!faker) {
        throw new Error("Faker instance required for faker criteria");
      }
      // Parse faker method path (e.g., "person.firstName")
      const parts = criteria.fakerMethod.split(".");
      let fn = faker;
      for (const part of parts) {
        fn = fn[part];
      }
      return typeof fn === "function" ? fn() : fn;

    default:
      return null;
  }
}

/**
 * Batch insert rows into a table
 */
export async function batchInsert(
  db: ConnectionPool,
  tableName: string,
  rows: any[],
  batchSize: number = 100
): Promise<number> {
  if (rows.length === 0) return 0;

  let insertedCount = 0;

  // Get column names from first row
  const columns = Object.keys(rows[0]);
  const columnList = columns.map((col) => `[${col}]`).join(", ");

  // Process in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    // Build VALUES clause
    const valuePlaceholders = batch
      .map((_, batchIdx) => {
        const rowPlaceholders = columns
          .map((_, colIdx) => `@p${i + batchIdx}_${colIdx}`)
          .join(", ");
        return `(${rowPlaceholders})`;
      })
      .join(", ");

    const insertQuery = `
      INSERT INTO ${tableName} (${columnList})
      VALUES ${valuePlaceholders}
    `;

    const request = db.request();

    // Bind parameters
    batch.forEach((row, batchIdx) => {
      columns.forEach((col, colIdx) => {
        const paramName = `p${i + batchIdx}_${colIdx}`;
        request.input(paramName, row[col]);
      });
    });

    await request.query(insertQuery);
    insertedCount += batch.length;
  }

  return insertedCount;
}

/**
 * Distribute items across buckets with given weights
 * Returns array of bucket assignments
 */
export function distributeAcrossBuckets<T>(
  count: number,
  buckets: Record<T, number>
): T[] {
  const entries = Object.entries(buckets) as [T, number][];
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);

  const assignments: T[] = [];
  let remaining = count;

  // Calculate target count for each bucket
  entries.forEach(([value, weight], idx) => {
    const isLast = idx === entries.length - 1;
    const targetCount = isLast
      ? remaining // Last bucket gets all remaining to avoid rounding errors
      : Math.round((weight / totalWeight) * count);

    for (let i = 0; i < targetCount; i++) {
      assignments.push(value);
    }

    remaining -= targetCount;
  });

  // Shuffle to avoid patterns
  return assignments.sort(() => Math.random() - 0.5);
}
