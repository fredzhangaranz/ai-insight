/**
 * GET /api/admin/data-gen/browse
 * Paginated, searchable, filterable browse of dbo.Patient, dbo.Wound, dbo.Series
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import {
  browse,
  type BrowseEntity,
  type BrowseFilter,
} from "@/lib/services/data-gen/browse.service";

const VALID_ENTITIES: BrowseEntity[] = ["patient", "wound", "assessment"];
const VALID_FILTERS: BrowseFilter[] = ["all", "generated", "incomplete"];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const customerId = searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId query parameter is required" },
        { status: 400 }
      );
    }

    const entity = searchParams.get("entity") as BrowseEntity | null;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
    const search = searchParams.get("search");
    const filter = (searchParams.get("filter") as BrowseFilter) ?? "all";

    if (!entity || !VALID_ENTITIES.includes(entity)) {
      return NextResponse.json(
        { error: "entity query parameter required: patient | wound | assessment" },
        { status: 400 }
      );
    }

    if (!VALID_FILTERS.includes(filter)) {
      return NextResponse.json(
        { error: "filter must be: all | generated | incomplete" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);
    const result = await browse(pool, entity, {
      page,
      pageSize,
      search: search ?? null,
      filter,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error browsing data:", error);
    return NextResponse.json(
      {
        error: "Failed to browse data",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
