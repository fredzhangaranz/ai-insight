import { NextRequest, NextResponse } from "next/server";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

// POST /api/ai/funnel/subquestions - Add a sub-question to a funnel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { funnelId, questionText, order, sqlQuery } = body;
    if (!funnelId || !questionText || typeof order !== "number") {
      return NextResponse.json(
        { error: "funnelId, questionText, and order are required." },
        { status: 400 }
      );
    }
    const subQuestion = await FunnelStorage.addSubQuestion(funnelId, {
      questionText,
      order,
      sqlQuery,
    });
    return NextResponse.json(subQuestion);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/ai/funnel/subquestions?funnelId=123 - List all sub-questions for a funnel
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const funnelId = Number(searchParams.get("funnelId"));
    if (!funnelId) {
      return NextResponse.json(
        { error: "funnelId is required as a query parameter." },
        { status: 400 }
      );
    }
    const subQuestions = await FunnelStorage.getSubQuestions(funnelId);
    return NextResponse.json(subQuestions);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
