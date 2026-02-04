import { NextRequest, NextResponse } from "next/server";

import {
  extractTemplateDraft,
  type TemplateExtractionInput,
} from "@/lib/services/template-extraction.service";
import { TemplateServiceError } from "@/lib/services/template.service";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json(
      { message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const questionText = extractStringField(body, ["questionText", "question"]);
  const sqlQuery = extractStringField(body, ["sqlQuery", "sql"]);
  const schemaContext = extractOptionalString(body?.schemaContext);
  const modelId = extractOptionalString(body?.modelId);

  if (!questionText) {
    return NextResponse.json(
      { message: "'questionText' is required" },
      { status: 400 },
    );
  }

  if (!sqlQuery) {
    return NextResponse.json(
      { message: "'sqlQuery' is required" },
      { status: 400 },
    );
  }

  const input: TemplateExtractionInput = {
    questionText,
    sqlQuery,
    schemaContext,
    modelId,
  };

  try {
    const result = await extractTemplateDraft(input);
    return NextResponse.json({
      data: result.draft,
      validation: result.validation,
      warnings: result.warnings,
      modelId: result.modelId,
    });
  } catch (error: any) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("Failed to extract template draft:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

function extractStringField(source: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function extractOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
