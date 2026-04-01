// lib/services/semantic/customer-query.service.ts
// Service for executing SQL queries against customer databases

import * as sql from "mssql";
import type { ConnectionPool } from "mssql";
import { getCustomerById } from "../customer-service";
import { decryptConnectionString } from "../security/connection-encryption.service";
import { parseSqlServerConnectionString } from "@/lib/utils/sqlserver";
import { normalizeSqlForValidation } from "@/lib/utils/sql-cleaning";

type SqlRecordset = Array<any> & { columns?: Record<string, unknown> };
type SqlQueryResultLike = {
  recordset?: SqlRecordset;
  recordsets?: SqlRecordset[];
  columns?: Record<string, unknown>;
};

interface TableColumnMetadata {
  columnName: string;
  dataType: string;
}

const ALIASES_TO_BRACKET = new Set(["is"]);

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractQueryRowsAndColumns(result: unknown): {
  rows: any[];
  columns: string[];
} {
  const anyResult = (result || {}) as SqlQueryResultLike;
  const recordsets = Array.isArray(anyResult.recordsets)
    ? anyResult.recordsets
    : [];

  let selectedRecordset: SqlRecordset | undefined = anyResult.recordset;

  // Batch queries can emit an initial empty resultset (e.g. session-context setup).
  // Prefer the latest non-empty recordset, otherwise the last available one.
  if ((!selectedRecordset || selectedRecordset.length === 0) && recordsets.length > 0) {
    selectedRecordset =
      [...recordsets].reverse().find((set) => Array.isArray(set) && set.length > 0) ||
      recordsets[recordsets.length - 1];
  }

  const rows = Array.isArray(selectedRecordset)
    ? selectedRecordset.map((row) => row)
    : [];

  if (rows.length > 0) {
    return {
      rows,
      columns: Object.keys(rows[0]),
    };
  }

  const selectedColumns = selectedRecordset?.columns
    ? Object.keys(selectedRecordset.columns)
    : [];
  const batchColumns = anyResult.columns ? Object.keys(anyResult.columns) : [];
  const lastRecordsetColumns =
    recordsets.length > 0 && recordsets[recordsets.length - 1]?.columns
      ? Object.keys(recordsets[recordsets.length - 1].columns as Record<string, unknown>)
      : [];

  return {
    rows,
    columns:
      selectedColumns.length > 0
        ? selectedColumns
        : batchColumns.length > 0
          ? batchColumns
          : lastRecordsetColumns,
  };
}

function extractRptAliasTableMap(sqlQuery: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex =
    /\b(?:FROM|JOIN)\s+rpt\.([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
  const sqlKeywords = new Set([
    "on",
    "where",
    "group",
    "order",
    "having",
    "inner",
    "left",
    "right",
    "full",
    "cross",
    "join",
    "union",
    "offset",
    "fetch",
    "with",
  ]);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(sqlQuery))) {
    const tableName = match[1];
    const aliasCandidate = (match[2] || "").toLowerCase();
    const alias =
      aliasCandidate && !sqlKeywords.has(aliasCandidate)
        ? aliasCandidate
        : tableName.toLowerCase();
    map.set(alias, tableName);
  }
  return map;
}

function sanitizeReservedKeywordAliases(sqlQuery: string): {
  rewrittenSql: string;
  aliases: string[];
} {
  const matchedAliases = new Set<string>();
  const declarationPattern =
    /\b(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_.\[\]]*)(\s+(?:AS\s+)?)([A-Za-z_][A-Za-z0-9_]*)\b/gi;

  let rewrittenSql = sqlQuery.replace(
    declarationPattern,
    (full, clause, tableRef, spacing, alias) => {
      const aliasLower = String(alias).toLowerCase();
      if (!ALIASES_TO_BRACKET.has(aliasLower)) {
        return full;
      }
      matchedAliases.add(aliasLower);
      return `${clause} ${tableRef}${spacing}[${aliasLower}]`;
    }
  );

  for (const aliasLower of matchedAliases) {
    const escapedAlias = escapeRegexLiteral(aliasLower);
    const referencePattern = new RegExp(`\\b${escapedAlias}\\.`, "gi");
    rewrittenSql = rewrittenSql.replace(referencePattern, `[${aliasLower}].`);
  }

  return { rewrittenSql, aliases: Array.from(matchedAliases.values()) };
}

function extractAliasDateReferences(sqlQuery: string): string[] {
  const aliases = new Set<string>();
  const regex = /\b(?:rpt\.)?([A-Za-z_][A-Za-z0-9_]*)\.date\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sqlQuery))) {
    aliases.add(match[1].toLowerCase());
  }
  return Array.from(aliases.values());
}

function extractDimDateAliasLinks(
  sqlQuery: string,
  aliasToTable: Map<string, string>
): Map<string, string> {
  const links = new Map<string, string>();
  const patterns = [
    /\b([A-Za-z_][A-Za-z0-9_]*)\.dimDateFk\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\.id\b/gi,
    /\b([A-Za-z_][A-Za-z0-9_]*)\.id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\.dimDateFk\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sqlQuery))) {
      const leftAlias = match[1].toLowerCase();
      const rightAlias = match[2].toLowerCase();
      const leftTable = aliasToTable.get(leftAlias)?.toLowerCase();
      const rightTable = aliasToTable.get(rightAlias)?.toLowerCase();

      if (rightTable === "dimdate" && leftTable && leftTable !== "dimdate") {
        links.set(leftAlias, rightAlias);
      }
      if (leftTable === "dimdate" && rightTable && rightTable !== "dimdate") {
        links.set(rightAlias, leftAlias);
      }
    }
  }

  return links;
}

function pickBestDateColumn(columns: TableColumnMetadata[]): string | null {
  if (!columns.length) {
    return null;
  }

  const isDateType = (dataType: string) =>
    /(date|time)/i.test(dataType || "");
  const isForeignKeyLike = (columnName: string) => /fk$/i.test(columnName);

  const exact = columns.find((col) => col.columnName.toLowerCase() === "date");
  if (exact) {
    return exact.columnName;
  }

  const dateNamedAndTyped = columns.find(
    (col) =>
      isDateType(col.dataType) &&
      /date|time/i.test(col.columnName) &&
      !isForeignKeyLike(col.columnName)
  );
  if (dateNamedAndTyped) {
    return dateNamedAndTyped.columnName;
  }

  const typed = columns.find(
    (col) => isDateType(col.dataType) && !isForeignKeyLike(col.columnName)
  );
  if (typed) {
    return typed.columnName;
  }

  const dateNamed = columns.find(
    (col) => /date|time/i.test(col.columnName) && !isForeignKeyLike(col.columnName)
  );
  if (dateNamed) {
    return dateNamed.columnName;
  }

  return null;
}

function buildAliasDateExpressionMap(input: {
  sqlQuery: string;
  aliasToTable: Map<string, string>;
  tableColumnsByTable: Map<string, TableColumnMetadata[]>;
}): Record<string, string> {
  const result: Record<string, string> = {};
  const dateAliases = extractAliasDateReferences(input.sqlQuery);
  const dimDateLinks = extractDimDateAliasLinks(input.sqlQuery, input.aliasToTable);

  for (const aliasLower of dateAliases) {
    const tableName = input.aliasToTable.get(aliasLower);
    if (!tableName) {
      continue;
    }
    const columns = input.tableColumnsByTable.get(tableName.toLowerCase()) || [];
    const bestDateColumn = pickBestDateColumn(columns);

    if (bestDateColumn) {
      result[aliasLower] = `${aliasLower}.[${bestDateColumn}]`;
      continue;
    }

    const dimDateAlias = dimDateLinks.get(aliasLower);
    if (dimDateAlias) {
      result[aliasLower] = `${dimDateAlias}.[date]`;
    }
  }

  return result;
}

export function remediateInvalidDateColumnReferences(
  sqlQuery: string,
  tableColumnsByTable: Record<string, TableColumnMetadata[]>
): { rewrittenSql: string; replacements: number } {
  const aliasToTable = extractRptAliasTableMap(sqlQuery);
  const tableColumns = new Map<string, TableColumnMetadata[]>();
  for (const [tableName, columns] of Object.entries(tableColumnsByTable)) {
    tableColumns.set(tableName.toLowerCase(), columns);
  }

  const replacementExpressions = buildAliasDateExpressionMap({
    sqlQuery,
    aliasToTable,
    tableColumnsByTable: tableColumns,
  });

  let rewrittenSql = sqlQuery;
  let replacements = 0;
  for (const [aliasLower, expression] of Object.entries(replacementExpressions)) {
    const pattern = new RegExp(`\\b${aliasLower}\\.date\\b`, "gi");
    const before = rewrittenSql;
    rewrittenSql = rewrittenSql.replace(pattern, expression);
    if (before !== rewrittenSql) {
      replacements += 1;
    }
  }

  return { rewrittenSql, replacements };
}

function extractErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "";
  if (typeof error === "object") {
    const maybe = error as { message?: string; originalError?: { message?: string } };
    return maybe.message || maybe.originalError?.message || "";
  }
  return "";
}

function shouldAttemptInvalidDateRemediation(
  error: unknown,
  sqlQuery: string
): boolean {
  const message = extractErrorMessage(error);
  if (!/invalid column name\s+'date'/i.test(message)) {
    return false;
  }
  return /\b[A-Za-z_][A-Za-z0-9_]*\.date\b/.test(sqlQuery);
}

async function loadTableColumnsForDateRemediation(
  pool: ConnectionPool,
  tableNames: string[]
): Promise<Map<string, TableColumnMetadata[]>> {
  const safeNames = Array.from(new Set(tableNames))
    .map((name) => name.trim())
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));

  if (safeNames.length === 0) {
    return new Map();
  }

  const inClause = safeNames.map((name) => `'${name}'`).join(", ");
  const query = `
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'rpt'
      AND TABLE_NAME IN (${inClause})
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `;

  const rows = await pool.request().query(query);
  const map = new Map<string, TableColumnMetadata[]>();
  for (const row of rows.recordset || []) {
    const tableName = String(row.tableName || "").toLowerCase();
    if (!tableName) continue;
    if (!map.has(tableName)) {
      map.set(tableName, []);
    }
    map.get(tableName)!.push({
      columnName: String(row.columnName || ""),
      dataType: String(row.dataType || ""),
    });
  }
  return map;
}

async function tryRemediateAndRetryInvalidDateColumn(input: {
  pool: ConnectionPool;
  customerId: string;
  sqlQuery: string;
  boundParameters?: Record<string, string | number | boolean | null>;
  error: unknown;
}): Promise<{ rows: any[]; columns: string[] } | null> {
  if (!shouldAttemptInvalidDateRemediation(input.error, input.sqlQuery)) {
    return null;
  }

  const aliasToTable = extractRptAliasTableMap(input.sqlQuery);
  const involvedTables = Array.from(new Set(Array.from(aliasToTable.values())));
  const tableColumnsMap = await loadTableColumnsForDateRemediation(
    input.pool,
    involvedTables
  );

  const tableColumnsByTable: Record<string, TableColumnMetadata[]> = {};
  for (const [table, columns] of tableColumnsMap.entries()) {
    tableColumnsByTable[table] = columns;
  }

  const remediated = remediateInvalidDateColumnReferences(
    input.sqlQuery,
    tableColumnsByTable
  );
  if (remediated.replacements === 0 || remediated.rewrittenSql === input.sqlQuery) {
    return null;
  }

  console.warn("[CustomerQuery] Retrying query after date-column remediation", {
    customerId: input.customerId,
    replacements: remediated.replacements,
  });

  const retryBatch = `SET NOCOUNT ON;\nEXEC sp_set_session_context @key = N'all_access', @value = 1;\n\n${remediated.rewrittenSql}`;
  const request = input.pool.request();
  for (const [key, value] of Object.entries(input.boundParameters || {})) {
    request.input(key, value as any);
  }
  const retryResult = await request.query(retryBatch);
  return extractQueryRowsAndColumns(retryResult);
}

/**
 * Run a callback with a customer's database pool. Pool is created, used, and closed.
 */
export async function withCustomerPool<T>(
  customerId: string,
  fn: (pool: ConnectionPool) => Promise<T>
): Promise<T> {
  const customer = await getCustomerById(customerId, false, true);
  if (!customer) {
    throw new Error(`Customer not found: ${customerId}`);
  }
  if (!customer.dbConnectionEncrypted) {
    throw new Error(
      `Customer ${customerId} does not have a database connection configured`
    );
  }

  const connectionString = decryptConnectionString(customer.dbConnectionEncrypted);
  const parsedConfig = parseSqlServerConnectionString(connectionString);
  const config: sql.config = {
    ...parsedConfig,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      ...parsedConfig.options,
      trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? true,
      requestTimeout: 30000,
      connectTimeout: 15000,
      enableArithAbort: true,
    },
  };

  const pool = new sql.ConnectionPool(config);
  try {
    await pool.connect();
    return await fn(pool);
  } finally {
    await pool.close();
  }
}

/**
 * Execute SQL query against a customer's database
 */
export async function executeCustomerQuery(
  customerId: string,
  sqlQuery: string,
  boundParameters?: Record<string, string | number | boolean | null>
): Promise<{ rows: any[]; columns: string[] }> {
  // 1. Get customer details (including encrypted connection string)
  const customer = await getCustomerById(customerId, false, true);

  if (!customer) {
    throw new Error(`Customer not found: ${customerId}`);
  }

  if (!customer.dbConnectionEncrypted) {
    throw new Error(`Customer ${customerId} does not have a database connection configured`);
  }

  // 2. Decrypt connection string
  const connectionString = decryptConnectionString(customer.dbConnectionEncrypted);

  // 3. Parse connection string and create pool config
  const parsedConfig = parseSqlServerConnectionString(connectionString);

  // Use parsed config but override pool settings and ensure trustServerCertificate is set
  // trustServerCertificate: true is critical for local/dev SQL Server instances with self-signed certs
  const config: sql.config = {
    ...parsedConfig,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      ...parsedConfig.options,
      trustServerCertificate: parsedConfig.options?.trustServerCertificate ?? true, // Ensure self-signed certs are trusted
      requestTimeout: 30000,
      connectTimeout: 15000,
      enableArithAbort: true,
    },
  };

  // 4. Create connection pool and execute query
  const pool = new sql.ConnectionPool(config);

  try {
    await pool.connect();
    console.log("[CustomerQuery] Connected target", {
      customerId,
      database: parsedConfig.database || "unknown",
    });

    // Validate query is read-only (ignore leading comments/whitespace)
    const normalized = normalizeSqlForValidation(sqlQuery);
    const trimmedQuery = normalized.toUpperCase();
    if (!trimmedQuery.startsWith("SELECT") && !trimmedQuery.startsWith("WITH")) {
      // Log the actual query start for debugging
      console.error(
        "[CustomerQuery] Invalid query start. First 200 chars:",
        normalized.slice(0, 200)
      );
      throw new Error("Only SELECT and WITH queries are allowed");
    }

    // Debug aid: log the full query when running in dev to diagnose syntax errors
    if (process.env.NODE_ENV !== "production") {
      console.log("[CustomerQuery] Full SQL Query:", normalized);
      console.log("[CustomerQuery] Query Length:", normalized.length, "chars");
    }

    // Set session context for rpt schema / row-level security (same connection as query)
    const allAccessBatch = `SET NOCOUNT ON;\nEXEC sp_set_session_context @key = N'all_access', @value = 1;\n\n${sqlQuery}`;

    const startExecution = Date.now();
    console.log("[CustomerQuery] Starting query execution (with all_access)...");

    const executeWithParams = async (queryText: string) => {
      const request = pool.request();
      for (const [key, value] of Object.entries(boundParameters || {})) {
        request.input(key, value as any);
      }
      return request.query(queryText);
    };

    try {
      const result = await executeWithParams(allAccessBatch);
      const executionTime = Date.now() - startExecution;
      const { rows, columns } = extractQueryRowsAndColumns(result);

      console.log(
        `[CustomerQuery] ✅ Query completed in ${executionTime}ms, returned ${rows.length} rows`
      );
      return { rows, columns };
    } catch (error) {
      const remediated = await tryRemediateAndRetryInvalidDateColumn({
        pool,
        customerId,
        sqlQuery,
        boundParameters,
        error,
      });
      if (remediated) {
        const executionTime = Date.now() - startExecution;
        console.log(
          `[CustomerQuery] ✅ Query completed after remediation in ${executionTime}ms, returned ${remediated.rows.length} rows`
        );
        return remediated;
      }
      throw error;
    }
  } finally {
    // Always close the pool
    await pool.close();
  }
}

/**
 * Validate and fix common SQL Server issues in generated queries
 * 
 * CRITICAL: Does NOT modify string literals (values in quotes)
 */
export function validateAndFixQuery(sqlQuery: string): string {
  const originalQuery = sqlQuery;
  let fixed = sqlQuery;

  if (process.env.NODE_ENV !== "production") {
    console.log("[validateAndFixQuery] Original query:", originalQuery.slice(0, 500));
  }

  // 1. Add TOP clause if not present to limit results
  if (!fixed.match(/\bTOP\s+\d+\b/i) && !fixed.match(/\bOFFSET\b/i)) {
    if (fixed.match(/\bSELECT\s+DISTINCT\b/i)) {
      fixed = fixed.replace(/\bSELECT\s+DISTINCT\b/i, "SELECT DISTINCT TOP 1000");
    } else {
      fixed = fixed.replace(/\bSELECT\b/i, "SELECT TOP 1000");
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("[validateAndFixQuery] Added TOP clause");
    }
  }

  // 2. Ensure rpt schema prefix for common tables
  // CRITICAL: Only add prefix to table identifiers, NOT to string values
  // Must parse SQL to avoid corrupting WHERE clause values like:
  //   CORRECT: ATV.name IN ('Wound Assessment')
  //   WRONG:   ATV.name IN ('rpt.Wound rpt.Assessment')
  
  const tableNames = ["Assessment", "Patient", "Wound", "Note", "Measurement", "AttributeType", "DimDate", "AssessmentTypeVersion"];
  
  // Split query into tokens, preserving strings
  // We need to avoid replacing inside string literals
  for (const tableName of tableNames) {
    // Only match table names that appear as SQL identifiers (not in strings)
    // This regex uses a more sophisticated approach:
    // - Must be preceded by FROM, JOIN, or whitespace
    // - Must not be inside quotes
    // - Must be followed by space, alias, or SQL keyword
    
    // SAFER APPROACH: Only replace in specific SQL contexts (FROM, JOIN clauses)
    // Pattern: (FROM|JOIN)\s+(tableName)\b
    const fromJoinPattern = new RegExp(
      `(FROM|JOIN)\\s+(?!rpt\\.)${tableName}\\b`,
      "gi"
    );
    
    const beforeFix = fixed;
    fixed = fixed.replace(fromJoinPattern, `$1 rpt.${tableName}`);
    
    if (beforeFix !== fixed && process.env.NODE_ENV !== "production") {
      console.log(`[validateAndFixQuery] Added rpt. prefix to ${tableName} in FROM/JOIN`);
    }
  }

  // 3. Bracket reserved-word aliases (e.g. "IS") to avoid syntax errors
  const aliasSanitized = sanitizeReservedKeywordAliases(fixed);
  if (aliasSanitized.aliases.length > 0) {
    fixed = aliasSanitized.rewrittenSql;
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[validateAndFixQuery] Bracketed reserved aliases: ${aliasSanitized.aliases.join(", ")}`
      );
    }
  }

  if (process.env.NODE_ENV !== "production" && originalQuery !== fixed) {
    console.log("[validateAndFixQuery] Fixed query:", fixed.slice(0, 500));
  }

  return fixed;
}
