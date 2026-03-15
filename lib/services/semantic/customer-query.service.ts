// lib/services/semantic/customer-query.service.ts
// Service for executing SQL queries against customer databases

import * as sql from "mssql";
import type { ConnectionPool } from "mssql";
import { getCustomerById } from "../customer-service";
import { decryptConnectionString } from "../security/connection-encryption.service";
import { parseSqlServerConnectionString } from "@/lib/utils/sqlserver";
import { normalizeSqlForValidation } from "@/lib/utils/sql-cleaning";

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
    const allAccessBatch = `EXEC sp_set_session_context @key = N'all_access', @value = 1;\n\n${sqlQuery}`;

    const request = pool.request();
    for (const [key, value] of Object.entries(boundParameters || {})) {
      request.input(key, value as any);
    }

    // Execute query
    const startExecution = Date.now();
    console.log("[CustomerQuery] Starting query execution (with all_access)...");
    const result = await request.query(allAccessBatch);
    const executionTime = Date.now() - startExecution;
    
    // Transform result to standard format
    const rows = result.recordset || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    console.log(`[CustomerQuery] ✅ Query completed in ${executionTime}ms, returned ${rows.length} rows`);

    return {
      rows,
      columns,
    };
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

  if (process.env.NODE_ENV !== "production" && originalQuery !== fixed) {
    console.log("[validateAndFixQuery] Fixed query:", fixed.slice(0, 500));
  }

  return fixed;
}
