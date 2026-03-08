/**
 * GET /api/admin/data-gen/lookups - List all dropdown fields and options
 * POST /api/admin/data-gen/lookups - Add new option
 * DELETE /api/admin/data-gen/lookups - Soft-delete option
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import {
  listAllLookupFields,
  addLookupOption,
  deleteLookupOption,
} from "@/lib/services/data-gen/lookups.service";

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
    const fields = await listAllLookupFields(pool);
    return NextResponse.json({ fields });
  } catch (error: unknown) {
    console.error("Error listing lookups:", error);
    return NextResponse.json(
      {
        error: "Failed to list lookup fields",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { attributeTypeId, text, code, customerId } = body;

    if (!attributeTypeId || !text || typeof text !== "string") {
      return NextResponse.json(
        { error: "attributeTypeId and text are required" },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);
    const result = await addLookupOption(
      pool,
      attributeTypeId,
      text,
      code ?? null
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error adding lookup option:", error);
    return NextResponse.json(
      {
        error: "Failed to add lookup option",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    const customerId = searchParams.get("customerId");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId query parameter is required" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);
    await deleteLookupOption(pool, id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting lookup option:", error);
    return NextResponse.json(
      {
        error: "Failed to delete lookup option",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
