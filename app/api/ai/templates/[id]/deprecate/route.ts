import { NextRequest, NextResponse } from "next/server";

import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import {
  deprecateTemplate,
  TemplateServiceError,
} from "@/lib/services/template.service";

function parseTemplateId(id: string): number | null {
  const value = Number(id);
  return Number.isFinite(value) ? value : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isTemplateSystemEnabled()) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  const templateId = parseTemplateId(params.id);
  if (templateId === null) {
    return NextResponse.json({ message: "Invalid template id" }, { status: 400 });
  }

  try {
    const template = await deprecateTemplate(templateId);
    return NextResponse.json({ data: template });
  } catch (error: any) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error("Failed to deprecate template:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
