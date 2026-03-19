/**
 * GET /api/data-viewer/coverage
 * Returns data coverage statistics for specified columns
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next/auth";
import { authOptions } from "@/lib/auth";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

const ALLOWED_TABLE_PREFIXES = ["rpt.", "dbo."];

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const table = request.nextUrl.searchParams.get("table");
    const columns = request.nextUrl.searchParams.get("columns");

    if (!table) {
      return NextResponse.json(
        { error: "table query parameter is required" },
        { status: 400 }
      );
    }

    if (!columns) {
      return NextResponse.json(
        { error: "columns query parameter is required" },
        { status: 400 }
      );
    }

    // Validate table name (security check)
    const isAllowed = ALLOWED_TABLE_PREFIXES.some((prefix) =>
      table.startsWith(prefix)
    );
    if (!isAllowed) {
      return NextResponse.json(
        {
          error: `Table must start with one of: ${ALLOWED_TABLE_PREFIXES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Get customer connection string
    const connectionString = process.env.SILHOUETTE_DB_URL;
    if (!connectionString) {
      return NextResponse.json(
        { error: "Database connection not configured" },
        { status: 500 }
      );
    }

    const pool = await getSqlServerPool(connectionString);

    // Calculate coverage for each column
    const columnList = columns.split(",").map((c) => c.trim());
    const coverageStats: Record<
      string,
      { total: number; nonNull: number; coveragePct: number }
    > = {};

    for (const column of columnList) {
      // Validate column name (basic SQL injection prevention)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
        continue; // Skip invalid column names
      }

      try {
        const query = `
          SELECT 
            COUNT(*) as total,
            COUNT(${column}) as nonNull
          FROM ${table}
          WHERE isDeleted = 0
        `;

        const result = await pool.request().query(query);
        const { total, nonNull } = result.recordset[0];
        const coveragePct = total > 0 ? (nonNull / total) * 100 : 0;

        coverageStats[column] = {
          total,
          nonNull,
          coveragePct: parseFloat(coveragePct.toFixed(2)),
        };
      } catch (error) {
        console.warn(`Failed to get coverage for column ${column}:`, error);
      }
    }

    return NextResponse.json(coverageStats);
  } catch (error: any) {
    console.error("Error fetching coverage stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch coverage statistics",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
