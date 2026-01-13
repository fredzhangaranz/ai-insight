// app/api/insights/cache/invalidate/route.ts
// Cache Invalidation API Endpoint
// Allows admin to invalidate cache entries

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionCacheService } from "@/lib/services/cache/session-cache.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { customerId, schemaVersion, clearAll } = await req.json();

    const sessionCache = getSessionCacheService();
    let count = 0;

    if (clearAll) {
      // Clear entire cache
      count = sessionCache.invalidate();
    } else {
      // Filter-based invalidation
      count = sessionCache.invalidate({
        customerId,
        schemaVersion,
      });
    }

    return NextResponse.json({
      success: true,
      entriesInvalidated: count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[/api/insights/cache/invalidate] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to invalidate cache",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
