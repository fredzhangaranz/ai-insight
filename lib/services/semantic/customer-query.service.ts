// lib/services/semantic/customer-query.service.ts
// Service for executing SQL queries against customer databases

import * as sql from "mssql";
import { getCustomerById } from "../customer-service";
import { decryptConnectionString } from "../security/connection-encryption.service";
import { parseSqlServerConnectionString } from "@/lib/utils/sqlserver";

/**
 * Execute SQL query against a customer's database
 */
export async function executeCustomerQuery(
  customerId: string,
  sqlQuery: string
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
    const strippedQuery = stripLeadingComments(sqlQuery).trimStart();
    // Allow leading semicolons/whitespace before the first statement
    const normalized = strippedQuery.replace(/^[\\s;]+/, "");
    const trimmedQuery = normalized.toUpperCase();
    if (!trimmedQuery.startsWith("SELECT") && !trimmedQuery.startsWith("WITH")) {
      throw new Error("Only SELECT and WITH queries are allowed");
    }

    // Debug aid: log the first part of the query when running in dev to diagnose syntax errors
    if (process.env.NODE_ENV !== "production") {
      console.log("[CustomerQuery] Executing SQL (truncated):", normalized.slice(0, 400));
    }

    // Execute query
    const result = await pool.request().query(sqlQuery);

    // Transform result to standard format
    const rows = result.recordset || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

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
 */
export function validateAndFixQuery(sqlQuery: string): string {
  let fixed = sqlQuery;

  // 1. Add TOP clause if not present to limit results
  if (!fixed.match(/\bTOP\s+\d+\b/i) && !fixed.match(/\bOFFSET\b/i)) {
    if (fixed.match(/\bSELECT\s+DISTINCT\b/i)) {
      fixed = fixed.replace(/\bSELECT\s+DISTINCT\b/i, "SELECT DISTINCT TOP 1000");
    } else {
      fixed = fixed.replace(/\bSELECT\b/i, "SELECT TOP 1000");
    }
  }

  // 2. Ensure rpt schema prefix for common tables (only when the match is a standalone identifier)
  const tableRegex =
    /(?<!\w)(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
  fixed = fixed.replace(tableRegex, "rpt.$1");

  return fixed;
}

/**
 * Remove leading SQL comments (line and block) so validation can inspect the first statement keyword.
 */
function stripLeadingComments(sqlQuery: string): string {
  let result = sqlQuery;
  let previous: string;

  // Remove consecutive leading comments/blank lines
  do {
    previous = result;
    result = result
      // Strip leading line comments
      .replace(/^(?:\s*--.*\n)+/u, "")
      // Strip leading block comments
      .replace(/^\s*\/\*[\s\S]*?\*\/\s*/u, "");
  } while (result !== previous);

  return result;
}
