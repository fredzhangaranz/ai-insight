// app/api/customers/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = await getInsightGenDbPool();
    const result = await pool.query(`
      SELECT
        id,
        code AS customer_code,
        name,
        is_active
      FROM "Customer"
      WHERE is_active = true
      ORDER BY name ASC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
