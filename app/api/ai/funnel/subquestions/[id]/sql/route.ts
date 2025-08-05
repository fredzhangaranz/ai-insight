import { NextRequest, NextResponse } from "next/server";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

// PUT /api/ai/funnel/subquestions/[id]/sql - Update sub-question SQL
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { sqlQuery, sqlExplanation, sqlValidationNotes, sqlMatchedTemplate } =
      body;
    const id = Number(params.id);

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid sub-question ID." },
        { status: 400 }
      );
    }

    if (!sqlQuery || typeof sqlQuery !== "string") {
      return NextResponse.json(
        { error: "sqlQuery is required and must be a string." },
        { status: 400 }
      );
    }

    await FunnelStorage.updateSubQuestionSql(id, sqlQuery, {
      sqlExplanation,
      sqlValidationNotes,
      sqlMatchedTemplate,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
