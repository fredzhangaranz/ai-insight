import { NextRequest, NextResponse } from "next/server";

import {
  getTemplateById,
  TemplateDraftPayload,
  TemplateServiceError,
  TemplateValidationError,
  updateTemplateDraft,
} from "@/lib/services/template.service";

function parseTemplateId(id: string): number | null {
  const value = Number(id);
  return Number.isFinite(value) ? value : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const templateId = parseTemplateId(params.id);
  if (templateId === null) {
    return NextResponse.json(
      { message: "Invalid template id" },
      { status: 400 },
    );
  }

  try {
    const template = await getTemplateById(templateId);
    return NextResponse.json({ data: template });
  } catch (error: any) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status },
      );
    }
    console.error("Failed to fetch template details:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const templateId = parseTemplateId(params.id);
  if (templateId === null) {
    return NextResponse.json(
      { message: "Invalid template id" },
      { status: 400 },
    );
  }

  try {
    const payload = (await req.json()) as TemplateDraftPayload;
    const result = await updateTemplateDraft(templateId, payload);
    return NextResponse.json({
      data: result.template,
      warnings: result.warnings,
    });
  } catch (error: any) {
    if (error instanceof TemplateValidationError) {
      return NextResponse.json(
        {
          message: error.message,
          errors: error.validation.errors,
          warnings: error.validation.warnings,
        },
        { status: error.status },
      );
    }
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status },
      );
    }
    console.error("Failed to update template draft:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
