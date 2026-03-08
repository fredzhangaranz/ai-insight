/**
 * GET /api/admin/data-gen/schema/forms/[id]
 * Returns form field definitions with options and constraints
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getFormFields } from "@/lib/services/data-gen/schema-discovery.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: "Assessment form ID is required" },
        { status: 400 }
      );
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
    const fields = await getFormFields(pool, id);

    return NextResponse.json(fields);
  } catch (error: any) {
    console.error("Error fetching form fields:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch form fields",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
