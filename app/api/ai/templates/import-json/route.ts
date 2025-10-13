import { NextRequest, NextResponse } from "next/server";

import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import {
  importTemplatesFromJson,
  TemplateServiceError,
} from "@/lib/services/template.service";

export async function POST(_req: NextRequest) {
  if (!isTemplateSystemEnabled()) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  try {
    const stats = await importTemplatesFromJson();
    return NextResponse.json({ data: stats });
  } catch (error: any) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error("Failed to import templates from JSON:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
