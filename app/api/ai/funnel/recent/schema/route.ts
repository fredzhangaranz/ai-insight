import { NextResponse } from "next/server";
import {
  findMostRecentFunnelByKey,
} from "@/lib/services/funnel-storage.service";
import { SCHEMA_SCOPE_SENTINEL } from "@/lib/services/funnel-cache.service";

export async function GET() {
  try {
    const funnel = await findMostRecentFunnelByKey(SCHEMA_SCOPE_SENTINEL);
    if (!funnel) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ originalQuestion: funnel.originalQuestion });
  } catch (error: any) {
    console.error("Failed to load recent schema funnel question", error);
    return NextResponse.json(
      { message: "Failed to load recent schema question" },
      { status: 500 }
    );
  }
}
