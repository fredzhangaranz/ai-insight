import { NextRequest, NextResponse } from "next/server";

import {
  checkSimilarTemplates,
  TemplateDraft,
} from "@/lib/services/template-similarity.service";

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

  const name = extractStringField(body, "name");
  const intent = extractStringField(body, "intent");

  if (!name) {
    return NextResponse.json(
      { message: "'name' is required" },
      { status: 400 },
    );
  }

  if (!intent) {
    return NextResponse.json(
      { message: "'intent' is required" },
      { status: 400 },
    );
  }

  const draft: TemplateDraft = {
    name,
    intent,
    description: extractOptionalString(body.description),
    keywords: extractOptionalStringArray(body.keywords),
    tags: extractOptionalStringArray(body.tags),
  };

  try {
    const similar = await checkSimilarTemplates(draft);
    return NextResponse.json({ similar });
  } catch (error) {
    console.error("Failed to check for duplicate templates:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

function extractStringField(source: any, key: string): string | undefined {
  const value = source?.[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function extractOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function extractOptionalStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.length > 0) {
    const filtered = value
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
    return filtered.length > 0 ? filtered : undefined;
  }
  return undefined;
}
