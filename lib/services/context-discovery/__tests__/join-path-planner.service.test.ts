/**
 * Unit Tests for Join Path Planner Service (Phase 5 – Task 5)
 *
 * Covers:
 * - Direct two-table joins
 * - Multi-hop join chains (4 tables)
 * - Multiple shortest paths with preference ordering
 * - Graceful handling of unreachable tables
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import { JoinPathPlannerService } from "../join-path-planner.service";

type RelationshipRow = {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  fk_column_name: string | null;
  relationship_type: string | null;
  cardinality: "1:1" | "1:N" | "N:1" | "N:N" | null;
  confidence: number | string | null;
};

describe("JoinPathPlannerService", () => {
  let service: JoinPathPlannerService;
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new JoinPathPlannerService();
    mockPool = {
      query: vi.fn(),
    };
    vi.mocked(getInsightGenDbPool).mockResolvedValue(mockPool as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when fewer than two tables are provided", async () => {
    const result = await service.planJoinPath(["rpt.Patient"], "customer-1");

    expect(result).toEqual([]);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("plans direct join path between Patient and Wound", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        relationshipRow("rpt.Patient", "id", "rpt.Wound", "patientFk", "1:N"),
        relationshipRow("rpt.Wound", "patientFk", "rpt.Patient", "id", "N:1"),
      ],
    });

    const [path] = await service.planJoinPath(
      ["rpt.Patient", "rpt.Wound"],
      "customer-1"
    );

    expect(path).toBeDefined();
    expect(path.tables).toEqual(["rpt.Patient", "rpt.Wound"]);
    expect(path.path).toEqual(["Patient", "Wound"]);
    expect(path.joins).toHaveLength(1);
    expect(path.joins[0]).toMatchObject({
      leftTable: "rpt.Patient",
      rightTable: "rpt.Wound",
      condition: "rpt.Patient.id = rpt.Wound.patientFk",
      cardinality: "1:N",
    });
    expect(path.confidence).toBe(1);
    expect(path.isPreferred).toBe(true);
  });

  it("plans multi-hop join path across Patient → Wound → Assessment → Measurement", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        // Patient ↔ Wound
        relationshipRow("rpt.Patient", "id", "rpt.Wound", "patientFk", "1:N"),
        relationshipRow("rpt.Wound", "patientFk", "rpt.Patient", "id", "N:1"),
        // Wound ↔ Assessment
        relationshipRow(
          "rpt.Wound",
          "id",
          "rpt.Assessment",
          "woundFk",
          "1:N"
        ),
        relationshipRow(
          "rpt.Assessment",
          "woundFk",
          "rpt.Wound",
          "id",
          "N:1"
        ),
        // Assessment ↔ Measurement
        relationshipRow(
          "rpt.Assessment",
          "id",
          "rpt.Measurement",
          "assessmentFk",
          "1:N"
        ),
        relationshipRow(
          "rpt.Measurement",
          "assessmentFk",
          "rpt.Assessment",
          "id",
          "N:1"
        ),
      ],
    });

    const [path] = await service.planJoinPath(
      ["rpt.Patient", "rpt.Measurement"],
      "customer-1"
    );

    expect(path.tables).toEqual([
      "rpt.Patient",
      "rpt.Wound",
      "rpt.Assessment",
      "rpt.Measurement",
    ]);
    expect(path.joins).toHaveLength(3);
    expect(path.joins[0].condition).toBe(
      "rpt.Patient.id = rpt.Wound.patientFk"
    );
    expect(path.joins[2].condition).toBe(
      "rpt.Assessment.id = rpt.Measurement.assessmentFk"
    );
    expect(path.confidence).toBe(1);
  });

  it("returns multiple shortest paths when alternatives have equal length", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        // Path 1: Patient → Wound → Assessment
        relationshipRow("rpt.Patient", "id", "rpt.Wound", "patientFk", "1:N"),
        relationshipRow(
          "rpt.Wound",
          "patientFk",
          "rpt.Patient",
          "id",
          "N:1"
        ),
        relationshipRow(
          "rpt.Wound",
          "id",
          "rpt.Assessment",
          "woundFk",
          "1:N"
        ),
        relationshipRow(
          "rpt.Assessment",
          "woundFk",
          "rpt.Wound",
          "id",
          "N:1"
        ),
        // Path 2: Patient → Episode → Assessment
        relationshipRow(
          "rpt.Patient",
          "id",
          "rpt.Episode",
          "patientFk",
          "1:N"
        ),
        relationshipRow(
          "rpt.Episode",
          "patientFk",
          "rpt.Patient",
          "id",
          "N:1"
        ),
        relationshipRow(
          "rpt.Episode",
          "id",
          "rpt.Assessment",
          "episodeFk",
          "1:N"
        ),
        relationshipRow(
          "rpt.Assessment",
          "episodeFk",
          "rpt.Episode",
          "id",
          "N:1"
        ),
      ],
    });

    const result = await service.planJoinPath(
      ["rpt.Patient", "rpt.Assessment"],
      "customer-1"
    );

    expect(result).toHaveLength(2);
    expect(result[0].joins).toHaveLength(2);
    expect(result[1].joins).toHaveLength(2);
    expect(result[0].isPreferred).toBe(true);
    expect(result[1].isPreferred ?? false).toBe(false);
    const tables = result.map((path) => path.tables.join("->"));
    expect(tables).toEqual([
      "rpt.Patient->rpt.Wound->rpt.Assessment",
      "rpt.Patient->rpt.Episode->rpt.Assessment",
    ]);
  });

  it("returns empty array when joins are unreachable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockPool.query.mockResolvedValueOnce({
      rows: [
        relationshipRow("rpt.Patient", "id", "rpt.Wound", "patientFk", "1:N"),
        relationshipRow("rpt.Wound", "patientFk", "rpt.Patient", "id", "N:1"),
      ],
    });

    const result = await service.planJoinPath(
      ["rpt.Patient", "rpt.Unknown"],
      "customer-1"
    );

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

function relationshipRow(
  source: string,
  sourceColumn: string,
  target: string,
  targetColumn: string,
  cardinality: "1:1" | "1:N" | "N:1" | "N:N",
  confidence: number = 1
): RelationshipRow {
  return {
    source_table: source,
    source_column: sourceColumn,
    target_table: target,
    target_column: targetColumn,
    fk_column_name: `${source}.${sourceColumn}`,
    relationship_type:
      cardinality === "1:N"
        ? "one_to_many"
        : cardinality === "N:1"
        ? "many_to_one"
        : "one_to_one",
    cardinality,
    confidence,
  };
}
