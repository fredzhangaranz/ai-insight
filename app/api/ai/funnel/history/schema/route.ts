import { NextResponse } from "next/server";
import {
  listFunnelsByAssessmentKey,
} from "@/lib/services/funnel-storage.service";
import { SCHEMA_SCOPE_SENTINEL } from "@/lib/services/funnel-cache.service";

export async function GET() {
  try {
    const funnels = await listFunnelsByAssessmentKey(SCHEMA_SCOPE_SENTINEL, 100);
    return NextResponse.json(
      funnels.map((funnel) => ({
        id: funnel.id,
        originalQuestion: funnel.originalQuestion,
        status: funnel.status,
        createdDate: funnel.createdDate,
        lastModifiedDate: funnel.lastModifiedDate,
      }))
    );
  } catch (error: any) {
    console.error("Failed to load schema funnel history", error);
    return NextResponse.json(
      { message: "Failed to load schema history" },
      { status: 500 }
    );
  }
}
