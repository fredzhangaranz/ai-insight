// app/api/insights/cache/stats/route.ts
// Cache Statistics API Endpoint
// Returns session cache statistics for monitoring

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionCacheService } from "@/lib/services/cache/session-cache.service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessionCache = getSessionCacheService();
    const stats = sessionCache.getStats();

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[/api/insights/cache/stats] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to get cache stats",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
