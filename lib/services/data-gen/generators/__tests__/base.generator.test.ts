/**
 * Unit tests for base.generator.ts
 */

import { describe, it, expect } from "vitest";
import { generateFieldValue, sampleNormal } from "../base.generator";
import type { FieldSpec } from "../../generation-spec.types";

describe("base.generator", () => {
  describe("generateFieldValue - ageRange", () => {
    it("generates Date for ageRange uniform mode", () => {
      const fieldSpec: FieldSpec = {
        fieldName: "Date of Birth",
        columnName: "dateOfBirth",
        dataType: "Date",
        enabled: true,
        criteria: {
          type: "ageRange",
          mode: "uniform",
          minAge: 60,
          maxAge: 80,
        },
      };

      for (let i = 0; i < 20; i++) {
        const value = generateFieldValue(fieldSpec);
        expect(value).toBeInstanceOf(Date);
        const today = new Date();
        const age = (today.getTime() - (value as Date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        expect(age).toBeGreaterThanOrEqual(59);
        expect(age).toBeLessThanOrEqual(81);
      }
    });

    it("generates Date for ageRange normal mode", () => {
      const fieldSpec: FieldSpec = {
        fieldName: "Date of Birth",
        columnName: "dateOfBirth",
        dataType: "Date",
        enabled: true,
        criteria: {
          type: "ageRange",
          mode: "normal",
          minAge: 60,
          maxAge: 80,
          mean: 70,
          sd: 8,
        },
      };

      for (let i = 0; i < 20; i++) {
        const value = generateFieldValue(fieldSpec);
        expect(value).toBeInstanceOf(Date);
        const today = new Date();
        const age = (today.getTime() - (value as Date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        expect(age).toBeGreaterThanOrEqual(59);
        expect(age).toBeLessThanOrEqual(81);
      }
    });
  });

  describe("sampleNormal", () => {
    it("produces values clustered around mean", () => {
      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(sampleNormal(70, 8));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance =
        samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
      const sd = Math.sqrt(variance);

      expect(mean).toBeGreaterThan(65);
      expect(mean).toBeLessThan(75);
      expect(sd).toBeGreaterThan(5);
      expect(sd).toBeLessThan(12);
    });
  });
});
