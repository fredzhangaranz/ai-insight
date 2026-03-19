/**
 * Schema introspection service.
 * Queries INFORMATION_SCHEMA and sys catalog for table/column/FK metadata.
 */

import type { ConnectionPool } from "mssql";

export interface ColumnSchema {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  fkRef: { schema: string; table: string; column: string } | null;
}

export interface TableSchema {
  schema: string;
  table: string;
  columns: ColumnSchema[];
}

const COLUMNS_QUERY = `
  SELECT
    c.TABLE_SCHEMA,
    c.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.IS_NULLABLE,
    c.CHARACTER_MAXIMUM_LENGTH
  FROM INFORMATION_SCHEMA.COLUMNS c
  WHERE c.TABLE_SCHEMA = @schema
  ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
`;

const PK_QUERY = `
  SELECT
    tc.TABLE_SCHEMA,
    tc.TABLE_NAME,
    kcu.COLUMN_NAME
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    AND tc.TABLE_NAME = kcu.TABLE_NAME
  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    AND tc.TABLE_SCHEMA = @schema
`;

const FK_QUERY = `
  SELECT
    OBJECT_SCHEMA_NAME(fk.parent_object_id) AS schema_name,
    OBJECT_NAME(fk.parent_object_id) AS table_name,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
    OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS ref_schema,
    OBJECT_NAME(fk.referenced_object_id) AS ref_table,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ref_column
  FROM sys.foreign_keys fk
  JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
  WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = @schema
`;

function normalizeRowKey(row: Record<string, unknown>, key: string): string {
  const v = row[key] ?? row[key.toLowerCase()] ?? row[key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")];
  return v != null ? String(v) : "";
}

/**
 * Introspect schema and return structured table/column metadata.
 * When allowlist is undefined, returns all tables in the schema.
 */
export async function introspectSchema(
  pool: ConnectionPool,
  schema: "dbo" | "rpt",
  allowlist?: readonly string[]
): Promise<TableSchema[]> {
  const schemaParam = schema;

  const [columnsResult, pkResult, fkResult] = await Promise.all([
    pool.request().input("schema", schemaParam).query(COLUMNS_QUERY),
    pool.request().input("schema", schemaParam).query(PK_QUERY),
    pool.request().input("schema", schemaParam).query(FK_QUERY),
  ]);

  const rows = columnsResult.recordset ?? [];
  const pkSet = new Set<string>();
  for (const r of pkResult.recordset ?? []) {
    const s = normalizeRowKey(r as Record<string, unknown>, "TABLE_SCHEMA");
    const t = normalizeRowKey(r as Record<string, unknown>, "TABLE_NAME");
    const c = normalizeRowKey(r as Record<string, unknown>, "COLUMN_NAME");
    pkSet.add(`${s}.${t}.${c}`);
  }

  const fkMap = new Map<string, { schema: string; table: string; column: string }>();
  for (const r of fkResult.recordset ?? []) {
    const row = r as Record<string, unknown>;
    const schemaName = normalizeRowKey(row, "schema_name");
    const tableName = normalizeRowKey(row, "table_name");
    const columnName = normalizeRowKey(row, "column_name");
    const refSchema = normalizeRowKey(row, "ref_schema");
    const refTable = normalizeRowKey(row, "ref_table");
    const refColumn = normalizeRowKey(row, "ref_column");
    fkMap.set(`${schemaName}.${tableName}.${columnName}`, {
      schema: refSchema,
      table: refTable,
      column: refColumn,
    });
  }

  const tableMap = new Map<string, ColumnSchema[]>();

  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const tableSchema = normalizeRowKey(row, "TABLE_SCHEMA");
    const tableName = normalizeRowKey(row, "TABLE_NAME");
    const columnName = normalizeRowKey(row, "COLUMN_NAME");

    if (allowlist && allowlist.length > 0 && !allowlist.includes(tableName)) {
      continue;
    }

    const dataType = normalizeRowKey(row, "DATA_TYPE");
    const isNullable = (normalizeRowKey(row, "IS_NULLABLE") || "").toUpperCase() === "YES";
    const charLen = row.CHARACTER_MAXIMUM_LENGTH ?? row.character_maximum_length;
    const typeStr =
      typeof charLen === "number" && Number.isFinite(charLen) && charLen > 0
        ? `${dataType}(${charLen})`
        : dataType;

    const pkKey = `${tableSchema}.${tableName}.${columnName}`;
    const fkKey = `${tableSchema}.${tableName}.${columnName}`;

    const col: ColumnSchema = {
      name: columnName,
      dataType: typeStr,
      isNullable,
      isPrimaryKey: pkSet.has(pkKey),
      fkRef: fkMap.get(fkKey) ?? null,
    };

    const tableKey = `${tableSchema}.${tableName}`;
    if (!tableMap.has(tableKey)) {
      tableMap.set(tableKey, []);
    }
    tableMap.get(tableKey)!.push(col);
  }

  const tables: TableSchema[] = [];
  for (const [tableKey, columns] of tableMap) {
    const [schemaName, tableName] = tableKey.split(".");
    tables.push({
      schema: schemaName,
      table: tableName,
      columns,
    });
  }

  tables.sort((a, b) => a.table.localeCompare(b.table));
  return tables;
}
