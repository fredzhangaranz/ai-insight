import { NextRequest, NextResponse } from "next/server";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

// POST /api/ai/funnel/results - Store a result for a sub-question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subQuestionId, resultData } = body;
    if (!subQuestionId || typeof resultData === "undefined") {
      return NextResponse.json(
        { error: "subQuestionId and resultData are required." },
        { status: 400 }
      );
    }
    await FunnelStorage.storeQueryResult(subQuestionId, resultData);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/ai/funnel/results?subQuestionId=123 - Retrieve the latest result for a sub-question
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subQuestionId = Number(searchParams.get("subQuestionId"));
    if (!subQuestionId) {
      return NextResponse.json(
        { error: "subQuestionId is required as a query parameter." },
        { status: 400 }
      );
    }
    const result = await FunnelStorage.getQueryResult(subQuestionId);
    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
