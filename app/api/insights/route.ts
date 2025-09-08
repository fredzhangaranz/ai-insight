import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { insightService } from "@/lib/services/insight.service";

export const GET = withErrorHandling(async (req: NextRequest) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") as any;
  const formId = searchParams.get("formId") || undefined;
  const search = searchParams.get("search") || undefined;
  const list = await insightService.list({ scope, formId, search, activeOnly: true });
  return NextResponse.json({ items: list });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const body = await req.json();
  const created = await insightService.create(body);
  return NextResponse.json(created, { status: 201 });
});

