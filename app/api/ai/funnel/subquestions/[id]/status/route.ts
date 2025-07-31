import { NextRequest, NextResponse } from "next/server";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";
import type { SubQuestionStatus } from "@/lib/types/funnel";

// PUT /api/ai/funnel/subquestions/[id]/status - Update sub-question status
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status } = body;
    const id = Number(params.id);

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid sub-question ID." },
        { status: 400 }
      );
    }

    if (
      !status ||
      !["pending", "running", "completed", "failed"].includes(status)
    ) {
      return NextResponse.json(
        {
          error:
            "Valid status is required (pending, running, completed, failed).",
        },
        { status: 400 }
      );
    }

    await FunnelStorage.updateSubQuestionStatus(
      id,
      status as SubQuestionStatus
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
