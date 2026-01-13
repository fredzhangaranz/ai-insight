import type { Pool } from "pg";

import { getInsightGenDbPool } from "@/lib/db";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

const RELATIONSHIP_CONFIDENCE = 1;
const SCHEMA_NAME = "rpt";

type ForeignKeyRow = {
  constraintName: string;
  constraintSchema: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
  ordinalPosition: number;
  updateRule: string | null;
  deleteRule: string | null;
};

type UniqueConstraintRow = {
  tableSchema: string;
  tableName: string;
  constraintName: string;
  constraintType: string;
  columnName: string;
};

export type RelationshipDiscoveryOptions = {
  customerId: string;
  connectionString: string;
  discoveryRunId?: string | null;
};

export type RelationshipRecord = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  fkColumnName: string;
  relationshipType: "many_to_one" | "one_to_many" | "one_to_one";
  cardinality: "N:1" | "1:N" | "1:1";
  semanticRelationship: "belongs_to" | "has_many" | "linked_via";
  isUnique: boolean;
  confidence: number;
};

export type RelationshipDiscoveryResult = {
  customerId: string;
  relationships: RelationshipRecord[];
  discoveredRelationships: number;
  oneToManyCount: number;
  manyToOneCount: number;
  oneToOneCount: number;
  warnings: string[];
  errors: string[];
};

type GroupedForeignKey = {
  constraintName: string;
  constraintSchema: string;
  sourceSchema: string;
  sourceTable: string;
  targetSchema: string;
  targetTable: string;
  updateRule: string | null;
  deleteRule: string | null;
  sourceColumns: string[];
  targetColumns: string[];
};

function qualifyTable(schema: string, table: string): string {
  return `${schema}.${table}`;
}

function joinColumns(columns: string[]): string {
  return columns.join(", ");
}

function normaliseColumns(columns: string[]): string {
  return columns
    .map((column) => column.toLowerCase())
    .sort()
    .join("|");
}

function buildRelationshipKey(record: RelationshipRecord): string {
  return [
    record.sourceTable,
    record.sourceColumn,
    record.targetTable,
    record.targetColumn,
    record.fkColumnName,
    record.relationshipType,
  ].join("|");
}

async function fetchUniqueConstraintMap(
  sqlPool: Awaited<ReturnType<typeof getSqlServerPool>>
): Promise<Map<string, Set<string>>> {
  const result = await sqlPool
    .request()
    .query<UniqueConstraintRow>(`
      SELECT
        tc.TABLE_SCHEMA AS tableSchema,
        tc.TABLE_NAME AS tableName,
        tc.CONSTRAINT_NAME AS constraintName,
        tc.CONSTRAINT_TYPE AS constraintType,
        kcu.COLUMN_NAME AS columnName,
        kcu.ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      WHERE tc.TABLE_SCHEMA = '${SCHEMA_NAME}'
        AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE')
      ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `);

  const constraintColumns = new Map<string, string[]>();

  for (const row of result.recordset ?? []) {
    const constraintKey = `${qualifyTable(row.tableSchema, row.tableName)}::${row.constraintName}`;
    const existing = constraintColumns.get(constraintKey);
    if (existing) {
      existing.push(row.columnName);
    } else {
      constraintColumns.set(constraintKey, [row.columnName]);
    }
  }

  const uniqueMap = new Map<string, Set<string>>();

  for (const [constraintKey, columns] of constraintColumns.entries()) {
    const [tableKey] = constraintKey.split("::");
    const normalised = normaliseColumns(columns);
    if (!uniqueMap.has(tableKey)) {
      uniqueMap.set(tableKey, new Set());
    }
    uniqueMap.get(tableKey)!.add(normalised);
  }

  return uniqueMap;
}

async function fetchForeignKeys(
  sqlPool: Awaited<ReturnType<typeof getSqlServerPool>>
): Promise<GroupedForeignKey[]> {
  const result = await sqlPool
    .request()
    .query<ForeignKeyRow>(`
      SELECT
        fk.CONSTRAINT_NAME AS constraintName,
        fk.CONSTRAINT_SCHEMA AS constraintSchema,
        fk.TABLE_SCHEMA AS sourceSchema,
        fk.TABLE_NAME AS sourceTable,
        fk.COLUMN_NAME AS sourceColumn,
        fk.ORDINAL_POSITION AS ordinalPosition,
        pk.TABLE_SCHEMA AS targetSchema,
        pk.TABLE_NAME AS targetTable,
        pk.COLUMN_NAME AS targetColumn,
        rc.UPDATE_RULE AS updateRule,
        rc.DELETE_RULE AS deleteRule
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE fk
        ON fk.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
       AND fk.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pk
        ON pk.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
       AND pk.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA
       AND pk.ORDINAL_POSITION = fk.ORDINAL_POSITION
      WHERE fk.TABLE_SCHEMA = '${SCHEMA_NAME}'
        AND pk.TABLE_SCHEMA = '${SCHEMA_NAME}'
      ORDER BY fk.CONSTRAINT_NAME, fk.ORDINAL_POSITION
    `);

  const grouped = new Map<string, GroupedForeignKey>();

  for (const row of result.recordset ?? []) {
    const key = `${row.constraintSchema}.${row.constraintName}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        constraintName: row.constraintName,
        constraintSchema: row.constraintSchema,
        sourceSchema: row.sourceSchema,
        sourceTable: row.sourceTable,
        targetSchema: row.targetSchema,
        targetTable: row.targetTable,
        updateRule: row.updateRule,
        deleteRule: row.deleteRule,
        sourceColumns: [],
        targetColumns: [],
      });
    }

    const group = grouped.get(key)!;
    group.sourceColumns.push(row.sourceColumn);
    group.targetColumns.push(row.targetColumn);
  }

  return Array.from(grouped.values());
}

function determineUniqueness(
  uniqueConstraintMap: Map<string, Set<string>>,
  tableKey: string,
  columns: string[]
): boolean {
  const constraintSet = uniqueConstraintMap.get(tableKey);
  if (!constraintSet || columns.length === 0) {
    return false;
  }

  const normalised = normaliseColumns(columns);
  return constraintSet.has(normalised);
}

async function persistRelationship(
  pool: Pool,
  customerId: string,
  record: RelationshipRecord,
  discoveryRunId?: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await pool.query(
    `
      DELETE FROM "SemanticIndexRelationship"
      WHERE customer_id = $1
        AND source_table = $2
        AND source_column = $3
        AND target_table = $4
        AND target_column = $5
        AND fk_column_name = $6
    `,
    [
      customerId,
      record.sourceTable,
      record.sourceColumn,
      record.targetTable,
      record.targetColumn,
      record.fkColumnName,
    ]
  );

  await pool.query(
    `
      INSERT INTO "SemanticIndexRelationship" (
        customer_id,
        source_table,
        source_column,
        target_table,
        target_column,
        fk_column_name,
        relationship_type,
        cardinality,
        semantic_relationship,
        confidence,
        discovered_at,
        discovery_run_id,
        metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12
      )
    `,
    [
      customerId,
      record.sourceTable,
      record.sourceColumn,
      record.targetTable,
      record.targetColumn,
      record.fkColumnName,
      record.relationshipType,
      record.cardinality,
      record.semanticRelationship,
      record.confidence,
      discoveryRunId ?? null,
      JSON.stringify(metadata),
    ]
  );
}

export async function discoverEntityRelationships(
  options: RelationshipDiscoveryOptions
): Promise<RelationshipDiscoveryResult> {
  if (!options?.customerId) {
    throw new Error("customerId is required for relationship discovery");
  }
  if (!options?.connectionString) {
    throw new Error("connectionString is required for relationship discovery");
  }

  const sqlServerPool = await getSqlServerPool(options.connectionString);
  const pgPool = await getInsightGenDbPool();

  const uniqueConstraintMap = await fetchUniqueConstraintMap(sqlServerPool);
  const foreignKeys = await fetchForeignKeys(sqlServerPool);

  const warnings: string[] = [];
  const errors: string[] = [];
  const relationships: RelationshipRecord[] = [];
  const processedKeys: string[] = [];

  let oneToManyCount = 0;
  let manyToOneCount = 0;
  let oneToOneCount = 0;
  let hadPersistError = false;

  if (foreignKeys.length === 0) {
    warnings.push("No foreign key relationships discovered for schema 'rpt'");
  }

  for (const fk of foreignKeys) {
    const sourceTableQualified = qualifyTable(fk.sourceSchema, fk.sourceTable);
    const targetTableQualified = qualifyTable(fk.targetSchema, fk.targetTable);
    const sourceColumnsJoined = joinColumns(fk.sourceColumns);
    const targetColumnsJoined = joinColumns(fk.targetColumns);
    const fkColumnName = `${sourceTableQualified}.${sourceColumnsJoined}`;

    const isUnique = determineUniqueness(uniqueConstraintMap, sourceTableQualified, fk.sourceColumns);

    const childToParent: RelationshipRecord = {
      sourceTable: sourceTableQualified,
      sourceColumn: sourceColumnsJoined,
      targetTable: targetTableQualified,
      targetColumn: targetColumnsJoined,
      fkColumnName,
      relationshipType: isUnique ? "one_to_one" : "many_to_one",
      cardinality: isUnique ? "1:1" : "N:1",
      semanticRelationship: "belongs_to",
      isUnique,
      confidence: RELATIONSHIP_CONFIDENCE,
    };

    const parentToChild: RelationshipRecord = {
      sourceTable: targetTableQualified,
      sourceColumn: targetColumnsJoined,
      targetTable: sourceTableQualified,
      targetColumn: sourceColumnsJoined,
      fkColumnName,
      relationshipType: isUnique ? "one_to_one" : "one_to_many",
      cardinality: isUnique ? "1:1" : "1:N",
      semanticRelationship: isUnique ? "linked_via" : "has_many",
      isUnique,
      confidence: RELATIONSHIP_CONFIDENCE,
    };

    const metadata = {
      constraintName: fk.constraintName,
      constraintSchema: fk.constraintSchema,
      sourceColumns: fk.sourceColumns,
      targetColumns: fk.targetColumns,
      updateRule: fk.updateRule,
      deleteRule: fk.deleteRule,
      isUnique,
    };

    try {
      await persistRelationship(pgPool, options.customerId, childToParent, options.discoveryRunId, {
        direction: "child_to_parent",
        ...metadata,
      });
      relationships.push(childToParent);
      processedKeys.push(buildRelationshipKey(childToParent));
      if (childToParent.relationshipType === "one_to_one") {
        oneToOneCount++;
      } else {
        manyToOneCount++;
      }
    } catch (error) {
      hadPersistError = true;
      const message = error instanceof Error ? error.message : "Unknown error persisting child-to-parent relationship";
      errors.push(
        `Failed to persist relationship ${childToParent.sourceTable} -> ${childToParent.targetTable}: ${message}`
      );
    }

    try {
      await persistRelationship(pgPool, options.customerId, parentToChild, options.discoveryRunId, {
        direction: "parent_to_child",
        ...metadata,
      });
      relationships.push(parentToChild);
      processedKeys.push(buildRelationshipKey(parentToChild));
      if (parentToChild.relationshipType === "one_to_one") {
        oneToOneCount++;
      } else {
        oneToManyCount++;
      }
    } catch (error) {
      hadPersistError = true;
      const message = error instanceof Error ? error.message : "Unknown error persisting parent-to-child relationship";
      errors.push(
        `Failed to persist relationship ${parentToChild.sourceTable} -> ${parentToChild.targetTable}: ${message}`
      );
    }
  }

  if (!hadPersistError) {
    if (processedKeys.length > 0) {
      try {
        await pgPool.query(
          `
            DELETE FROM "SemanticIndexRelationship"
            WHERE customer_id = $1
              AND NOT (
                (source_table || '|' || source_column || '|' || target_table || '|' || target_column || '|' || COALESCE(fk_column_name, '') || '|' || relationship_type)
                = ANY($2::text[])
              )
          `,
          [options.customerId, processedKeys]
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error pruning stale relationships";
        errors.push(`Failed to prune stale relationships: ${message}`);
      }
    } else {
      try {
        await pgPool.query(
          `DELETE FROM "SemanticIndexRelationship" WHERE customer_id = $1`,
          [options.customerId]
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error clearing relationships";
        errors.push(`Failed to clear existing relationships: ${message}`);
      }
    }
  }

  return {
    customerId: options.customerId,
    relationships,
    discoveredRelationships: relationships.length,
    oneToManyCount,
    manyToOneCount,
    oneToOneCount,
    warnings,
    errors,
  };
}
