/**
 * GET /api/admin/data-gen/stats
 * Returns data generation statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getDataGenStats } from "@/lib/services/data-gen/schema-discovery.service";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customerId = request.nextUrl.searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId query parameter is required" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);
    const stats = await getDataGenStats(pool);

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error("Error fetching data generation stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch data generation stats",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
