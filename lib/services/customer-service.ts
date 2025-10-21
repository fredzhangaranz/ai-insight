import { Pool } from "pg";
import * as sql from "mssql";

import { getInsightGenDbPool } from "@/lib/db";
import {
  ConnectionEncryptionError,
  decryptConnectionString,
  encryptConnectionString,
  maskConnectionString,
} from "@/lib/services/security/connection-encryption.service";
import { fetchAttributeSets } from "@/lib/services/discovery/silhouette-discovery.service";
import { parseSqlServerConnectionString } from "@/lib/utils/sqlserver";
import { mapSchemaVersionToSilhouetteVersion } from "@/lib/utils/silhouette-version-mapper";

type CustomerRow = {
  id: string;
  name: string;
  code: string;
  deployment_type: string | null;
  silhouette_version: string;
  silhouette_web_url: string | null;
  db_connection_encrypted: string;
  connection_last_verified_at: string | null;
  connection_status: string | null;
  connection_error: string | null;
  last_discovered_at: string | null;
  discovery_note: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerSummary = {
  id: string;
  name: string;
  code: string;
  deploymentType: string | null;
  silhouetteVersion: string;
  silhouetteWebUrl: string | null;
  connectionMasked: string;
  connectionStatus: string;
  connectionLastVerifiedAt: string | null;
  connectionError?: string | null;
  lastDiscoveredAt: string | null;
  discoveryNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: {
    formsDiscovered: number | null;
    fieldsDiscovered: number | null;
    avgConfidence: number | null;
    lastDiscoveryRunAt: string | null;
  };
};

export type CreateCustomerInput = {
  name: string;
  code: string;
  silhouetteVersion: string;
  deploymentType?: string | null;
  silhouetteWebUrl?: string | null;
  connectionString: string;
  createdBy?: string | null;
  discoveryNote?: string | null;
};

export type UpdateCustomerInput = Partial<{
  name: string;
  silhouetteVersion: string;
  deploymentType: string | null;
  silhouetteWebUrl: string | null;
  connectionString: string | null;
  isActive: boolean;
  discoveryNote: string | null;
  updatedBy: string | null;
}>;

export type TestConnectionResult =
  | {
      status: "ok";
      silhouetteVersionDetected: string | null;
      schemaVersionDetected: string | null;
      details: {
        dboTablesDetected: number;
        rptTablesDetected: number;
      };
    }
  | {
      status: "failed";
      error: string;
    };

type ListOptions = {
  includeStats?: boolean;
  active?: boolean | null;
  version?: string | null;
};

function getDb(): Promise<Pool> {
  return getInsightGenDbPool();
}

function mapCustomerRow(
  row: CustomerRow,
  stats?: CustomerSummary["stats"]
): CustomerSummary {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    deploymentType: row.deployment_type,
    silhouetteVersion: row.silhouette_version,
    silhouetteWebUrl: row.silhouette_web_url,
    connectionMasked: maskStoredConnectionString(row.db_connection_encrypted),
    connectionStatus: row.connection_status ?? "unknown",
    connectionLastVerifiedAt: row.connection_last_verified_at,
    connectionError: row.connection_error,
    lastDiscoveredAt: row.last_discovered_at,
    discoveryNote: row.discovery_note,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stats,
  };
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

async function fetchCustomerByCode(
  pool: Pool,
  code: string
): Promise<CustomerRow | null> {
  const result = await pool.query<CustomerRow>(
    `SELECT *
     FROM "Customer"
     WHERE code = $1
     LIMIT 1`,
    [code]
  );
  return result.rows[0] ?? null;
}

export async function listCustomers(
  options: ListOptions = {}
): Promise<CustomerSummary[]> {
  const pool = await getDb();
  const filters: string[] = [];
  const params: any[] = [];

  if (typeof options.active === "boolean") {
    params.push(options.active);
    filters.push(`c.is_active = $${params.length}`);
  }

  if (options.version) {
    params.push(options.version);
    filters.push(`c.silhouette_version = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const baseQuery = `
    SELECT
      c.*,
      d.forms_discovered,
      d.fields_discovered,
      d.avg_confidence,
      d.completed_at AS last_completed_at
    FROM "Customer" c
    LEFT JOIN LATERAL (
      SELECT
        forms_discovered,
        fields_discovered,
        avg_confidence,
        completed_at
      FROM "CustomerDiscoveryRun"
      WHERE customer_id = c.id
      ORDER BY started_at DESC
      LIMIT 1
    ) d ON TRUE
    ${whereClause}
    ORDER BY c.name ASC
  `;

  const result = await pool.query<
    CustomerRow & {
      forms_discovered: number | null;
      fields_discovered: number | null;
      avg_confidence: number | null;
      last_completed_at: string | null;
    }
  >(baseQuery, params);

  return result.rows.map((row) =>
    mapCustomerRow(
      row,
      options.includeStats
        ? {
            formsDiscovered: row.forms_discovered,
            fieldsDiscovered: row.fields_discovered,
            avgConfidence: row.avg_confidence,
            lastDiscoveryRunAt: row.last_completed_at,
          }
        : undefined
    )
  );
}

export async function getCustomer(
  code: string,
  includeStats = false
): Promise<CustomerSummary | null> {
  const pool = await getDb();
  const row = await fetchCustomerByCode(pool, normaliseCode(code));
  if (!row) return null;

  let stats: CustomerSummary["stats"] | undefined;
  if (includeStats) {
    const statsResult = await pool.query<{
      forms_discovered: number | null;
      fields_discovered: number | null;
      avg_confidence: number | null;
      last_completed_at: string | null;
    }>(
      `SELECT
         forms_discovered,
         fields_discovered,
         avg_confidence,
         completed_at AS last_completed_at
       FROM "CustomerDiscoveryRun"
       WHERE customer_id = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [row.id]
    );
    const statRow = statsResult.rows[0];
    if (statRow) {
      stats = {
        formsDiscovered: statRow.forms_discovered,
        fieldsDiscovered: statRow.fields_discovered,
        avgConfidence: statRow.avg_confidence,
        lastDiscoveryRunAt: statRow.last_completed_at,
      };
    }
  }

  return mapCustomerRow(row, stats);
}

export async function createCustomer(
  input: CreateCustomerInput
): Promise<CustomerSummary> {
  const pool = await getDb();
  const now = new Date().toISOString();
  const encryptedConnection = encryptConnectionString(input.connectionString);
  const createdBy = input.createdBy ?? null;

  const result = await pool.query<CustomerRow>(
    `INSERT INTO "Customer" (
       name,
       code,
       deployment_type,
       silhouette_version,
       silhouette_web_url,
       discovery_note,
       db_connection_encrypted,
       connection_status,
       created_by,
       updated_by,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'unknown', $8, $9, $10, $11)
     RETURNING *`,
    [
      input.name.trim(),
      normaliseCode(input.code),
      input.deploymentType ?? null,
      input.silhouetteVersion.trim(),
      input.silhouetteWebUrl?.trim() ?? null,
      input.discoveryNote ?? null,
      encryptedConnection,
      createdBy,
      createdBy,
      now,
      now,
    ]
  );

  const row = result.rows[0];
  return mapCustomerRow(row);
}

export async function updateCustomer(
  code: string,
  updates: UpdateCustomerInput
): Promise<CustomerSummary | null> {
  if (!Object.keys(updates).length) {
    return getCustomer(code);
  }

  const pool = await getDb();
  const row = await fetchCustomerByCode(pool, normaliseCode(code));
  if (!row) return null;

  const fields: string[] = [];
  const params: any[] = [];

  if (typeof updates.name === "string") {
    params.push(updates.name.trim());
    fields.push(`name = $${params.length}`);
  }

  if (typeof updates.silhouetteVersion === "string") {
    params.push(updates.silhouetteVersion.trim());
    fields.push(`silhouette_version = $${params.length}`);
  }

  if ("deploymentType" in updates) {
    params.push(updates.deploymentType ?? null);
    fields.push(`deployment_type = $${params.length}`);
  }

  if ("silhouetteWebUrl" in updates) {
    params.push(updates.silhouetteWebUrl?.trim() ?? null);
    fields.push(`silhouette_web_url = $${params.length}`);
  }

  if ("discoveryNote" in updates) {
    params.push(updates.discoveryNote ?? null);
    fields.push(`discovery_note = $${params.length}`);
  }

  if (typeof updates.isActive === "boolean") {
    params.push(updates.isActive);
    fields.push(`is_active = $${params.length}`);
  }

  if (updates.connectionString) {
    try {
      const encrypted = encryptConnectionString(updates.connectionString);
      params.push(encrypted);
      fields.push(`db_connection_encrypted = $${params.length}`);
      fields.push(`connection_status = 'unknown'`);
      fields.push(`connection_last_verified_at = NULL`);
      fields.push(`connection_error = NULL`);
    } catch (error) {
      if (error instanceof ConnectionEncryptionError) {
        throw error;
      }
      throw new ConnectionEncryptionError(
        "Failed to encrypt connection string"
      );
    }
  }

  if (updates.updatedBy) {
    params.push(updates.updatedBy);
    fields.push(`updated_by = $${params.length}`);
  }

  params.push(normaliseCode(code));

  if (fields.length === 0) {
    return mapCustomerRow(row);
  }

  const updateQuery = `
    UPDATE "Customer"
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE code = $${params.length}
    RETURNING *
  `;

  const updated = await pool.query<CustomerRow>(updateQuery, params);
  return mapCustomerRow(updated.rows[0]);
}

export async function deactivateCustomer(
  code: string,
  updatedBy?: string | null
): Promise<boolean> {
  const pool = await getDb();
  const result = await pool.query(
    `UPDATE "Customer"
     SET is_active = false,
         updated_at = NOW(),
         updated_by = COALESCE($2, updated_by)
     WHERE code = $1
     RETURNING id`,
    [normaliseCode(code), updatedBy ?? null]
  );
  return result.rowCount > 0;
}

export function maskStoredConnectionString(encrypted: string | null): string {
  if (!encrypted) return "";
  try {
    const decrypted = decryptConnectionString(encrypted);
    return maskConnectionString(decrypted);
  } catch {
    return "";
  }
}

async function runConnectionProbe(
  connectionString: string
): Promise<TestConnectionResult> {
  try {
    const config = parseSqlServerConnectionString(connectionString);
    if (!config.server || !config.database || !config.user) {
      return {
        status: "failed",
        error:
          "Connection string is missing required fields (server, database, user).",
      };
    }

    config.pool = {
      max: 2,
      min: 0,
      idleTimeoutMillis: 5000,
    };
    config.options = {
      ...config.options,
      requestTimeout: 15000,
      connectTimeout: 15000,
    };

    const pool = new sql.ConnectionPool(config);
    await pool.connect();

    try {
      const tableCounts = await pool
        .request()
        .query<{ dboCount: number; rptCount: number }>(
          `SELECT
             SUM(CASE WHEN TABLE_SCHEMA = 'dbo' THEN 1 ELSE 0 END) AS dboCount,
             SUM(CASE WHEN TABLE_SCHEMA = 'rpt' THEN 1 ELSE 0 END) AS rptCount
           FROM INFORMATION_SCHEMA.TABLES`
        );

      // Query Silhouette dbo.Version table for SchemaVersion
      let schemaVersion: string | null = null;
      let silhouetteVersion: string | null = null;

      try {
        const schemaVersionResult = await pool
          .request()
          .query<{ SchemaVersion: string }>(
            "SELECT TOP 1 SchemaVersion FROM dbo.Version ORDER BY SchemaVersion DESC"
          );

        if (schemaVersionResult.recordset[0]?.SchemaVersion) {
          schemaVersion = String(
            schemaVersionResult.recordset[0].SchemaVersion
          );
          silhouetteVersion =
            mapSchemaVersionToSilhouetteVersion(schemaVersion);
        }
      } catch (versionError) {
        // If dbo.Version table doesn't exist or query fails, continue without version
        console.warn(
          "Unable to detect Silhouette version from dbo.Version:",
          versionError
        );
      }

      return {
        status: "ok",
        silhouetteVersionDetected: silhouetteVersion,
        schemaVersionDetected: schemaVersion,
        details: {
          dboTablesDetected: tableCounts.recordset[0]?.dboCount ?? 0,
          rptTablesDetected: tableCounts.recordset[0]?.rptCount ?? 0,
        },
      };
    } finally {
      pool.close();
    }
  } catch (error: any) {
    return {
      status: "failed",
      error: error?.message ?? "Unable to connect to Silhouette database.",
    };
  }
}

export async function testCustomerConnection(
  code: string,
  overrideConnectionString?: string | null
): Promise<TestConnectionResult> {
  const pool = await getDb();
  const row = await fetchCustomerByCode(pool, normaliseCode(code));
  if (!row) {
    throw new ConnectionEncryptionError("Customer not found");
  }

  const connectionString =
    overrideConnectionString?.trim() && overrideConnectionString.length > 0
      ? overrideConnectionString.trim()
      : decryptConnectionString(row.db_connection_encrypted);

  const result = await runConnectionProbe(connectionString);

  if (result.status === "ok" && !overrideConnectionString) {
    await pool.query(
      `UPDATE "Customer"
       SET connection_status = 'ok',
           connection_last_verified_at = NOW(),
           connection_error = NULL
       WHERE id = $1`,
      [row.id]
    );
  } else if (result.status === "failed" && !overrideConnectionString) {
    await pool.query(
      `UPDATE "Customer"
       SET connection_status = 'failed',
           connection_last_verified_at = NOW(),
           connection_error = $2
       WHERE id = $1`,
      [row.id, result.error]
    );
  }

  return result;
}

export function serializeCustomerSummary(customer: CustomerSummary) {
  return {
    ...customer,
    connectionStatus: customer.connectionStatus,
    connectionLastVerifiedAt: customer.connectionLastVerifiedAt,
    connectionSummary: {
      status: customer.connectionStatus,
      lastVerifiedAt: customer.connectionLastVerifiedAt,
      error: customer.connectionError ?? undefined,
      masked: customer.connectionMasked,
    },
  };
}

export { ConnectionEncryptionError } from "@/lib/services/security/connection-encryption.service";

export async function previewCustomerAttributeSets(code: string) {
  const pool = await getDb();
  const row = await fetchCustomerByCode(pool, normaliseCode(code));
  if (!row) {
    return null;
  }

  const connectionString = decryptConnectionString(row.db_connection_encrypted);
  return fetchAttributeSets(connectionString);
}

export async function getCustomerConnectionString(
  code: string
): Promise<string | null> {
  const pool = await getDb();
  const row = await fetchCustomerByCode(pool, normaliseCode(code));
  if (!row) return null;

  try {
    return decryptConnectionString(row.db_connection_encrypted);
  } catch {
    return null;
  }
}
