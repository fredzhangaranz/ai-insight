// lib/services/semantic/schema-discovery.service.ts
// Schema Discovery Service - Queries actual customer database schema
// Provides fuzzy matching for field names to avoid hardcoded assumptions

import { executeCustomerQuery } from "./customer-query.service";

export interface TableColumn {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
}

export interface TableSchema {
  tableName: string;
  columns: TableColumn[];
}

// In-memory cache: customerId -> schema
const schemaCache = new Map<string, { schema: TableSchema[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * Get schema for specific tables in customer database
 */
export async function getTableSchema(
  customerId: string,
  tableNames: string[]
): Promise<TableSchema[]> {
  // Check cache first
  const cached = schemaCache.get(customerId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Filter cached schema for requested tables
    return cached.schema.filter((table) =>
      tableNames.some((name) => name.toLowerCase() === table.tableName.toLowerCase())
    );
  }

  // Query schema from database
  const schema = await queryCustomerSchema(customerId);

  // Cache the full schema
  schemaCache.set(customerId, { schema, timestamp: Date.now() });

  // Return filtered schema
  return schema.filter((table) =>
    tableNames.some((name) => name.toLowerCase() === table.tableName.toLowerCase())
  );
}

/**
 * Query customer database schema using INFORMATION_SCHEMA
 */
async function queryCustomerSchema(customerId: string): Promise<TableSchema[]> {
  const schemaQuery = `
    SELECT
      TABLE_SCHEMA + '.' + TABLE_NAME AS TableName,
      COLUMN_NAME AS ColumnName,
      DATA_TYPE AS DataType,
      IS_NULLABLE AS IsNullable
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'rpt'
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `;

  try {
    const result = await executeCustomerQuery(customerId, schemaQuery);

    // Group columns by table
    const tableMap = new Map<string, TableColumn[]>();

    for (const row of result.rows) {
      const tableName = row.TableName;
      const column: TableColumn = {
        tableName,
        columnName: row.ColumnName,
        dataType: row.DataType,
        isNullable: row.IsNullable === 'YES',
      };

      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, []);
      }
      tableMap.get(tableName)!.push(column);
    }

    // Convert to array of TableSchema
    return Array.from(tableMap.entries()).map(([tableName, columns]) => ({
      tableName,
      columns,
    }));
  } catch (error) {
    console.error(`[SchemaDiscovery] Failed to query schema for customer ${customerId}:`, error);
    // Return empty schema on error - caller should handle gracefully
    return [];
  }
}

/**
 * Find best matching column name using fuzzy matching
 *
 * @param desiredColumn - The column name we want (e.g., "CreatedDate")
 * @param availableColumns - Actual columns in the table
 * @returns Best matching column name or null if no match
 */
export function fuzzyMatchColumn(
  desiredColumn: string,
  availableColumns: TableColumn[]
): string | null {
  const desiredLower = desiredColumn.toLowerCase();

  // Strategy 1: Exact match (case-insensitive)
  const exactMatch = availableColumns.find(
    (col) => col.columnName.toLowerCase() === desiredLower
  );
  if (exactMatch) {
    return exactMatch.columnName;
  }

  // Strategy 2: Contains match (e.g., "created" matches "AssessmentCreatedDate")
  const containsMatch = availableColumns.find((col) =>
    col.columnName.toLowerCase().includes(desiredLower) ||
    desiredLower.includes(col.columnName.toLowerCase())
  );
  if (containsMatch) {
    return containsMatch.columnName;
  }

  // Strategy 3: Semantic equivalents
  const semanticMatches: Record<string, string[]> = {
    createddate: ["assessmentdate", "entrydate", "createdat", "dateadded", "datecreated"],
    modifieddate: ["modifiedat", "updatedat", "lastupdated", "datemodified"],
    status: ["assessmentstatus", "currentstatus", "state"],
    id: ["assessmentid", "patientid", "woundid", "primarykey"],
    name: ["firstname", "lastname", "patientname", "fullname"],
    count: ["total", "recordcount", "numberof"],
  };

  const semanticEquivalents = semanticMatches[desiredLower] || [];
  for (const equivalent of semanticEquivalents) {
    const match = availableColumns.find(
      (col) => col.columnName.toLowerCase() === equivalent
    );
    if (match) {
      return match.columnName;
    }
  }

  // Strategy 4: Partial word match (e.g., "date" matches "AssessmentDate")
  if (desiredLower.includes("date")) {
    const dateColumn = availableColumns.find((col) =>
      col.columnName.toLowerCase().includes("date") &&
      (col.dataType.toLowerCase().includes("date") ||
       col.dataType.toLowerCase().includes("time"))
    );
    if (dateColumn) {
      return dateColumn.columnName;
    }
  }

  // Strategy 5: Data type based matching
  if (desiredLower.includes("date") || desiredLower.includes("time")) {
    const dateTypeColumn = availableColumns.find((col) =>
      col.dataType.toLowerCase().includes("date") ||
      col.dataType.toLowerCase().includes("time")
    );
    if (dateTypeColumn) {
      return dateTypeColumn.columnName;
    }
  }

  // No match found
  return null;
}

/**
 * Find all date columns in a table (useful for time-based queries)
 */
export function findDateColumns(availableColumns: TableColumn[]): string[] {
  return availableColumns
    .filter(
      (col) =>
        col.dataType.toLowerCase().includes("date") ||
        col.dataType.toLowerCase().includes("time") ||
        col.columnName.toLowerCase().includes("date")
    )
    .map((col) => col.columnName);
}

/**
 * Find primary key or ID column in a table
 */
export function findPrimaryKeyColumn(
  tableName: string,
  availableColumns: TableColumn[]
): string | null {
  // Common ID patterns
  const idPatterns = [
    `${tableName.split('.').pop()}id`, // e.g., PatientId for rpt.Patient
    "id",
    "primarykey",
    "pk",
  ];

  for (const pattern of idPatterns) {
    const match = availableColumns.find(
      (col) => col.columnName.toLowerCase() === pattern.toLowerCase()
    );
    if (match) {
      return match.columnName;
    }
  }

  // Fallback: First column with "id" in name
  const idColumn = availableColumns.find((col) =>
    col.columnName.toLowerCase().includes("id")
  );

  return idColumn ? idColumn.columnName : null;
}

/**
 * Clear schema cache for a customer (useful for testing or after schema changes)
 */
export function clearSchemaCache(customerId?: string) {
  if (customerId) {
    schemaCache.delete(customerId);
  } else {
    schemaCache.clear();
  }
}
