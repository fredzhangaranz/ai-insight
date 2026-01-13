/**
 * Join Path Planner Service (Phase 5 – Step 4)
 *
 * Builds join paths across SemanticIndexRelationship records by constructing an
 * adjacency graph and running breadth-first search (BFS) to locate the shortest
 * connection between required tables. Returns join conditions with confidence
 * scores so later stages can assemble SQL safely.
 */

import type { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import type {
  JoinCondition,
  JoinPath,
  JoinPathPlanningOptions,
} from "./types";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface RelationshipRow {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  fk_column_name: string | null;
  relationship_type: string | null;
  cardinality: "1:1" | "1:N" | "N:1" | "N:N" | null;
  confidence: number | string | null;
}

interface RelationshipEdge {
  from: string;
  to: string;
  sourceColumn: string;
  targetColumn: string;
  fkColumnName: string | null;
  cardinality: "1:1" | "1:N" | "N:1" | "N:N";
  confidence: number;
}

interface EdgePath {
  edges: RelationshipEdge[];
  start: string;
  end: string;
}

const REL_CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_CONFIDENCE = 1;

class RelationshipCache {
  private cache = new Map<string, CacheEntry<RelationshipRow[]>>();

  get(customerId: string): RelationshipRow[] | null {
    const entry = this.cache.get(customerId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(customerId);
      return null;
    }
    return entry.value;
  }

  set(customerId: string, rows: RelationshipRow[]): void {
    this.cache.set(customerId, {
      value: rows,
      expiresAt: Date.now() + REL_CACHE_TTL,
    });
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }
}

export class JoinPathPlannerService {
  private cache = new RelationshipCache();

  async planJoinPath(
    requiredTables: string[],
    customerId: string,
    options: Partial<JoinPathPlanningOptions> = {}
  ): Promise<JoinPath[]> {
    if (!customerId || !customerId.trim()) {
      throw new Error("[JoinPathPlanner] customerId is required");
    }
    if (!Array.isArray(requiredTables) || requiredTables.length === 0) {
      return [];
    }

    const uniqueTables = Array.from(
      new Set(
        requiredTables
          .map((table) => table?.trim())
          .filter((table): table is string => Boolean(table))
      )
    );

    if (uniqueTables.length <= 1) {
      return [];
    }

    const relationships = await this.loadRelationships(customerId);
    if (relationships.length === 0) {
      console.warn(
        `[JoinPathPlanner] No relationships found for customer ${customerId}`
      );
      return [];
    }

    const graph = this.buildGraph(relationships);
    const detectedStarts = uniqueTables.filter((table) => graph.has(table));
    if (detectedStarts.length === 0) {
      console.warn(
        `[JoinPathPlanner] Required tables ${uniqueTables.join(
          ", "
        )} are missing from relationship graph`
      );
      return [];
    }

    const preferDirect = options.preferDirectJoins !== false;
    const detectCycles = options.detectCycles !== false;

    const startTable = detectedStarts[0];
    const connectedTables = new Set<string>([startTable]);
    const pathMap = new Map<string, JoinPath>();

    for (const targetTable of uniqueTables) {
      if (connectedTables.has(targetTable)) continue;

      const startNodes = Array.from(connectedTables).filter((table) =>
        graph.has(table)
      );
      if (startNodes.length === 0) {
        console.warn(
          `[JoinPathPlanner] No valid start nodes to reach ${targetTable}`
        );
        continue;
      }

      const edgePaths = this.findShortestPaths(
        startNodes,
        targetTable,
        graph,
        detectCycles
      );

      if (edgePaths.length === 0) {
        console.warn(
          `[JoinPathPlanner] Unable to find join path from ${startNodes.join(
            ", "
          )} to ${targetTable}`
        );
        continue;
      }

      const joinPaths = edgePaths.map((edgePath) =>
        this.transformToJoinPath(edgePath)
      );

      joinPaths.sort((a, b) => {
        const lengthCompare = a.joins.length - b.joins.length;
        if (preferDirect && lengthCompare !== 0) {
          return lengthCompare;
        }
        if (!preferDirect && b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        return lengthCompare;
      });

      const preferred = joinPaths[0];
      preferred.isPreferred = true;
      preferred.tables.forEach((table) => connectedTables.add(table));

      for (const path of joinPaths) {
        const key = path.tables.join("->");
        if (!pathMap.has(key)) {
          pathMap.set(key, path);
        }
      }
    }

    this.cache.cleanup();
    return Array.from(pathMap.values()).sort((a, b) => {
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      if (a.joins.length !== b.joins.length) {
        return a.joins.length - b.joins.length;
      }
      return b.confidence - a.confidence;
    });
  }

  private async loadRelationships(customerId: string): Promise<RelationshipRow[]> {
    const cached = this.cache.get(customerId);
    if (cached) return cached;

    const pool = await getInsightGenDbPool();
    const result = await pool.query<RelationshipRow>(
      `
        SELECT
          source_table,
          source_column,
          target_table,
          target_column,
          fk_column_name,
          relationship_type,
          cardinality,
          confidence
        FROM "SemanticIndexRelationship"
        WHERE customer_id = $1
      `,
      [customerId]
    );

    this.cache.set(customerId, result.rows);
    return result.rows;
  }

  private buildGraph(
    rows: RelationshipRow[]
  ): Map<string, RelationshipEdge[]> {
    const graph = new Map<string, RelationshipEdge[]>();

    for (const row of rows) {
      if (!row.source_table || !row.target_table) continue;

      const edge = this.buildEdge(row);
      if (!edge) continue;

      if (!graph.has(edge.from)) {
        graph.set(edge.from, []);
      }
      graph.get(edge.from)!.push(edge);
    }

    return graph;
  }

  private buildEdge(row: RelationshipRow): RelationshipEdge | null {
    const sourceColumn = row.source_column?.trim();
    const targetColumn = row.target_column?.trim();
    if (!sourceColumn || !targetColumn) {
      return null;
    }

    const confidence = this.parseConfidence(row.confidence);
    const cardinality = row.cardinality ?? "1:N";

    return {
      from: row.source_table,
      to: row.target_table,
      sourceColumn,
      targetColumn,
      fkColumnName: row.fk_column_name,
      cardinality,
      confidence,
    };
  }

  private parseConfidence(value: number | string | null): number {
    if (typeof value === "number") {
      return this.clampConfidence(value);
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      if (!Number.isNaN(parsed)) {
        return this.clampConfidence(parsed);
      }
    }
    return DEFAULT_CONFIDENCE;
  }

  private clampConfidence(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_CONFIDENCE;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private findShortestPaths(
    startNodes: string[],
    target: string,
    graph: Map<string, RelationshipEdge[]>,
    detectCycles: boolean
  ): EdgePath[] {
    if (startNodes.includes(target)) {
      return [];
    }

    type QueueState = {
      node: string;
      edges: RelationshipEdge[];
      visited: Set<string>;
      start: string;
    };

    const queue: QueueState[] = [];
    const visitedDepth = new Map<string, number>();
    const results: EdgePath[] = [];
    let shortestLength: number | null = null;

    for (const start of startNodes) {
      queue.push({
        node: start,
        edges: [],
        visited: new Set<string>([start]),
        start,
      });
      visitedDepth.set(start, 0);
    }

    while (queue.length > 0) {
      const state = queue.shift()!;
      const { node, edges, visited, start } = state;

      const neighbors = graph.get(node);
      if (!neighbors || neighbors.length === 0) continue;

      for (const edge of neighbors) {
        const nextNode = edge.to;
        const depth = edges.length + 1;

        if (shortestLength !== null && depth > shortestLength) {
          continue;
        }

        if (detectCycles && visited.has(nextNode)) {
          continue;
        }

        const nextEdges = edges.concat(edge);

        if (nextNode === target) {
          shortestLength = depth;
          results.push({ edges: nextEdges, start, end: target });
          continue;
        }

        const seenDepth = visitedDepth.get(nextNode);
        if (seenDepth !== undefined && seenDepth < depth) {
          continue;
        }
        visitedDepth.set(nextNode, depth);

        const nextVisited = new Set(visited);
        nextVisited.add(nextNode);
        queue.push({
          node: nextNode,
          edges: nextEdges,
          visited: nextVisited,
          start,
        });
      }
    }

    return results;
  }

  private transformToJoinPath(edgePath: EdgePath): JoinPath {
    const tables: string[] = [edgePath.start];
    const joins: JoinCondition[] = [];
    const confidenceValues: number[] = [];

    let currentTable = edgePath.start;

    for (const edge of edgePath.edges) {
      currentTable = edge.to;
      tables.push(currentTable);
      confidenceValues.push(edge.confidence);

      const conditions = this.buildJoinConditions(edge);
      if (conditions.length === 0) continue;

      const condition = conditions.join(" AND ");

      joins.push({
        leftTable: edge.from,
        rightTable: edge.to,
        condition,
        cardinality: edge.cardinality,
      });
    }

    const confidence =
        confidenceValues.length === 0
          ? DEFAULT_CONFIDENCE
          : Math.min(...confidenceValues);

    return {
      path: tables.map((table) => this.tableToEntity(table)),
      tables,
      joins,
      confidence,
    };
  }

  private buildJoinConditions(edge: RelationshipEdge): string[] {
    const leftColumns = edge.sourceColumn
      .split(",")
      .map((col) => col.trim())
      .filter(Boolean);
    const rightColumns = edge.targetColumn
      .split(",")
      .map((col) => col.trim())
      .filter(Boolean);

    if (leftColumns.length === 0 || rightColumns.length === 0) {
      return [];
    }

    const length = Math.min(leftColumns.length, rightColumns.length);
    const conditions: string[] = [];

    for (let index = 0; index < length; index++) {
      const leftColumn = this.qualifyColumn(edge.from, leftColumns[index]);
      const rightColumn = this.qualifyColumn(edge.to, rightColumns[index]);
      conditions.push(`${leftColumn} = ${rightColumn}`);
    }

    return conditions;
  }

  private qualifyColumn(table: string, column: string): string {
    if (column.includes(".")) {
      return column;
    }
    return `${table}.${column}`;
  }

  private tableToEntity(table: string): string {
    if (!table) return table;
    const parts = table.split(".");
    const raw = parts[parts.length - 1];
    if (!raw) return table;
    return raw.replace(/_/g, " ");
  }
}

let instance: JoinPathPlannerService | null = null;

export function getJoinPathPlannerService(): JoinPathPlannerService {
  if (!instance) {
    instance = new JoinPathPlannerService();
  }
  return instance;
}
