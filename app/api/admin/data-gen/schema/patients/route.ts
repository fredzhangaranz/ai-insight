/**
 * GET /api/admin/data-gen/schema/patients
 * Returns patient schema with coverage statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getPatientSchema } from "@/lib/services/data-gen/schema-discovery.service";

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
    const schema = await getPatientSchema(pool);

    return NextResponse.json(schema);
  } catch (error: any) {
    console.error("Error fetching patient schema:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch patient schema",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
