import { NextRequest, NextResponse } from "next/server";

import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import {
  createTemplateDraft,
  listTemplates,
  TemplateDraftPayload,
  TemplateServiceError,
  TemplateValidationError,
} from "@/lib/services/template.service";

function parseArrayParam(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStatusParam(values?: string[]): ("Draft" | "Approved" | "Deprecated")[] | undefined {
  if (!values) return undefined;
  const allowed = new Set(["Draft", "Approved", "Deprecated"]);
  return values.filter((value): value is "Draft" | "Approved" | "Deprecated" =>
    allowed.has(value as any)
  );
}

export async function GET(req: NextRequest) {
  if (!isTemplateSystemEnabled()) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = parseStatusParam(parseArrayParam(searchParams.get("status")));
  const intent = parseArrayParam(searchParams.get("intent"));
  const tags = parseArrayParam(searchParams.get("tags"));
  const search = searchParams.get("q") ?? searchParams.get("search") ?? undefined;
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const result = await listTemplates({
    status: statusParam,
    intent,
    tags,
    search,
    limit: limitParam ? Number(limitParam) : undefined,
    offset: offsetParam ? Number(offsetParam) : undefined,
  });

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  if (!isTemplateSystemEnabled()) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  try {
    const payload = (await req.json()) as TemplateDraftPayload;
    const result = await createTemplateDraft(payload);
    return NextResponse.json(
      { data: result.template, warnings: result.warnings },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof TemplateValidationError) {
      return NextResponse.json(
        {
          message: error.message,
          errors: error.validation.errors,
          warnings: error.validation.warnings,
        },
        { status: error.status }
      );
    }
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error("Failed to create template draft:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
