import { NextRequest, NextResponse } from "next/server";
import * as sql from "mssql";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { parseSqlServerConnectionString } from "@/lib/utils/sqlserver";
import { mapSchemaVersionToSilhouetteVersion } from "@/lib/utils/silhouette-version-mapper";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: { connectionString: string };
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Request body must be valid JSON.");
  }

  if (
    !payload?.connectionString ||
    typeof payload.connectionString !== "string"
  ) {
    return createErrorResponse.validationError(
      "Connection string is required."
    );
  }

  try {
    const config = parseSqlServerConnectionString(payload.connectionString);

    if (!config.server || !config.database || !config.user) {
      return NextResponse.json({
        status: "failed",
        error:
          "Connection string is missing required fields (server, database, user).",
      });
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

      return NextResponse.json({
        status: "ok",
        silhouetteVersionDetected: silhouetteVersion,
        schemaVersionDetected: schemaVersion,
        details: {
          dboTablesDetected: tableCounts.recordset[0]?.dboCount ?? 0,
          rptTablesDetected: tableCounts.recordset[0]?.rptCount ?? 0,
        },
      });
    } finally {
      pool.close();
    }
  } catch (error: any) {
    return NextResponse.json({
      status: "failed",
      error: error?.message ?? "Unable to connect to Silhouette database.",
    });
  }
});
