/**
 * GET /api/admin/data-gen/schema/forms
 * Returns published assessment form versions
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getPublishedForms } from "@/lib/services/data-gen/schema-discovery.service";

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
    const forms = await getPublishedForms(pool);

    return NextResponse.json(forms);
  } catch (error: any) {
    console.error("Error fetching published forms:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch published forms",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
