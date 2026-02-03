import { NextRequest, NextResponse } from "next/server";

import { suggestTemplates } from "@/lib/services/template.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question =
      typeof body?.question === "string" ? body.question.trim() : "";
    const limit = body?.limit ? Number(body.limit) : 5;

    if (!question) {
      return NextResponse.json(
        { message: "'question' is required" },
        { status: 400 },
      );
    }

    const matches = await suggestTemplates(question, limit);
    return NextResponse.json({ data: matches });
  } catch (error) {
    console.error("Failed to suggest templates:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
