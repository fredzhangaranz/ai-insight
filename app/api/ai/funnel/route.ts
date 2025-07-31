import { NextRequest, NextResponse } from "next/server";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

// POST /api/ai/funnel - Create a new funnel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assessmentFormVersionFk, originalQuestion } = body;
    if (!assessmentFormVersionFk || !originalQuestion) {
      return NextResponse.json(
        { error: "assessmentFormVersionFk and originalQuestion are required." },
        { status: 400 }
      );
    }
    const funnel = await FunnelStorage.createFunnel({
      assessmentFormVersionFk,
      originalQuestion,
    });
    return NextResponse.json(funnel);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/ai/funnel - List all funnels
export async function GET() {
  try {
    const funnels = await FunnelStorage.listFunnels();
    return NextResponse.json(funnels);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
